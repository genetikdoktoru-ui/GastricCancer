import { defaultFormFields, FormField } from './schema';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Normalizes individual field values according to Excel Codebook / Schema rules.
 * Extracted from Mide patient excel reference file.
 */
export function normalizeFieldValue(fieldKey: string, val: any, fieldObj?: FormField): any {
  if (val === null || val === undefined || val === '') return val;
  const strVal = String(val).trim();
  const lowerKey = fieldKey.toLowerCase();

  // CİNSİYET (schema.ts options: '1 - Erkek', '2 - Kadın')
  if (lowerKey === 'patient_gender' || lowerKey.includes('cinsiyet') || lowerKey.includes('cins')) {
    if (strVal === '1') return '1 - Erkek';
    if (strVal === '2') return '2 - Kadın';
  }

  // KİLO KAYBI / SİGARA (1:Yok, 2:Var, 3:Bilgi Yok)
  if (lowerKey.includes('kilo_kaybi') || lowerKey.includes('sigara')) {
    if (strVal === '1') return '1 - Yok';
    if (strVal === '2') return '2 - Var';
    if (strVal === '3') return '3 - Bilgi Yok';
  }

  // LOKALİZASYON
  if (lowerKey.includes('lokaliza') || lowerKey.includes('lokalizasyon')) {
    if (strVal === '1') return '1 - Distal';
    if (strVal === '2') return '2 - Proksimal';
  }

  // KANSER TİPİ
  if (lowerKey.includes('kanser_tipi') || lowerKey.includes('kanser tip')) {
    if (strVal === '1') return '1 - Adenokarsinom';
    if (strVal === '2') return '2 - Skuamöz Hücreli Ca';
    if (strVal === '3') return '3 - Nöroendokrin Karsinom';
    if (strVal === '4') return '4 - Lenfoma';
    if (strVal === '5') return '5 - GİST';
  }

  // HİSTOLOJİ BORMANN (Macroscopic) - Kolon M
  if (
    lowerKey === 'macroscopic_type' ||
    lowerKey.includes('makroskop') ||
    lowerKey.includes('bormann') ||
    lowerKey.includes('kolon_m') ||
    lowerKey.startsWith('excel_m_') ||
    lowerKey === 'm' ||
    (fieldObj?.description && fieldObj.description.includes('Kolon M'))
  ) {
    if (strVal === '1') return '1 - Polipoid';
    if (strVal === '2') return '2 - Fungal';
    if (strVal === '3') return '3 - Ülseröz';
    if (strVal === '4') return '4 - Diffüz İnfiltran';
    if (strVal === '5') return '5 - Vegetan';
    if (strVal === '6') return '6 - Ülsero Vegetan';
  }

  // HİSTOLOJİ WHO
  if (lowerKey === 'who_classification' || lowerKey.includes('who') || lowerKey.includes('histoloji_who')) {
    if (strVal === '1') return '1 - Papiller';
    if (strVal === '2') return '2 - Tubuler';
    if (strVal === '3') return '3 - Müsinöz';
    if (strVal === '4') return '4 - Taşlı Yüzük';
    if (strVal === '6') return '6 - Kribriform';
    if (strVal === '7') return '7 - Miks Histoloji';
    if (strVal === '8') return '8 - Solid Patern';
  }

  // HİSTOLOJİ MİNG
  if (lowerKey.includes('ming')) {
    if (strVal === '1') return '1 - İnfiltratif';
    if (strVal === '2') return '2 - Ekspansif';
    if (strVal === '3') return '3 - Expansif İnfitratif';
  }

  // LAUREN CLASSIFICATION
  if (lowerKey === 'lauren_classification' || lowerKey.includes('lauren')) {
    if (strVal === '1') return '1 - Diffüz';
    if (strVal === '2') return '2 - İntestinal';
  }

  // N EVRESİ
  if (lowerKey === 'n' || lowerKey === 'n_evresi') {
    if (strVal === '0') return '0 - N0';
    if (strVal === '1') return '1 - N1';
    if (strVal === '2') return '2 - N2';
    if (strVal === '3') return '3 - N3a';
    if (strVal === '4') return '4 - N3b';
  }

  // VAR/YOK/BİLGİ YOK Flags
  if (
    lowerKey.includes('lenf_invazyon') ||
    lowerKey.includes('vask_infazyon') ||
    lowerKey.includes('perino_invazyon') ||
    lowerKey.includes('tasli_yuzuk') ||
    lowerKey.includes('musin') ||
    lowerKey.includes('lvi') ||
    lowerKey.includes('pni')
  ) {
    if (strVal === '0') return '0 - Yok';
    if (strVal === '1') return '1 - Var';
    if (strVal === '2') return '2 - Bilgi Yok';
  }

  // GRADE
  if (lowerKey === 'grade' || lowerKey.includes('derece')) {
    if (strVal === '1') return '1';
    if (strVal === '2') return '2';
    if (strVal === '3') return '3';
  }

  // HER2
  if (lowerKey === 'her2') {
    if (strVal === '0') return '0 - Negatif';
    if (strVal === '1') return '1 - 1+';
    if (strVal === '2') return '2 - 2+';
    if (strVal === '3') return '3 - 3+';
  }

  // HER2 FISH
  if (lowerKey.includes('her2fish')) {
    if (strVal === '0') return '0 - Negatif';
    if (strVal === '1') return '1 - Pozitif';
    if (strVal === '2') return '2 - Bilgi Yok';
  }

  // CERRAHİ TÜRÜ
  if (lowerKey.includes('cer_turu') || lowerKey.includes('cerrahi')) {
    if (strVal === '1') return '1 - Total Gastrektomi';
    if (strVal === '2') return '2 - Subtotal Gastrektomi';
    if (strVal === '3') return '3 - Palyatif Rezeksiyon';
  }

  // REZEKSİYON TİPİ
  if (lowerKey.includes('rezeksiyon_tipi') || lowerKey === 'r') {
    if (strVal === '0') return '0 - R0';
    if (strVal === '1') return '1 - R1';
    if (strVal === '2') return '2 - R2';
  }
  
  // HASTANIN SON DURUMU
  if (lowerKey.includes('son_durum')) {
    if (strVal === '0') return '0 - Exitus';
    if (strVal === '1') return '1 - Yaşıyor';
    if (strVal === '2') return '2 - Hastalık Dışı Exitus';
  }

  // ADJUVAN TEDAVİ TÜRÜ
  if (lowerKey.includes('adjuvan_tx_type') || lowerKey.includes('adjuvan_tedavi_turu')) {
    if (strVal === '1') return '1 - KTRT';
    if (strVal === '2') return '2 - Sadece KT';
  }

  // CEVAP (CR, PR, SD, PD)
  if (lowerKey.includes('cevap')) {
    if (strVal === '1') return '1 - CR (Tam Yanıt)';
    if (strVal === '2') return '2 - PR (Kısmi Yanıt)';
    if (strVal === '3') return '3 - SD (Stabil Hastalık)';
    if (strVal === '4') return '4 - PD (Progresif Hastalık)';
    if (strVal === '5') return '5 - Bilinmiyor';
  }

  // RELAPS / NÜKS / PROGRESYON / METASTAZ VAR MI
  if (lowerKey.includes('relaps') || lowerKey.includes('nuks') || lowerKey.includes('progresyon') || lowerKey.includes('metastaz_var_mi')) {
    if (strVal === '0') return '0 - Yok';
    if (strVal === '1') return '1 - Var';
    if (strVal === '2') return '2 - Bilgi Yok';
  }

  // Generic Option Matching from Schema
  const schemaField = fieldObj || defaultFormFields.find(f => f.id === fieldKey);
  if (schemaField && schemaField.type === 'select' && schemaField.options) {
    const matchedOption = schemaField.options.find(opt => 
      opt.startsWith(`${strVal} -`) || opt.startsWith(`${strVal} `) || opt.startsWith(`${strVal}.`) || opt === strVal
    );
    if (matchedOption) return matchedOption;
  }

  return val;
}

