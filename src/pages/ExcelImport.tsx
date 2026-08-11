import { useState, useRef, ChangeEvent, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { doc, getDoc, setDoc, collection, doc as firestoreDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { defaultFormFields, FormField } from '../lib/schema';
import { normalizePatientRecord } from '../lib/codebook';
import { readWorkbookFromBuffer } from '../lib/excelEncoding';
import { logAudit } from '../lib/audit';
import { 
  signInWithGoogleDrive, 
  listGoogleDriveSpreadsheets, 
  downloadDriveFileAsArrayBuffer, 
  extractDriveFileId, 
  getDriveFileMetadata, 
  getCachedDriveAccessToken,
  DriveFileItem 
} from '../lib/google-drive';
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, ArrowRight, Download, RefreshCw, Layers, Database, Sparkles, FileText, Check, Info, Cloud, Globe, Search, X, Loader2, ExternalLink, FileCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Helper to convert Excel column letter to 0-based index (e.g., A -> 0, B -> 1, Z -> 25, AA -> 26, DZ -> 129)
function colLetterToIndex(colStr: string): number {
  let str = colStr.toUpperCase().trim();
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum = sum * 26 + (str.charCodeAt(i) - 64);
  }
  return sum - 1;
}

// Helper to convert 0-based index to Excel column letter (e.g., 0 -> A, 1 -> B, 129 -> DZ)
function indexToColLetter(index: number): string {
  let temp = index + 1;
  let letter = '';
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

// Excel cell comments/notes often carry the real variable codebook (e.g. "1: Yok, 2: Var"),
// but also revision-history noise ("======", "ID#...", "Yazar   (2022-01-07 ...)"). Strip that
// noise and keep just the actual codebook/description lines.
function extractCommentCodebook(cell: XLSX.CellObject | undefined): string {
  const comments = (cell as any)?.c as { t?: string }[] | undefined;
  if (!comments || !comments.length) return '';
  const raw = comments.map((c) => c.t || '').join('\n');
  const kept = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^=+$/.test(line) || /^-+$/.test(line)) return false;
      if (/^ID#/.test(line)) return false;
      if (/\(\d{4}-\d{2}-\d{2}/.test(line)) return false; // "Yazar   (2022-01-07 05:49:58)"
      if (/^[^:]+:$/.test(line)) return false; // bare "Süleyman Atalay:" author signature
      return true;
    });
  return kept.join(' | ');
}

// Helper to normalize string to safe field ID
function textToFieldId(text: string, colIndex: number): string {
  if (!text || !text.trim()) {
    return `col_${indexToColLetter(colIndex).toLowerCase()}`;
  }
  // Turkish uppercase letters must be folded to ASCII *before* a plain .toLowerCase():
  // JS's locale-independent toLowerCase() turns 'İ' into 'i' + a combining dot above
  // (U+0307), not a plain 'i', which then survives as a stray '_' in the id below.
  const str = text
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/Ç/g, 'c')
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  
  return `excel_${indexToColLetter(colIndex).toLowerCase()}_${str.substring(0, 30)}`;
}

