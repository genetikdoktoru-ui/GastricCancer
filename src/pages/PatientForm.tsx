import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { defaultFormFields, FormField } from '../lib/schema';
import { normalizePatientRecord, normalizeFieldValue } from '../lib/codebook';
import { collection, doc, getDoc, setDoc, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Mic, Square, Loader2, Info, Image as ImageIcon, Upload, CheckCircle2, ShieldCheck, UserCheck, Link as LinkIcon, Clipboard, Globe, Sparkles, X, FileSpreadsheet, FileText, FileUp, Eye, EyeOff, Filter, Dna, Stethoscope } from 'lucide-react';
import { logAudit } from '../lib/audit';
import { generateNextResearchId } from '../lib/idGenerator';
import { getGeminiHeaders } from '../lib/gemini-config';

// Renders *flagged text* segments (used in the pathology report field to mark
// values that don't match the corresponding structured field) as highlighted spans.
function renderAnnotatedText(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={i} className="italic font-semibold text-amber-700 bg-amber-100/80 px-1 rounded">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// Groups form categories into two broad visual sections so genetics-related
// categories stay compact and adjacent, separate from the clinical/pathology cluster.
const GENETICS_SECTION = 'Tıbbi Genetik Değerlendirmesi';
const CLINICAL_SECTION = 'Klinik, Patolojik ve Onkolojik Veriler';
const CATEGORY_SECTION: Record<string, string> = {
  'Konsanguinite ve Aile Kökeni': GENETICS_SECTION,
  'Kişisel Tıbbi Öykü': GENETICS_SECTION,
  'Aile Hikayesi (Kanser Türüne Göre)': GENETICS_SECTION,
  'Dismorfik Muayene Bulguları': GENETICS_SECTION,
  'Sendrom Şüphesi ve Germline Test': GENETICS_SECTION,
  'Demografik & Yaşam Tarzı': CLINICAL_SECTION,
  'Tümör Patolojisi & Evreleme': CLINICAL_SECTION,
  'Moleküler Belirteçler': CLINICAL_SECTION,
  'Cerrahi & Tedavi': CLINICAL_SECTION,
  'Metastatik Tedavi': CLINICAL_SECTION,
  'Klinik Sonuçlar': CLINICAL_SECTION,
  'İkinci Patoloji Değerlendirmesi (Kontrol)': CLINICAL_SECTION,
  'Ameliyat Sonrası Takip': CLINICAL_SECTION,
  'Dosya ve Rapor Bilgileri': CLINICAL_SECTION,
};
function sectionFor(category: string): string | null {
  return CATEGORY_SECTION[category] || null;
}

// Small click-to-toggle info button shown next to a field's label when it has
// a `description` — expands an inline note explaining the biomarker/variable's
// clinical significance, instead of a floating tooltip (more robust inside grids).
function FieldInfoButton({ fieldId, description, open, onToggle }: { fieldId: string; description: string; open: boolean; onToggle: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(fieldId)}
      className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
        open ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
      }`}
      title="Klinik önemini göster"
      aria-label="Klinik önemini göster"
    >
      <Info className="w-3.5 h-3.5" />
    </button>
  );
}

export function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialResearchId = searchParams.get('researchId');
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [identityInfo, setIdentityInfo] = useState({
    fullName: '',
    nationalId: '',
    contact: ''
  });
  
  // Show only filled fields toggle (defaults to true for existing patient view)
  const [showOnlyFilled, setShowOnlyFilled] = useState<boolean>(id !== 'new');
  
  // Audio & AI Analysis State
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteAreaText, setPasteAreaText] = useState('');
  const [openInfoId, setOpenInfoId] = useState<string | null>(null);
  const toggleInfo = (fieldId: string) => setOpenInfoId(prev => (prev === fieldId ? null : fieldId));
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Load schema
        const schemaRef = doc(db, 'config', 'form_schema');
        const schemaSnap = await getDoc(schemaRef);
        let activeFields = defaultFormFields;
        // FORCE UPDATE SCHEMA TO DB ONCE
        try {
          await setDoc(doc(db, 'config', 'form_schema'), { fields: defaultFormFields });
          console.log("Forced update of schema to db");
        } catch(e) {}

        if (schemaSnap.exists()) {
          const storedFields = schemaSnap.data().fields as any[];
          const merged = storedFields.map((field: any) => {
            const df = defaultFormFields.find(d => d.id === field.id);
            if (df) {
              return { ...field, label: df.label, type: df.type, options: df.options };
            }
            return field;
          });
          // Include any newly-added schema.ts fields not yet present in the stored config
          const storedIds = new Set(storedFields.map((f: any) => f.id));
          const newlyAdded = defaultFormFields.filter(d => !storedIds.has(d.id));
          activeFields = [...merged, ...newlyAdded];
        }
        // Filter only active fields
        const visibleFields = activeFields.filter((f: FormField) => f.active);
        setFields(visibleFields);

        // Load patient data if ID exists
        if (id && id !== 'new') {
          setShowOnlyFilled(true);
          const docRef = doc(db, 'patients', id);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setFormData(normalizePatientRecord(snap.data()));
            logAudit('GÖRÜNTÜLEME', 'HASTA_FORMU', id, 'Hasta formu görüntülendi');
          }
        } else if (id === 'new') {
          setShowOnlyFilled(false);
          if (initialResearchId) {
            setFormData({ research_id: initialResearchId });
            logAudit('GÖRÜNTÜLEME', 'HASTA_FORMU', 'Yeni', 'Yeni form sayfası açıldı');
          } else {
            // AUTO GENERATE RESEARCH CODE
            const autoCode = await generateNextResearchId();
            setFormData({ research_id: autoCode });
            logAudit('GÖRÜNTÜLEME', 'HASTA_FORMU', 'Yeni', `Yeni form açıldı. Otomatik kod üretildi: ${autoCode}`);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const handleChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleSave = async (e: any) => {
    e.preventDefault();
    try {
      const nationalId = formData.identity_number;
      if (nationalId) {
        const q = query(collection(db, 'patients'), where('identity_number', '==', nationalId));
        const snapshot = await getDocs(q);
        const duplicate = snapshot.docs.find(d => d.id !== id);
        if (duplicate) {
          const confirmUpdate = confirm('DİKKAT: Bu T.C. Kimlik / Pasaport numarasına (veya kişiye) ait başka bir kayıt bulundu! Sistemde her kişiye ait tek bir kayıt olmalıdır. Devam ederseniz olası mükerrer kayıt oluşacaktır. Yine de kaydetmek ister misiniz? Lütfen eski kaydı kontrol edip çakışmayı düzeltin.');
          if (!confirmUpdate) return;
        }
      }

      let finalResearchId = formData.research_id;
      if (id === 'new' && !finalResearchId) {
        finalResearchId = await generateNextResearchId();
      }

      const payload = {
        ...formData,
        research_id: finalResearchId,
        appVersion: '1.1.0', // Schema version tracking
        updatedAt: new Date().toISOString()
      };

      if (id && id !== 'new') {
        // Use merge: true so old un-edited fields are not lost
        await setDoc(doc(db, 'patients', id), payload, { merge: true });
        await logAudit('GÜNCELLEME', 'HASTA_FORMU', id, 'Hasta kaydı güncellendi');
      } else {
        const docRef = await addDoc(collection(db, 'patients'), {
          ...payload,
          createdBy: auth.currentUser?.email,
          createdAt: new Date().toISOString()
        });

        // Save identity registry mapping if optional identity details are filled
        if (identityInfo.fullName || identityInfo.nationalId) {
          await setDoc(doc(db, 'patient_identities', finalResearchId), {
            researchId: finalResearchId,
            fullName: identityInfo.fullName,
            nationalId: identityInfo.nationalId,
            contact: identityInfo.contact,
            createdBy: auth.currentUser?.email,
            createdAt: new Date().toISOString()
          });
          await logAudit('OLUŞTURMA', 'KİMLİK_KAYDI', finalResearchId, 'Yeni hasta kaydı ile otomatik kimlik eşleşmesi oluşturuldu');
        }

        await logAudit('OLUŞTURMA', 'HASTA_FORMU', docRef.id, 'Yeni hasta kaydı oluşturuldu');
      }
      navigate('/patients');
    } catch (err) {
      console.error(err);
      alert('Kayıt başarısız.');
    }
  };

  // Check dependencies
  const isFieldVisible = (field: FormField) => {
    if (!field.dependsOn) return true;
    const { fieldId, value } = field.dependsOn;
    return formData[fieldId] === value;
  };

  // Audio Recording Functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = processAudio;
      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Mikrofon erişimi reddedildi veya hata oluştu.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      // Stop all tracks to release microphone
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const processAudio = async () => {
    setIsAnalyzing(true);
    try {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
      
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = reader.result as string;
        
        // Call backend API
        const response = await fetch('/api/gemini/analyze-audio', {
          method: 'POST',
          headers: getGeminiHeaders(),
          body: JSON.stringify({
            audioData: base64Audio,
            mimeType: 'audio/webm',
            formFields: (fields as any[]).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
          })
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.error || 'Ses analizi sırasında bir hata oluştu.');
        }
        
        const result = await response.json();
        const { rawText, formData: extractedData } = result;
        
        // Merge extracted data safely
        setFormData(prev => {
          const newData = { ...prev };
          if (rawText) {
            newData['clinical_notes'] = prev['clinical_notes'] ? prev['clinical_notes'] + '\n\n-- Ses Kaydı --\n' + rawText : rawText;
          }
          if (extractedData) {
            Object.keys(extractedData).forEach(key => {
              if (extractedData[key] !== null && extractedData[key] !== undefined) {
                newData[key] = extractedData[key];
              }
            });
          }
          return newData;
        });
      };
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Ses analizinde hata oluştu.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Image & Paste Handling
  const handleImageUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const handlePaste = (e: ClipboardEvent) => {
    // Check if the focus is on an input or textarea element
    const activeTag = document.activeElement?.tagName.toLowerCase();
    const isInputFocused = activeTag === 'input' || activeTag === 'textarea';

    const items = e.clipboardData?.items;
    if (!items) return;

    let hasImageOrDoc = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        hasImageOrDoc = true;
        const blob = items[i].getAsFile();
        if (blob) {
          e.preventDefault();
          setStatusMessage('Ekran görüntüsü / Resim panodan yapıştırıldı, AI analizi başlatılıyor...');
          processImage(blob);
          return;
        }
      } else {
        const file = items[i].getAsFile();
        if (file && (
          file.name.endsWith('.pdf') || 
          file.name.endsWith('.docx') || 
          file.name.endsWith('.doc') || 
          file.name.endsWith('.xlsx') || 
          file.name.endsWith('.xls') || 
          file.name.endsWith('.csv')
        )) {
          hasImageOrDoc = true;
          e.preventDefault();
          processDocument(file);
          return;
        }
      }
    }

    // If no image or document is pasted and we are not focused on a form input, try to process pasted text / URL
    if (!hasImageOrDoc && !isInputFocused) {
      const pastedText = e.clipboardData?.getData('text/plain');
      if (pastedText && pastedText.trim().length > 0) {
        e.preventDefault();
        const trimmed = pastedText.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          setStatusMessage('Panodaki URL adresi algılandı, sayfa içeriği çekiliyor...');
          processUrl(trimmed);
        } else {
          setStatusMessage('Panodaki metin yapıştırıldı, tıbbi imla düzeltmeleri ve form aktarımı yapılıyor...');
          processText(trimmed);
        }
      }
    }
  };

  // Direct Clipboard Reading via Browser Clipboard API (with iframe fallback)
  const handleClipboardRead = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const clipboardItems = await navigator.clipboard.read().catch(() => null);
        if (clipboardItems) {
          for (const item of clipboardItems) {
            const imageType = item.types.find(type => type.startsWith('image/'));
            if (imageType) {
              const blob = await item.getType(imageType);
              setStatusMessage('Panodaki ekran görüntüsü okundu, AI analizi başlatılıyor...');
              await processImage(blob);
              return;
            }
          }
        }
      }

      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText().catch(() => null);
        if (text && text.trim().length > 0) {
          const trimmed = text.trim();
          if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            setStatusMessage('Panodaki URL algılandı, sayfa içeriği çekiliyor...');
            await processUrl(trimmed);
          } else {
            setStatusMessage('Panodaki metin okundu, tıbbi düzeltme ve form aktarımı yapılıyor...');
            await processText(trimmed);
          }
          return;
        }
      }

      // If clipboard read is empty or restricted, open paste modal
      setShowPasteModal(true);
    } catch {
      // Browser permission policy blocked clipboard reading (e.g. inside iframe)
      // Open the Paste modal where Ctrl+V / paste event works natively 100% of the time!
      setShowPasteModal(true);
    }
  };

  const processUrl = async (urlStr: string) => {
    setIsAnalyzingImage(true);
    try {
      const response = await fetch('/api/gemini/analyze-url', {
        method: 'POST',
        headers: getGeminiHeaders(),
        body: JSON.stringify({
          url: urlStr,
          formFields: (fields as any[]).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'URL içerik analizi başarısız oldu.');
      }
      
      const result = await response.json();
      const { rawText, formData: extractedData } = result;

      setFormData(prev => {
        const newData = { ...prev };
        if (rawText) {
           newData['clinical_notes'] = prev['clinical_notes'] ? prev['clinical_notes'] + '\n\n-- Web/URL İçeriği --\n' + rawText : rawText;
        }
        if (extractedData) {
          Object.keys(extractedData).forEach(key => {
            if (extractedData[key] !== null && extractedData[key] !== undefined && extractedData[key] !== '') {
              newData[key] = extractedData[key];
            }
          });
        }
        return newData;
      });
      setStatusMessage('URL sayfa içeriği başarıyla çıkarıldı, imla düzeltildi ve form alanlarına dolduruldu!');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'URL analiz edilirken bir hata oluştu.');
      setStatusMessage(null);
    } finally {
      setIsAnalyzingImage(false);
      setShowUrlModal(false);
      setInputUrl('');
    }
  };

  const processText = async (text: string) => {
    setIsAnalyzingImage(true);
    try {
      const response = await fetch('/api/gemini/analyze-text', {
        method: 'POST',
        headers: getGeminiHeaders(),
        body: JSON.stringify({
          textData: text,
          formFields: (fields as any[]).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Metin analizi sırasında bir hata oluştu.');
      }
      
      const result = await response.json();
      const { rawText, formData: extractedData } = result;

      setFormData(prev => {
        const newData = { ...prev };
        if (rawText) {
           newData['clinical_notes'] = prev['clinical_notes'] ? prev['clinical_notes'] + '\n\n-- Eklenen Metin --\n' + rawText : rawText;
        }
        if (extractedData) {
          Object.keys(extractedData).forEach(key => {
            if (extractedData[key] !== null && extractedData[key] !== undefined && extractedData[key] !== '') {
              newData[key] = extractedData[key];
            }
          });
        }
        return newData;
      });
      setStatusMessage('Metin analiz edildi, tıbbi terminoloji düzeltildi ve form alanlarına aktarıldı!');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Metin analizinde hata oluştu.');
      setStatusMessage(null);
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const processImage = async (file: Blob) => {
    setIsAnalyzingImage(true);
    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const response = await fetch('/api/gemini/analyze-image', {
        method: 'POST',
        headers: getGeminiHeaders(),
        body: JSON.stringify({
          imageData: base64Image,
          mimeType: file.type || 'image/jpeg',
          formFields: (fields as any[]).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Görüntü/OCR analizi sırasında bir hata oluştu.');
      }
      
      const result = await response.json();
      const { rawText, formData: extractedData } = result;

      setFormData(prev => {
        const newData = { ...prev };
        if (rawText) {
           newData['clinical_notes'] = prev['clinical_notes'] ? prev['clinical_notes'] + '\n\n-- Rapor OCR --\n' + rawText : rawText;
        }
        if (extractedData) {
          Object.keys(extractedData).forEach(key => {
            if (extractedData[key] !== null && extractedData[key] !== undefined && extractedData[key] !== '') {
              newData[key] = extractedData[key];
            }
          });
        }
        return newData;
      });
      setStatusMessage('Görüntüdeki metinler OCR ile okundu, tıbbi terimler düzeltildi ve alanlara eşleştirildi!');
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Görüntü analizinde hata oluştu.');
      setStatusMessage(null);
    } finally {
      setIsAnalyzingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const processDocument = async (file: File) => {
    setIsAnalyzingImage(true);
    setStatusMessage(`${file.name} belgesi işleniyor, veriler çekiliyor ve tıbbi imla düzeltmeleri yapılıyor...`);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
      });

      const response = await fetch('/api/gemini/analyze-document', {
        method: 'POST',
        headers: getGeminiHeaders(),
        body: JSON.stringify({
          fileData: base64Data,
          fileName: file.name,
          mimeType: file.type,
          formFields: (fields as any[]).map(f => ({ id: f.id, label: f.label, type: f.type, options: f.options }))
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Belge analizi sırasında bir hata oluştu.');
      }

      const result = await response.json();
      
      if (result.patients && result.patients.length > 1) {
        setStatusMessage(`Belgede ${result.patients.length} adet hasta bulundu. Toplu kayıt yapılıyor...`);
        let savedCount = 0;
        let duplicateCount = 0;
        for (const p of result.patients) {
          const pData = p.formData || {};
          const pRawText = p.rawText || '';
          
          let hasDuplicate = false;
          if (pData.identity_number) {
            const q = query(collection(db, 'patients'), where('identity_number', '==', pData.identity_number));
            const snap = await getDocs(q);
            if (!snap.empty) {
               hasDuplicate = true;
               duplicateCount++;
            }
          }
          
          if (!hasDuplicate) {
            let resId = pData.research_id;
            if (!resId) resId = await generateNextResearchId();
            
            if (pRawText) {
              pData['clinical_notes'] = pData['clinical_notes'] ? pData['clinical_notes'] + `\n\n-- Belge İçeriği (${file.name}) --\n` + pRawText : pRawText;
            }
            
            await addDoc(collection(db, 'patients'), {
              ...pData,
              research_id: resId,
              appVersion: '1.1.0',
              createdBy: auth.currentUser?.email,
              createdAt: new Date().toISOString()
            });
            savedCount++;
          }
        }
        
        alert(`Toplu kayıt tamamlandı! ${savedCount} yeni hasta eklendi. ${duplicateCount > 0 ? `\nDikkat: ${duplicateCount} hasta sistemde zaten var olduğu için (T.C. Kimlik No çakışması) eklenmedi.` : ''}`);
        navigate('/patients');
        return;
      }

      const patient = result.patients?.[0] || result;
      const { rawText, formData: extractedData } = patient;

      setFormData(prev => {
        const newData = { ...prev };
        if (rawText) {
          newData['clinical_notes'] = prev['clinical_notes'] ? prev['clinical_notes'] + `\n\n-- Belge İçeriği (${file.name}) --\n` + rawText : rawText;
        }
        if (extractedData) {
          Object.keys(extractedData).forEach(key => {
            if (extractedData[key] !== null && extractedData[key] !== undefined && extractedData[key] !== '') {
              newData[key] = extractedData[key];
            }
          });
        }
        return newData;
      });
      setStatusMessage(`${file.name} belgesinden veriler başarıyla çekildi, tıbbi terminoloji düzeltildi ve alanlara aktarıldı!`);
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Belge analizinde hata oluştu.');
      setStatusMessage(null);
    } finally {
      setIsAnalyzingImage(false);
      if (docFileInputRef.current) docFileInputRef.current.value = '';
    }
  };

  const handleDocumentUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processDocument(file);
    }
  };

  if (loading) return <div>Yükleniyor...</div>;

  // Dynamically ensure all keys in formData (including all imported Excel B-DZ keys) are rendered
  const allSchemaFieldIds = new Set(fields.map(f => f.id));
  const dynamicExtraFields: FormField[] = [];

  Object.keys(formData).forEach(key => {
    if (
      !allSchemaFieldIds.has(key) &&
      !['_excelRowNumber', 'id', 'createdAt', 'createdBy', 'updatedAt', 'source', 'excelRowNumber', 'appVersion'].includes(key) &&
      formData[key] !== '' && formData[key] !== null && formData[key] !== undefined
    ) {
      let label = key;
      if (key.startsWith('excel_')) {
        const parts = key.split('_');
        const colLetter = parts[1]?.toUpperCase() || '';
        const titlePart = parts.slice(2).join(' ');
        label = `[Kolon ${colLetter}] ${titlePart}`;
      }
      dynamicExtraFields.push({
        id: key,
        label,
        type: typeof formData[key] === 'number' ? 'number' : 'text',
        category: 'Excel İçe Aktarılan Değişkenler (B-DZ)',
        active: true
      });
    }
  });

  const isValueFilled = (val: any) => {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    if (typeof val === 'object' && Object.keys(val).length === 0) return false;
    return true;
  };

  const isNewPatient = id === 'new';

  const allSchemaAndDynamicFields = [...fields, ...dynamicExtraFields];
  const filledFieldsCount = allSchemaAndDynamicFields.filter(f => f.id === 'research_id' || isValueFilled(formData[f.id])).length;

  const finalFieldsToDisplay = showOnlyFilled
    ? allSchemaAndDynamicFields.filter(f => f.id === 'research_id' || isValueFilled(formData[f.id]))
    : allSchemaAndDynamicFields;

  const groupedFields = finalFieldsToDisplay.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, FormField[]>);

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20" onPaste={handlePaste}>
      {/* Toast Notification Banner */}
      {statusMessage && (
        <div className="bg-indigo-900 text-white px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3 animate-fade-in border border-indigo-700">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
            <span>{statusMessage}</span>
          </div>
          <button 
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-indigo-200 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Title */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {id === 'new' ? 'Yeni Hasta Kaydı' : 'Hasta Bilgilerini Düzenle'}
          </h1>
          <p className="text-slate-600 mt-1">Gastrik kanser klinik ve genetik bulguları</p>
        </div>
        
        {/* Voice Dictation Card */}
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex items-center gap-4 shadow-xs">
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 text-sm">Sesli Asistan</h3>
            <p className="text-xs text-blue-700 mt-0.5 max-w-[140px]">Hasta hikayesini sesli anlatın</p>
          </div>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isAnalyzing}
            className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-md transition-all ${
              isRecording ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 
              isAnalyzing ? 'bg-slate-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
            title="Ses kaydını başlat veya durdur"
          >
            {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : 
             isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* AI & OCR Extraction Suite */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md border border-indigo-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-500/20 text-amber-300 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">Yapay Zeka Metin & Rapor Veri Aktarımı</h2>
              <p className="text-xs text-indigo-200">Ekran görüntüsü, panodaki metin/resim veya URL bağlantısından form alanlarını otomatik doldurun.</p>
            </div>
          </div>
          <span className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full w-fit">
            Tıbbi İmla & Terminoloji Düzeltmeli
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Method 1: Printscreen / Clipboard */}
          <button
            type="button"
            onClick={handleClipboardRead}
            disabled={isAnalyzingImage}
            className="flex items-center gap-3 bg-indigo-800/60 hover:bg-indigo-700/80 border border-indigo-700/80 rounded-xl p-3 text-left transition-all group"
          >
            <div className="p-2.5 bg-indigo-600 text-white rounded-lg group-hover:scale-105 transition-transform shrink-0">
              <Clipboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Panodan Yapıştır
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Printscreen, resim veya metin (Ctrl+V)
              </p>
            </div>
          </button>

          {/* Method 2: Excel / Word / PDF Document Upload */}
          <input 
            type="file" 
            accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,text/plain" 
            className="hidden" 
            ref={docFileInputRef}
            onChange={handleDocumentUpload}
          />
          <button
            type="button"
            onClick={() => docFileInputRef.current?.click()}
            disabled={isAnalyzingImage}
            className="flex items-center gap-3 bg-indigo-800/60 hover:bg-indigo-700/80 border border-indigo-700/80 rounded-xl p-3 text-left transition-all group"
          >
            <div className="p-2.5 bg-amber-500 text-slate-900 rounded-lg group-hover:scale-105 transition-transform shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Excel / Word / PDF
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                .xlsx, .docx, .pdf, .csv belgesinden veri çek
              </p>
            </div>
          </button>

          {/* Method 3: URL Link Extraction */}
          <button
            type="button"
            onClick={() => setShowUrlModal(true)}
            disabled={isAnalyzingImage}
            className="flex items-center gap-3 bg-indigo-800/60 hover:bg-indigo-700/80 border border-indigo-700/80 rounded-xl p-3 text-left transition-all group"
          >
            <div className="p-2.5 bg-blue-600 text-white rounded-lg group-hover:scale-105 transition-transform shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                URL Linkinden Çek
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Web raporu veya online e-laboratuvar linki
              </p>
            </div>
          </button>

          {/* Method 4: File Upload OCR */}
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleImageUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzingImage}
            className="flex items-center gap-3 bg-indigo-800/60 hover:bg-indigo-700/80 border border-indigo-700/80 rounded-xl p-3 text-left transition-all group"
          >
            <div className="p-2.5 bg-emerald-600 text-white rounded-lg group-hover:scale-105 transition-transform shrink-0">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                Rapor Resmi (OCR)
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Cihazınızdaki rapor fotoğrafı/resmi
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* URL Link Input Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-lg">
                <Globe className="w-5 h-5 text-indigo-600" />
                <span>URL Linki ile Metin/Rapor Çek</span>
              </div>
              <button 
                onClick={() => setShowUrlModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              İnternette erişilebilir bir tıbbi raporun, laboratuvar sonucunun veya tıbbi belgenin (web sayfası veya resim linki) adresini yapıştırın. Yapay zeka içeriği çekecek, Türkçe/İngilizce yazım hatalarını düzeltecek ve formu otomatik dolduracaktır.
            </p>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (inputUrl.trim()) {
                  processUrl(inputUrl.trim());
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Rapor veya Web Bağlantı Adresi (URL)</label>
                <div className="relative">
                  <input
                    type="url"
                    required
                    placeholder="https://örnek-laboratuvar.com/rapor?id=123"
                    className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                  />
                  <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="px-4 py-2 text-slate-600 text-sm hover:bg-slate-100 rounded-lg font-medium"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isAnalyzingImage || !inputUrl.trim()}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-semibold flex items-center gap-2 disabled:bg-slate-300"
                >
                  {isAnalyzingImage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>İçerik Çekiliyor...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Verileri Çek & Doldur</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste Modal for Ctrl+V / Clipboard Fallback */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 border border-slate-200 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-lg">
                <Clipboard className="w-5 h-5 text-indigo-600" />
                <span>Panodan Yapıştırma Alanı</span>
              </div>
              <button 
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Ekran görüntüsünü (PrintScreen), kopyalanmış tıbbi metni veya bir web URL linkini aşağıdaki kutuya yapıştırın (<strong>Ctrl+V</strong> veya <strong>Cmd+V</strong>). Yapay zeka içeriği otomatik algılayıp tıbbi terimleri düzelterek form alanlarına aktaracaktır.
            </p>

            <div 
              className="space-y-4"
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (items) {
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                      const blob = items[i].getAsFile();
                      if (blob) {
                        e.preventDefault();
                        setShowPasteModal(false);
                        setStatusMessage('Panodaki resim yapıştırıldı, AI analizi başlatılıyor...');
                        processImage(blob);
                        return;
                      }
                    }
                  }
                }
              }}
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Yapıştırma & Metin Giriş Alanı (Ctrl+V)
                </label>
                <textarea
                  rows={5}
                  autoFocus
                  placeholder="Buraya Ctrl+V ile resim/ekran görüntüsü yapıştırın veya rapor metni / URL adresi yapıştırın..."
                  className="w-full p-3 border border-indigo-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white resize-none"
                  value={pasteAreaText}
                  onChange={(e) => setPasteAreaText(e.target.value)}
                />
              </div>

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] text-slate-500">
                  💡 Resimler anında algılanır, metin/URL için aşağıdaki butona tıklayabilirsiniz.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteModal(false)}
                    className="px-4 py-2 text-slate-600 text-sm hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Kapat
                  </button>
                  <button
                    type="button"
                    disabled={isAnalyzingImage || !pasteAreaText.trim()}
                    onClick={() => {
                      const trimmed = pasteAreaText.trim();
                      if (!trimmed) return;
                      setShowPasteModal(false);
                      setPasteAreaText('');
                      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                        setStatusMessage('URL adresi analiz ediliyor...');
                        processUrl(trimmed);
                      } else {
                        setStatusMessage('Metin analiz ediliyor, tıbbi imla düzeltmeleri yapılıyor...');
                        processText(trimmed);
                      }
                    }}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-semibold flex items-center gap-2 disabled:bg-slate-300"
                  >
                    {isAnalyzingImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analiz Ediliyor...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Analiz Et & Doldur</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optional Identity Registration for New Patient */}
      {id === 'new' && (
        <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-700" />
              <h2 className="font-bold text-emerald-950 text-sm">Hasta Kimlik Eşleştirme (İsteğe Bağlı & Gizli)</h2>
            </div>
            <span className="text-xs bg-emerald-200/70 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
              Sadece Yetkili Yönetici Görür
            </span>
          </div>
          <p className="text-xs text-emerald-800">
            Kimlik bilgileri hastanın medikal araştırma formuna kaydedilmez. Burada girilen bilgiler, otomatik üretilen 
            <strong className="mx-1 text-emerald-950 font-bold">{formData.research_id || 'GST-...'}</strong>
            kodu ile güvenli eşleştirme listesine eklenir.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-emerald-900 mb-1">Hasta Ad Soyad</label>
              <input
                type="text"
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={identityInfo.fullName}
                onChange={e => setIdentityInfo(prev => ({ ...prev, fullName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-emerald-900 mb-1">TC Kimlik / Protokol No</label>
              <input
                type="text"
                placeholder="Örn: 12345678901"
                className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={identityInfo.nationalId}
                onChange={e => setIdentityInfo(prev => ({ ...prev, nationalId: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-emerald-900 mb-1">İletişim / Not</label>
              <input
                type="text"
                placeholder="Opsiyonel telefon veya açıklama"
                className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                value={identityInfo.contact}
                onChange={e => setIdentityInfo(prev => ({ ...prev, contact: e.target.value }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* View Mode Control Bar */}
      <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl shrink-0 ${showOnlyFilled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'}`}>
            <Filter className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">Form Görünüm Modu</h3>
              <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full ${showOnlyFilled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'}`}>
                {showOnlyFilled ? 'Sadece Dolu Alanlar' : 'Tüm Form Alanları Açık'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {showOnlyFilled 
                ? `Bu hasta için veri girilmiş ${finalFieldsToDisplay.length} alan gösteriliyor (Temiz Görünüm).` 
                : `Toplam ${allSchemaAndDynamicFields.length} form alanı açık (Eksiksiz Veri Girişi & Düzenleme Modu).`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-800 p-1.5 rounded-xl border border-slate-700/80 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setShowOnlyFilled(true)}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              showOnlyFilled 
                ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/40' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eye className="w-4 h-4" />
            <span>Sadece Dolu Alanlar ({filledFieldsCount})</span>
          </button>
          <button
            type="button"
            onClick={() => setShowOnlyFilled(false)}
            className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              !showOnlyFilled 
                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-400/40' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <EyeOff className="w-4 h-4" />
            <span>Tüm Alanları Göster ({allSchemaAndDynamicFields.length})</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {Object.keys(groupedFields).length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
            <Info className="w-10 h-10 text-amber-500 mx-auto" />
            <h3 className="text-base font-bold text-amber-900">Sadece Dolu Alanlar Modu Aktif</h3>
            <p className="text-xs text-amber-700 max-w-md mx-auto">
              Bu hasta kaydında henüz doldurulmuş bir alan bulunamadı veya tüm değerler boş. 
              Forma yeni veri girmek veya tüm alanları düzenlemek için butonla tüm alanları açabilirsiniz.
            </p>
            <button
              type="button"
              onClick={() => setShowOnlyFilled(false)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all inline-flex items-center gap-2 mt-2"
            >
              <EyeOff className="w-4 h-4" />
              Tüm Form Alanlarını Göster
            </button>
          </div>
        ) : (() => {
          const categoryEntries = Object.entries(groupedFields);
          const ungrouped = categoryEntries.filter(([category]) => !sectionFor(category));
          const geneticsEntries = categoryEntries.filter(([category]) => sectionFor(category) === GENETICS_SECTION);
          const clinicalEntries = categoryEntries.filter(([category]) => sectionFor(category) === CLINICAL_SECTION);

          const renderCategoryCard = ([category, catFields]: [string, any[]]) => (
          <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{category}</h2>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {(catFields as any[]).map(field => (
                <div 
                  key={field.id} 
                  className={`group relative space-y-2.5 p-3.5 rounded-xl border border-slate-200/60 bg-slate-50/30 hover:bg-blue-50/20 hover:border-blue-300 transition-all ${
                    field.type === 'checkbox' ? 'md:col-span-2' : field.type === 'textarea' ? 'md:col-span-2' : ''
                  }`}
                >
                  {field.type !== 'checkbox' ? (
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={field.id} className="block text-sm font-semibold text-slate-800 flex items-center gap-1.5 cursor-pointer">
                        {field.label}
                      </label>
                      {field.description && (
                        <FieldInfoButton fieldId={field.id} description={field.description} open={openInfoId === field.id} onToggle={toggleInfo} />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id={field.id}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-0.5"
                          checked={formData[field.id] || false}
                          onChange={e => handleChange(field.id, e.target.checked)}
                        />
                        <label htmlFor={field.id} className="text-sm font-semibold text-slate-800 cursor-pointer select-none">
                          {field.label}
                        </label>
                      </div>
                      {field.description && (
                        <FieldInfoButton fieldId={field.id} description={field.description} open={openInfoId === field.id} onToggle={toggleInfo} />
                      )}
                    </div>
                  )}

                  {field.description && openInfoId === field.id && (
                    <div className="text-xs leading-relaxed text-blue-900 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
                      {field.description}
                    </div>
                  )}

                  {field.type === 'textarea' && field.id === 'rapor' && formData[field.id] && (
                    <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mb-2">
                      {renderAnnotatedText(formData[field.id])}
                    </div>
                  )}

                  {field.type === 'textarea' && (
                    <textarea
                      id={field.id}
                      rows={5}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y text-slate-800"
                      value={formData[field.id] || ''}
                      onChange={e => handleChange(field.id, e.target.value)}
                      placeholder="OCR metinleri veya notlar buraya aktarılır..."
                    />
                  )}

                  {field.type === 'date' && (
                    <input
                      id={field.id}
                      type="date"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                      value={formData[field.id] || ''}
                      onChange={e => handleChange(field.id, e.target.value)}
                    />
                  )}

                  {field.type === 'text' && field.id === 'research_id' ? (
                    <div className="relative flex items-center">
                      <input
                        id={field.id}
                        type="text"
                        readOnly
                        className="w-full px-4 py-2 bg-indigo-50/80 border border-indigo-200 text-indigo-900 font-bold rounded-lg focus:outline-none cursor-default"
                        value={formData[field.id] || 'Otomatik Oluşturuluyor...'}
                      />
                      <span className="absolute right-3 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 bg-indigo-200/70 text-indigo-800 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                        Otomatik Kodlandı
                      </span>
                    </div>
                  ) : field.type === 'text' && (
                    <input
                      id={field.id}
                      type="text"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                      value={formData[field.id] || ''}
                      onChange={e => handleChange(field.id, e.target.value)}
                    />
                  )}

                  {field.type === 'number' && (
                    <input
                      id={field.id}
                      type="number"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-800"
                      value={formData[field.id] || ''}
                      onChange={e => handleChange(field.id, Number(e.target.value))}
                    />
                  )}

                  {field.type === 'select' && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {field.options?.map(opt => {
                        const rawVal = formData[field.id];
                        const normVal = normalizeFieldValue(field.id, rawVal, field);
                        const isSelected = rawVal === opt || normVal === opt;
                        return (
                          <button
                            type="button"
                            key={opt}
                            onClick={() => handleChange(field.id, isSelected ? '' : opt)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                              isSelected 
                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm font-semibold' 
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  
                  {field.type === 'multiselect' && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {field.options?.map(opt => {
                        const currentValues = formData[field.id] || [];
                        const isChecked = currentValues.includes(opt);
                        return (
                          <button
                            type="button"
                            key={opt}
                            onClick={() => {
                              const newValues = isChecked
                                ? currentValues.filter((v: string) => v !== opt)
                                : [...currentValues, opt];
                              handleChange(field.id, newValues);
                            }}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors border ${
                              isChecked
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm font-semibold'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}

                </div>
              ))}
            </div>
          </div>
          );

          return (
            <>
              {ungrouped.map(renderCategoryCard)}

              {geneticsEntries.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-1">
                    <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                      <Dna className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-indigo-900">{GENETICS_SECTION}</h2>
                      <p className="text-xs text-indigo-600">Konsanguinite, aile öyküsü, dismorfik bulgular ve germline test sonuçları</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {geneticsEntries.map(renderCategoryCard)}
                  </div>
                </div>
              )}

              {clinicalEntries.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-1">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                      <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-emerald-900">{CLINICAL_SECTION}</h2>
                      <p className="text-xs text-emerald-600">Patoloji, cerrahi, onkolojik tedavi ve takip verileri</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {clinicalEntries.map(renderCategoryCard)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-lg"
          >
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