/**
 * Normalizes an entire patient object (all keys) with codebook labels.
 */
export function normalizePatientRecord(patientData: Record<string, any>): Record<string, any> {
  if (!patientData) return patientData;
  const normalized: Record<string, any> = { ...patientData };

  Object.keys(patientData).forEach(key => {
    if (['_excelRowNumber', 'id', 'createdAt', 'createdBy', 'updatedAt', 'source', 'appVersion', 'research_id', 'patient_name', 'identity_number'].includes(key)) {
      return;
    }
    const rawVal = patientData[key];
    normalized[key] = normalizeFieldValue(key, rawVal);
  });

  return normalized;
}

/**
 * Bulk updates existing records in Firestore with normalized human-readable codes.
 */
export async function normalizeAllExistingRecordsInFirestore(onProgress?: (current: number, total: number) => void): Promise<number> {
  const snap = await getDocs(collection(db, 'patients'));
  const docs = snap.docs;
  const total = docs.length;

  const batchSize = 100;
  let updatedCount = 0;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = writeBatch(db);

    chunk.forEach(d => {
      const data = d.data();
      const normalized = normalizePatientRecord(data);
      batch.set(doc(db, 'patients', d.id), normalized, { merge: true });
    });

    await batch.commit();
    updatedCount += chunk.length;
    if (onProgress) onProgress(updatedCount, total);
  }

  return updatedCount;
}