export function ExcelImport() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  
  // Row & Column configuration defaults matching user request
  const [headerRow, setHeaderRow] = useState<number>(3); // 1-indexed (Row 3 header)
  const [startRow, setStartRow] = useState<number>(4); // 1-indexed (Row 4 data start)
  const [endRow, setEndRow] = useState<number>(369); // 1-indexed (Row 369 data end)
  const [startCol, setStartCol] = useState<string>('B'); // Column B
  const [endCol, setEndCol] = useState<string>('DZ'); // Column DZ

  // Parsed Data state
  const [headers, setHeaders] = useState<{ colLetter: string; colIndex: number; title: string; fieldId: string; explanation?: string }[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const [importCompleted, setImportCompleted] = useState(false);
  const [schemaAllocated, setSchemaAllocated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Google Drive state
  const [driveToken, setDriveToken] = useState<string | null>(getCachedDriveAccessToken());
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveSearchQuery, setDriveSearchQuery] = useState('');
  const [driveUrlInput, setDriveUrlInput] = useState('https://docs.google.com/spreadsheets/d/10UvS3BKgWFlJlppRFHkVE9ALGuLNEibDu9Kq3bqL8VE/edit?usp=sharing');
  const [isFetchingDriveUrl, setIsFetchingDriveUrl] = useState(false);

  const handleDriveSignInAndFetch = async () => {
    setIsLoadingDrive(true);
    setErrorMessage(null);
    try {
      const { accessToken } = await signInWithGoogleDrive();
      setDriveToken(accessToken);
      const files = await listGoogleDriveSpreadsheets(accessToken, driveSearchQuery);
      setDriveFiles(files);
      setShowDriveModal(true);
    } catch (err: any) {
      console.error('Google Drive oturum/dosya alma hatası:', err);
      setErrorMessage(`Google Drive bağlantı hatası: ${err.message || err}`);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSearchDriveFiles = async (queryStr: string) => {
    setDriveSearchQuery(queryStr);
    if (!driveToken) return;
    setIsLoadingDrive(true);
    try {
      const files = await listGoogleDriveSpreadsheets(driveToken, queryStr);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Google Drive arama hatası:', err);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSelectDriveFile = async (item: DriveFileItem) => {
    let token = driveToken || getCachedDriveAccessToken();
    if (!token) {
      try {
        const authRes = await signInWithGoogleDrive();
        token = authRes.accessToken;
        setDriveToken(token);
      } catch (err: any) {
        setErrorMessage('Google Drive erişim jetonu alınamadı: ' + err.message);
        return;
      }
    }

    setIsLoadingDrive(true);
    setErrorMessage(null);
    setShowDriveModal(false);

    try {
      const { arrayBuffer } = await downloadDriveFileAsArrayBuffer(item.id, item.mimeType, token);
      const wb = readWorkbookFromBuffer(arrayBuffer, item.name, item.mimeType);

      const pseudoFile = new File([arrayBuffer], item.name, { type: item.mimeType });
      setFile(pseudoFile);
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      setImportCompleted(false);
      setSchemaAllocated(false);

      if (wb.SheetNames.length > 0) {
        const firstSheet = wb.SheetNames[0];
        setSelectedSheet(firstSheet);
        parseSheet(wb, firstSheet, headerRow, startRow, endRow, startCol, endCol);
      }
    } catch (err: any) {
      console.error('Google Drive dosya indirme hatası:', err);
      setErrorMessage(`Google Drive dosya aktarımı başarısız: ${err.message}`);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleImportFromDriveUrl = async () => {
    if (!driveUrlInput.trim()) {
      setErrorMessage('Lütfen geçerli bir Google Drive dosya bağlantısı (URL) veya Dosya ID girin.');
      return;
    }

    const fileId = extractDriveFileId(driveUrlInput);
    if (!fileId) {
      setErrorMessage('Google Drive dosya ID bulunamadı.');
      return;
    }

    let token = driveToken || getCachedDriveAccessToken();
    if (!token) {
      try {
        const authRes = await signInWithGoogleDrive();
        token = authRes.accessToken;
        setDriveToken(token);
      } catch (err: any) {
        setErrorMessage('Google Drive erişimi için Google hesabı ile giriş yapılması gereklidir: ' + err.message);
        return;
      }
    }

    setIsFetchingDriveUrl(true);
    setErrorMessage(null);

    try {
      const meta = await getDriveFileMetadata(fileId, token);
      const { arrayBuffer } = await downloadDriveFileAsArrayBuffer(fileId, meta.mimeType || 'application/vnd.google-apps.spreadsheet', token);
      const wb = readWorkbookFromBuffer(arrayBuffer, meta.name || 'Google_Drive_File.xlsx', meta.mimeType);

      const pseudoFile = new File([arrayBuffer], meta.name || 'Google_Drive_File.xlsx');
      setFile(pseudoFile);
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);
      setImportCompleted(false);
      setSchemaAllocated(false);

      if (wb.SheetNames.length > 0) {
        const firstSheet = wb.SheetNames[0];
        setSelectedSheet(firstSheet);
        parseSheet(wb, firstSheet, headerRow, startRow, endRow, startCol, endCol);
      }
    } catch (err: any) {
      console.error('Google Drive URL aktarım hatası:', err);
      setErrorMessage(`Google Drive bağlantısından veri çekilemedi: ${err.message}`);
    } finally {
      setIsFetchingDriveUrl(false);
    }
  };

  // 1. Handle File Upload
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setErrorMessage(null);
    setImportCompleted(false);
    setSchemaAllocated(false);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const wb = readWorkbookFromBuffer(arrayBuffer, uploadedFile.name, uploadedFile.type);
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        if (wb.SheetNames.length > 0) {
          const firstSheet = wb.SheetNames[0];
          setSelectedSheet(firstSheet);
          parseSheet(wb, firstSheet, headerRow, startRow, endRow, startCol, endCol);
        }
      } catch (err: any) {
        console.error('Excel okuma hatası:', err);
        setErrorMessage('Excel dosyası okunamadı. Lütfen geçerli bir .xlsx veya .xls dosyası yükleyin.');
      }
    };
    reader.readAsArrayBuffer(uploadedFile);
  };

  // Parse Excel Sheet with configured bounds
  const parseSheet = (
    wb: XLSX.WorkBook,
    sheetName: string,
    hRow: number,
    sRow: number,
    eRow: number,
    sCol: string,
    eCol: string
  ) => {
    const worksheet = wb.Sheets[sheetName];
    if (!worksheet) return;

    const startCIdx = colLetterToIndex(sCol);
    const endCIdx = colLetterToIndex(eCol);

    // Parse Headers and Row 1/2 Column Codebook Descriptions
    const detectedHeaders: { colLetter: string; colIndex: number; title: string; fieldId: string; explanation?: string }[] = [];
    for (let c = startCIdx; c <= endCIdx; c++) {
      const colLetter = indexToColLetter(c);
      const cellAddress = XLSX.utils.encode_cell({ r: hRow - 1, c }); // 0-indexed row
      const cell = worksheet[cellAddress];
      let title = cell ? String(cell.v).trim() : `Kolon ${colLetter}`;
      if (!title) title = `Kolon ${colLetter}`;

      // Extract Row 1 & Row 2 explanation descriptions if available
      const cellR1 = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
      const cellR2 = worksheet[XLSX.utils.encode_cell({ r: 1, c })];
      const expl1 = cellR1 && cellR1.v ? String(cellR1.v).trim() : '';
      const expl2 = cellR2 && cellR2.v ? String(cellR2.v).trim() : '';

      let explanation = [expl1, expl2].filter(Boolean).join(' | ');

      // The real variable codebook (e.g. "1: Yok, 2: Var") is usually attached as an Excel
      // cell *comment/note* on the header cell, not as plain text in a row. Pull it in too.
      const commentText = extractCommentCodebook(cell) || extractCommentCodebook(cellR1) || extractCommentCodebook(cellR2);
      if (commentText) {
        explanation = explanation ? `${explanation} | ${commentText}` : commentText;
      }

      // Codebook fallback mapping for known columns in mide Excel
      if (colLetter === 'M' && (!explanation || explanation.length < 5)) {
        explanation = '1: Polipoid (Fungat), 2: Ülserofungat, 3: Ülseroinfiltratif, 4: Diffüz İnfiltratif (Linitis Plastika), 5: Unclassified / Sınıflandırılamayan';
      }

      detectedHeaders.push({
        colLetter,
        colIndex: c,
        title,
        fieldId: textToFieldId(title, c),
        explanation
      });
    }
    setHeaders(detectedHeaders);

    // Parse Rows (from startRow to endRow)
    const rows: Record<string, any>[] = [];
    for (let r = sRow - 1; r <= eRow - 1; r++) { // 0-indexed row
      const rowData: Record<string, any> = { _excelRowNumber: r + 1 };
      let hasValue = false;

      detectedHeaders.forEach((h) => {
        const cellAddress = XLSX.utils.encode_cell({ r, c: h.colIndex });
        const cell = worksheet[cellAddress];
        let val = cell ? cell.v : null;

        if (cell && cell.t === 'd') {
          // Format date if cell type is date
          val = cell.v ? new Date(cell.v).toISOString().split('T')[0] : null;
        }

        if (val !== null && val !== undefined && String(val).trim() !== '') {
          hasValue = true;
          rowData[h.fieldId] = typeof val === 'string' ? val.trim() : val;
        } else {
          rowData[h.fieldId] = '';
        }
      });

      // Include row if it contains data or within row range
      if (hasValue || r + 1 <= eRow) {
        rows.push(rowData);
      }
    }
    setParsedRows(rows);
  };

  // Re-parse when configuration changes
  const handleConfigChange = () => {
    if (workbook && selectedSheet) {
      parseSheet(workbook, selectedSheet, headerRow, startRow, endRow, startCol, endCol);
    }
  };

  // 2. Step 1: Allocate All Excel Columns into Form Schema (B to DZ)
  const handleAllocateSchema = async (silent: boolean = false) => {
    if (headers.length === 0) {
      if (!silent) alert('Lütfen önce bir Excel dosyası yükleyin ve kolonları okutun.');
      return;
    }

    setIsProcessing(true);
    try {
      // Get existing schema from Firestore or default
      const schemaRef = doc(db, 'config', 'form_schema');
      const snap = await getDoc(schemaRef);
      let existingFields: FormField[] = defaultFormFields;
      if (snap.exists() && snap.data().fields) {
        existingFields = snap.data().fields;
      }

      const updatedFields = [...existingFields];
      let addedCount = 0;

      headers.forEach((h) => {
        // Check if field with this ID or label or colLetter exists
        const existingIdx = updatedFields.findIndex(
          (f) => f.id === h.fieldId || f.label.toLowerCase() === h.title.toLowerCase() || f.label.startsWith(`[${h.colLetter}]`)
        );

        const explText = h.explanation 
          ? `(${h.colLetter}) ${h.title}. ${h.explanation}`
          : `(${h.colLetter}) ${h.title}`;

        if (existingIdx !== -1) {
          const existingField = updatedFields[existingIdx];
          
          let newLabel = existingField.label;
          if (!newLabel.startsWith(`(${h.colLetter})`)) {
            newLabel = `(${h.colLetter}) ${newLabel}`;
          }

          if (newLabel !== existingField.label) {
            updatedFields[existingIdx] = {
              ...existingField,
              label: newLabel
            };
          }
        } else {
          updatedFields.push({
            id: h.fieldId,
            label: explText,
            type: 'text',
            category: 'Excel İçe Aktarılan Değişkenler (B-DZ)',
            active: true
          });
          addedCount++;
        }
      });

      // Save updated schema back to Firestore
      await setDoc(schemaRef, { fields: updatedFields });
      setSchemaAllocated(true);
      await logAudit('GÜNCELLEME', 'FORM_ŞEMASI', 'Excel_B_DZ', `${addedCount} yeni Excel kolonu form şemasına tahsis edildi`);
      if (!silent) alert(`BAŞARILI! ${headers.length} adete kadar kolon (B-DZ) Hasta Kayıt Formunda alan olarak yer aldı (${addedCount} yeni alan eklendi).`);
    } catch (err: any) {
      console.error('Şema tahsis hatası:', err);
      if (!silent) alert('Form şeması güncellenirken bir hata oluştu: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Step 2: Import All Patient Records (Rows 4 to 369) into Database
  const handleImportPatients = async () => {
    if (parsedRows.length === 0) {
      alert('Aktarılacak hasta verisi bulunamadı.');
      return;
    }

    setIsProcessing(true);
    setImportProgress({ current: 0, total: parsedRows.length, message: 'Şema tahsis ediliyor (Adım 1)...' });
    
    // Auto-run schema allocation if not yet done
    if (!schemaAllocated) {
       await handleAllocateSchema(true);
    }

    setImportProgress({ current: 0, total: parsedRows.length, message: 'Hasta kayıtları hazırlanıyor...' });

    try {
      const userEmail = auth.currentUser?.email || 'sistem@gastro.gen.tr';
      const now = new Date().toISOString();

      // Chunk batch writes (Firestore supports max 500 writes per batch)
      const batchSize = 100;
      let totalImported = 0;

      for (let i = 0; i < parsedRows.length; i += batchSize) {
        const chunk = parsedRows.slice(i, i + batchSize);
        const batch = writeBatch(db);

        chunk.forEach((row, idx) => {
          const globalIdx = i + idx + 1;
          const patientDocRef = firestoreDoc(collection(db, 'patients'));
          
          // Research code auto format (e.g. GST-001, GST-002...) or read from first col
          const researchIdCol = row[headers[0]?.fieldId] || row[headers[1]?.fieldId];
          const researchId = (typeof researchIdCol === 'string' && researchIdCol.startsWith('GST-')) 
            ? researchIdCol 
            : `GST-${String(globalIdx).padStart(3, '0')}`;

          const rawData: Record<string, any> = {
            ...row,
            research_id: researchId,
            createdAt: now,
            createdBy: userEmail,
            source: 'Excel_B_DZ_Aktarimi',
            excelRowNumber: row._excelRowNumber
          };

          const patientData = normalizePatientRecord(rawData);

          batch.set(patientDocRef, patientData);
        });

        await batch.commit();
        totalImported += chunk.length;
        setImportProgress({
          current: totalImported,
          total: parsedRows.length,
          message: `${totalImported} / ${parsedRows.length} hasta kaydı aktarıldı...`
        });
      }

      setImportCompleted(true);
      await logAudit('İÇE_AKTARMA', 'HASTA_VERİTABANI', 'Excel_B_DZ', `${totalImported} adet hasta kaydı (Satır 4-369) başarıyla içe aktarıldı.`);
      alert(`İŞLEM TAMAMLANDI! Toplam ${totalImported} hasta kaydı sisteme başarıyla aktarıldı.`);
    } catch (err: any) {
      console.error('Hasta aktarım hatası:', err);
      alert('Aktarım sırasında hata oluştu: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Generate & Download Sample B-DZ Excel Template
  const handleDownloadSampleExcel = () => {
    const sampleHeaders: string[] = [];
    const sampleCols: string[] = [];

    // Create 129 column headers (B to DZ)
    const startCIdx = colLetterToIndex('B');
    const endCIdx = colLetterToIndex('DZ');

    for (let c = startCIdx; c <= endCIdx; c++) {
      const letter = indexToColLetter(c);
      sampleCols.push(letter);
      sampleHeaders.push(`${letter} - Degisken_${letter}`);
    }

    // Row 1 & 2 Title/Meta
    const sheetData: any[][] = [
      ['Gastrik Kanser Araştırma Grubu - Hasta Veri Seti (Kolon B - DZ)'],
      ['Not: Satır 3 Kolon Başlıkları, Satır 4 - 369 Hasta Kayıtlarıdır'],
      sampleHeaders
    ];

    // Add sample rows 4 to 10
    for (let r = 4; r <= 15; r++) {
      const sampleRow: any[] = [];
      sampleCols.forEach((col, idx) => {
        if (idx === 0) sampleRow.push(`GST-${String(r - 3).padStart(3, '0')}`); // Col B
        else if (idx === 1) sampleRow.push(50 + (r % 25)); // Col C (Age)
        else if (idx === 2) sampleRow.push(r % 2 === 0 ? 'Erkek' : 'Kadın'); // Col D (Gender)
        else sampleRow.push(`Veri_${col}_H${r - 3}`);
      });
      sheetData.push(sampleRow);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasta_Verileri_B_DZ');
    XLSX.writeFile(wb, 'Gastrik_Kanser_Ornek_Veri_B_DZ.xlsx');
  };

  return (
    <div className="space-y-8 pb-24 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl border border-blue-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs font-semibold">
              <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              <span>Excel Toplu Veri & Şema Aktarım Modülü</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Excel Veri Seti Aktarımı (Kolon B – DZ & Satır 4 – 369)
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Yükleyeceğiniz Excel dosyasındaki tüm kolonlar (B'den DZ'ye kadar) hastalar için form alanlarına otomatik dönüştürülür ve Satır 4 ile 369 arasındaki tüm hasta kayıtları eksiksiz veritabanına işlenir.
            </p>
          </div>

          <button
            onClick={handleDownloadSampleExcel}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-semibold transition-all backdrop-blur-xs shrink-0"
          >
            <Download className="w-4 h-4 text-blue-300" />
            Örnek B-DZ Excel Şablonu İndir
          </button>
        </div>
      </div>

      {/* Step 1: Upload File & Adjust Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Box */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            1. Excel / CSV Dosyası Seçin veya Sürükleyin
          </h2>

          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-xs">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            {file ? (
              <div>
                <p className="text-sm font-bold text-slate-800">{file.name}</p>
                <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB — Tıkla ve Değiştir</p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                  Excel veya CSV dosyanızı buraya bırakın veya tıklayın
                </p>
                <p className="text-xs text-slate-500 mt-1">Desteklenen formatlar: .xlsx, .xls, .csv (Tüm Kolonlar B-DZ okunur)</p>
              </div>
            )}
          </div>

          {/* Google Drive Direct Integration Section */}
          <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-emerald-50/80 rounded-2xl p-4 border border-blue-200/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white text-emerald-600 rounded-xl shadow-xs flex items-center justify-center border border-emerald-100 shrink-0">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span>Google Drive / Sheets İle İçe Aktar</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">CANLI</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Google Drive hesabınızdan veya paylaşılan Excel/Tablo bağlantısından doğrudan yükleyin</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDriveSignInAndFetch}
                disabled={isLoadingDrive}
                className="bg-white hover:bg-slate-50 text-slate-700 hover:text-blue-600 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 shadow-xs flex items-center gap-2 transition-all shrink-0 disabled:opacity-50"
              >
                {isLoadingDrive ? (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                )}
                <span>Drive Dosyalarından Seç</span>
              </button>
            </div>

            {/* URL Input Bar */}
            <div className="flex gap-2 pt-1">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Google Drive veya Google Sheets Bağlantısını (URL) yapıştırın..."
                  value={driveUrlInput}
                  onChange={(e) => setDriveUrlInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 font-mono text-slate-700"
                />
              </div>
              <button
                type="button"
                onClick={handleImportFromDriveUrl}
                disabled={isFetchingDriveUrl || !driveUrlInput.trim()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shrink-0"
              >
                {isFetchingDriveUrl ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Çekiliyor...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Bağlantıdan Yükle</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {sheetNames.length > 1 && (
            <div className="flex items-center gap-3 pt-2">
              <label className="text-xs font-semibold text-slate-700">Çalışma Sayfası (Sheet):</label>
              <select
                value={selectedSheet}
                onChange={(e) => {
                  setSelectedSheet(e.target.value);
                  if (workbook) parseSheet(workbook, e.target.value, headerRow, startRow, endRow, startCol, endCol);
                }}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-white"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Range Configuration Settings */}
        <div className="bg-white rounded-2xl p-6 shadow-xs border border-slate-200 space-y-4">
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            Satır & Kolon Ayarları
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Başlık Satırı (Header Row):</label>
              <input
                type="number"
                min={1}
                value={headerRow}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setHeaderRow(val);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Başlangıç Satırı:</label>
                <input
                  type="number"
                  min={1}
                  value={startRow}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setStartRow(val);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Bitiş Satırı:</label>
                <input
                  type="number"
                  min={1}
                  value={endRow}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 1;
                    setEndRow(val);
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">İlk Kolon (Harf):</label>
                <input
                  type="text"
                  value={startCol}
                  onChange={(e) => setStartCol(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 uppercase font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Son Kolon (Harf):</label>
                <input
                  type="text"
                  value={endCol}
                  onChange={(e) => setEndCol(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 uppercase font-mono font-semibold"
                />
              </div>
            </div>

            <button
              onClick={handleConfigChange}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Aralığı Yeniden Hesapla
            </button>
          </div>
        </div>
      </div>

      {/* Action Controls & Summary - ALWAYS VISIBLE */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              İşlem Adımları (1. Adım Şema Tahsisi & 2. Adım Veri Aktarımı)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {headers.length > 0
                ? `${headers.length} Kolon (${startCol}–${endCol}) ve ${parsedRows.length} Hasta Kaydı (Satır ${startRow}–${endRow}) hazır.`
                : 'Lütfen yukarıdaki alandan Excel dosyanızı seçin veya aşağıdaki butonlara tıklayın.'}
            </p>
          </div>

          {!file && (
            <button
              onClick={handleDownloadSampleExcel}
              className="px-3.5 py-1.5 rounded-xl bg-blue-900/50 hover:bg-blue-800 text-blue-200 border border-blue-700/50 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Örnek Excel Şablonu İndir (.xlsx)
            </button>
          )}
        </div>

        {headers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-2 text-center sm:text-left">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <p className="text-xs text-slate-400">Tespit Edilen Kolon Sayısı</p>
              <p className="text-xl font-black text-blue-400">{headers.length} Kolon ({startCol} – {endCol})</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <p className="text-xs text-slate-400">Aktarılacak Hasta Kayıt Sayısı</p>
              <p className="text-xl font-black text-emerald-400">{parsedRows.length} Hasta (Satır {startRow} – {endRow})</p>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
              <p className="text-xs text-slate-400">Form Şeması Durumu</p>
              <p className="text-sm font-bold text-slate-200 mt-1">
                {schemaAllocated ? (
                  <span className="inline-flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" /> Form Şemasına Tahsis Edildi
                  </span>
                ) : (
                  <span className="text-amber-400">Şemaya Tahsis Edilmesi Bekleniyor</span>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-blue-950/40 border border-blue-800/40 rounded-xl text-xs text-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <span>Henüz dosya seçilmedi. Aşağıdaki butonlara tıkladığınızda dosya seçim ekranı otomatik açılacaktır.</span>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors shrink-0"
            >
              Excel Dosyası Seç
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          {/* Step 1 Button */}
          <button
            onClick={() => {
              if (headers.length === 0) {
                fileInputRef.current?.click();
              } else {
                handleAllocateSchema();
              }
            }}
            disabled={isProcessing}
            className={`flex-1 py-4 px-6 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2.5 shadow-lg ${
              schemaAllocated
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-blue-600 hover:bg-blue-500 text-white ring-2 ring-blue-400/30'
            }`}
          >
            <Sparkles className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <div className="font-extrabold">1. ADIM: Kolonları Form Şemasına Tahsis Et (B-DZ)</div>
              <div className="text-[11px] font-normal opacity-90">
                {headers.length > 0 ? `${headers.length} kolonu hasta formuna alan olarak ekler` : 'Tıklayın ve Excel dosyanızı seçip kolonları alanlara dönüştürün'}
              </div>
            </div>
          </button>

          {/* Step 2 Button */}
          <button
            onClick={() => {
              if (headers.length === 0) {
                fileInputRef.current?.click();
              } else {
                handleImportPatients();
              }
            }}
            disabled={isProcessing}
            className="flex-1 py-4 px-6 rounded-xl text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-2.5 shadow-lg ring-2 ring-emerald-400/30"
          >
            <Database className="w-5 h-5 shrink-0" />
            <div className="text-left">
              <div className="font-extrabold">2. ADIM: tüm Hasta Bilgilerini Yazılıma Aktar</div>
              <div className="text-[11px] font-normal opacity-90">
                {parsedRows.length > 0 ? `${parsedRows.length} hasta kaydını (Satır ${startRow}-${endRow}) veritabanına işler` : 'Satır 4 ile 369 arasındaki tüm hasta verilerini kaydeder'}
              </div>
            </div>
          </button>
        </div>

        {/* Progress Bar */}
        {importProgress && (
          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs text-slate-300">
              <span>{importProgress.message}</span>
              <span>%{Math.round((importProgress.current / importProgress.total) * 100)}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {importCompleted && (
          <div className="p-4 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Tüm hasta bilgileri eksiksiz şekilde veritabanına ve hasta formlarına aktarıldı!</span>
            </div>
            <button
              onClick={() => navigate('/patients')}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              Hasta Listesine Git
            </button>
          </div>
        )}
      </div>

      {/* Live Data & Header Preview Table */}
      {headers.length > 0 && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Excel Veri Seti Önizleme ({headers.length} Kolon x {parsedRows.length} Satır)
            </h3>
            <span className="text-xs text-slate-500">Satır 4 - 369 arası canlı önizleme</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[450px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3 border-r border-slate-200 bg-slate-200 text-slate-900 w-16 text-center">
                    #Satır
                  </th>
                  {headers.map((h) => (
                    <th key={h.colLetter} className="p-3 border-r border-slate-200 min-w-[140px] whitespace-nowrap">
                      <span className="text-blue-600 font-mono font-bold mr-1">[{h.colLetter}]</span>
                      <span>{h.title}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {parsedRows.slice(0, 100).map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 border-r border-slate-200 text-center font-mono text-slate-500 bg-slate-50">
                      {row._excelRowNumber}
                    </td>
                    {headers.map((h) => (
                      <td key={h.colLetter} className="p-2.5 border-r border-slate-200 max-w-[200px] truncate">
                        {row[h.fieldId] !== undefined && row[h.fieldId] !== '' ? String(row[h.fieldId]) : <span className="text-slate-300">-</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 100 && (
            <p className="text-xs text-slate-400 text-center font-medium">
              * Toplam {parsedRows.length} satırdan ilk 100 satır gösterilmektedir.
            </p>
          )}
        </div>
      )}

      {/* Google Drive Picker Modal */}
      {showDriveModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-emerald-400">
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Google Drive Dosyalarınız</h3>
                  <p className="text-xs text-blue-200">Aşağıdaki Excel veya Tablo dosyanızdan birini seçin</p>
                </div>
              </div>
              <button
                onClick={() => setShowDriveModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Drive dosyalarında ara..."
                  value={driveSearchQuery}
                  onChange={(e) => handleSearchDriveFiles(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Modal Body / Files List */}
            <div className="p-4 overflow-y-auto space-y-2 flex-1 min-h-[250px]">
              {isLoadingDrive ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                  <span className="text-xs font-medium">Google Drive dosyaları listeleniyor...</span>
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="text-center py-12 text-slate-500 space-y-2">
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-700">Google Drive'da Excel veya Tablo bulunamadı.</p>
                  <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                    Aradığınız dosya başlığını yukarıdaki arama kutusuna yazabilir veya üstteki bağlantı kutusuna dosya linkini doğrudan yapıştırabilirsiniz.
                  </p>
                </div>
              ) : (
                driveFiles.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => handleSelectDriveFile(file)}
                    className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 bg-white hover:bg-blue-50/40 transition-all cursor-pointer flex items-center justify-between group shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                          {file.name}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {file.modifiedTime ? `Son değiştirilme: ${new Date(file.modifiedTime).toLocaleDateString('tr-TR')}` : 'Google Drive Dosyası'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg bg-blue-600 group-hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs shrink-0 flex items-center gap-1"
                    >
                      <span>Seç & Yükle</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowDriveModal(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
