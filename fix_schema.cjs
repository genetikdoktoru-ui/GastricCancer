const fs = require('fs');

let defaultSchema = `
export type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'multiselect';

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  options?: string[]; // for select/multiselect
  required?: boolean;
  category: string;
  active: boolean; // Customization: active or inactive
  description?: string; // Reason for collecting this data
  dependsOn?: { fieldId: string; value: string | boolean }; // Conditional logic
}

export const defaultFormFields: FormField[] = [
  { id: 'research_id', label: 'Araştırma ID (Kodu)', type: 'text', category: 'Genel Bilgiler', active: true, description: 'Örn: GST-001' },
  // Demografik & Yaşam Tarzı
  { id: 'cinsiyet', label: 'Cinsiyet', type: 'select', options: ['1 - Erkek', '2 - Kadın'], category: 'Demografik & Yaşam Tarzı', active: true, description: '1: Erkek, 2: Kadın.' },
  { id: 'yas', label: 'Yaş', type: 'number', category: 'Demografik & Yaşam Tarzı', active: true, description: 'Hastanın yaşı' },
  { id: 'ethnicity', label: 'Etnik Köken / Irk', type: 'text', category: 'Demografik & Yaşam Tarzı', active: true, description: 'Doğu Asya ve Doğu Avrupa populasyonlarında insidans yüksektir.' },
  { id: 'bmi', label: 'Vücut Kitle İndeksi (BMI)', type: 'number', category: 'Demografik & Yaşam Tarzı', active: true, description: 'Yüksek Vücut Kitle İndeksi (obezite), özellikle gastroözofageal bileşke (GEJ) ve kardiya yerleşimli adenocarcinoma için bağımsız risk faktörüdür.' },
  { id: 'sigara', label: 'Sigara Kullanımı', type: 'select', options: ['1 - Yok', '2 - Var', '3 - Bilgi Yok'], category: 'Demografik & Yaşam Tarzı', active: true, description: '1: YOK; 2: VAR; 3: BİLGİ YOK' },
  { id: 'alcohol', label: 'Alkol Kullanımı', type: 'select', options: ['Kullanmıyor', 'Bırakmış', 'Aktif Kullanıcı'], category: 'Demografik & Yaşam Tarzı', active: true, description: 'Kronik alkol kullanımı, gastrik mukoza bariyerinde hasar ve asetaldehit birikimi oluşturarak malign transformasyonu tetikler.' },
  { id: 'diet', label: 'Beslenme Alışkanlıkları', type: 'multiselect', options: ['Yüksek Tuz Tüketimi', 'Tütsülenmiş/İşlenmiş Et', 'Düşük Meyve/Sebze'], category: 'Demografik & Yaşam Tarzı', active: true, description: 'Tuzlanmış/tütsülenmiş gıdalar (nitrosaminler) endojen karsinojenik etki yapar.' },
  { id: 'blood_type', label: 'Kan Grubu', type: 'select', options: ['A', 'B', 'AB', '0', 'Bilinmiyor'], category: 'Demografik & Yaşam Tarzı', active: true, description: 'A kan grubu taşıyıcılarında gastrik kanser insidansı %20 daha yüksektir.' },
  { id: 'aile_oykusu', label: 'Aile Öyküsü', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Demografik & Yaşam Tarzı', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },

  // Klinik & Laboratuvar
  { id: 'per_durum', label: 'Performans Durumu', type: 'select', options: ['0 - PS0', '1 - PS1', '2 - PS2', '3 - PS3', '4 - PS4', '5 - Bilgi Yok'], category: 'Klinik & Laboratuvar', active: true, description: '0: PS0; 1: PS1; 2: PS2; 3: PS3; 4: PS4; 5: BİLGİ YOK' },
  { id: 'kilo_kaybi', label: 'Kilo Kaybı (Son 6 Ay)', type: 'select', options: ['1 - Yok', '2 - Var', '3 - Bilgi Yok'], category: 'Klinik & Laboratuvar', active: true, description: '1: YOK; 2: VAR; 3: BİLGİ YOK' },
  { id: 'clinical_notes', label: 'Klinik Notlar / Ekstre Metin', type: 'textarea', category: 'Klinik & Laboratuvar', active: true, description: 'OCR ile aktarılan patoloji raporları, epikrizler, vs.' },
  { id: 'h_pylori', label: 'H. Pylori Enfeksiyonu', type: 'select', options: ['Pozitif', 'Eradike Edilmiş', 'Negatif', 'Bilinmiyor'], category: 'Klinik & Laboratuvar', active: true, description: 'Helicobacter pylori, WHO Sınıf 1 karsinojendir.' },
  { id: 'ebv_serology', label: 'EBV Serolojisi', type: 'select', options: ['Pozitif', 'Negatif', 'Bilinmiyor'], category: 'Klinik & Laboratuvar', active: true, description: 'EBV serolojisi.' },
  
  // Somatik Genetik & İmmünoloji (Tümör)
  { id: 'somatic_testing_done', label: 'Somatik / Moleküler Test (Tümörden) Yapıldı mı?', type: 'checkbox', category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, description: 'Tümör dokusundan moleküler profilleme (IHC, FISH, Somatik NGS) yapılıp yapılmadığını gösterir.' },
  { id: 'her2', label: 'HER2 Ekspresyonu', type: 'select', options: ['0 - Negatif', '1 - 1+', '2 - 2+', '3 - 3+'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: '0: Negatif; 1: 1+; 2: 2+; 3: 3+' },
  { id: 'her2fish', label: 'HER2 FISH', type: 'select', options: ['0 - Negatif', '1 - Pozitif', '2 - Bilgi Yok'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: '0: Negatif; 1: Pozitif; 2: Bilgi Yok' },
  { id: 'msi_status', label: 'MSI (Mikrosatellit İnstabilitesi)', type: 'select', options: ['MSI-H (dMMR)', 'MSS (pMMR)', 'Bakılmadı'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: 'MSI-H (dMMR) tümörler yüksek neoantijen yüküne sahiptir.' },
  { id: 'pdl1_cps', label: 'PD-L1 CPS Skoru', type: 'select', options: ['CPS < 1', 'CPS 1-4', 'CPS >= 5', 'CPS >= 10', 'Bakılmadı'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: 'Combined Positive Score (CPS) >=5 veya >=10' },
  { id: 'ebv_ish', label: 'EBV (EBER-ISH)', type: 'select', options: ['Pozitif', 'Negatif', 'Bakılmadı'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: 'Tümör dokusunda EBER-ISH pozitifliği.' },
  { id: 'somatic_ngs', label: 'Diğer Tümör Mutasyonları (NGS)', type: 'multiselect', options: ['PIK3CA', 'ARID1A', 'KRAS', 'CTNNB1', 'Yok'], category: 'Somatik Genetik & İmmünoloji (Tümör)', active: true, dependsOn: { fieldId: 'somatic_testing_done', value: true }, description: 'Diğer somatik mutasyonlar.' },

  // Tümör Patolojisi & Evreleme
  { id: 'kanser_tipi', label: 'Kanser Tipi', type: 'select', options: ['1 - Adenokarsinom', '2 - Skuamöz Hücreli Ca', '3 - Nöroendokrin Karsinom', '4 - Lenfoma', '5 - GİST'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '1: Adenokarsinom; 2: Skuamöz Hücreli Ca; 3: Nöroendokrin Karsinom; 4: Lenfoma; 5: GİST' },
  { id: 'lokaliza', label: 'Tümör Lokalizasyonu', type: 'select', options: ['1 - Distal', '2 - Proksimal'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '1: Distal; 2: Proksimal' },
  { id: 'histoloji_bormann', label: 'Makroskobik Tümör Tipi (Kolon M / Bormann)', type: 'select', options: ['1 - Polipoid', '2 - Fungal', '3 - Ülseröz', '4 - Diffüz İnfiltran', '5 - Vegetan', '6 - Ülsero Vegetan'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '(M) Bormann. 1: Polipoid; 2: Fungal; 3: Ülseröz; 4: Diffüz İnfiltran; 5: Vegetan; 6: Ülsero Vegetan' },
  { id: 'histoloji_who', label: 'Histolojik Tip (WHO)', type: 'select', options: ['1 - Tubuler', '2 - Papiller', '3 - Taşlı Yüzük', '4 - Müsinöz', '5 - Mikst', '6 - Undiferansiye'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '1: Tubuler; 2: Papiller; 3: Taşlı Yüzük; 4: Müsinöz; 5: Mikst; 6: Undiferansiye' },
  { id: 'histoloji_lauren', label: 'Lauren Sınıflaması', type: 'select', options: ['İntestinal', 'Diffüz', 'Mikst', 'Bilinmiyor'], category: 'Tümör Patolojisi & Evreleme', active: true, description: 'İntestinal tip genellikle çevresel faktörlerle, diffüz tip ise genetik faktörlerle (CDH1) ilişkilidir.' },
  { id: 'tm_capi', label: 'Tümör Çapı (cm)', type: 'number', category: 'Tümör Patolojisi & Evreleme', active: true, description: 'Tümörün makroskobik çapı' },
  { id: 't_evresi', label: 'T Evresi (Derinlik)', type: 'select', options: ['1 - T1a', '2 - T1b', '3 - T2', '4 - T3', '5 - T4a', '6 - T4b'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '1: T1a; 2: T1b; 3: T2; 4: T3; 5: T4a; 6: T4b' },
  { id: 'grade', label: 'Histolojik Derece (Grade)', type: 'select', options: ['1 - Grade 1 (İyi)', '2 - Grade 2 (Orta)', '3 - Grade 3 (Kötü)'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '1: Grade 1; 2: Grade 2; 3: Grade 3' },
  { id: 'tasli_yuzuk', label: 'Taşlı Yüzük', type: 'select', options: ['0 - Yok', '1 - Var'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: YOK; 1: VAR' },
  { id: 'musin', label: 'Müsin', type: 'select', options: ['0 - Yok', '1 - Var'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: YOK; 1: VAR' },
  { id: 'lenf_invazyon', label: 'Lenfovasküler İnvazyon (LVI)', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },
  { id: 'vask_infazyon', label: 'Vasküler İnvazyon', type: 'select', options: ['0 - Yok', '1 - Var'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: YOK; 1: VAR' },
  { id: 'perino_invazyon', label: 'Perinöral İnvazyon (PNI)', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },
  { id: 'n', label: 'N Evresi (Nod)', type: 'select', options: ['0 - N0', '1 - N1', '2 - N2', '3 - N3a', '4 - N3b'], category: 'Tümör Patolojisi & Evreleme', active: true, description: '0: N0; 1: N1; 2: N2; 3: N3a; 4: N3b' },

  // Cerrahi & Tedavi
  { id: 'treatment_intent', label: 'Tedavi Amacı', type: 'select', options: ['Küratif', 'Palyatif', 'Neoadjuvan Sonrası Küratif'], category: 'Cerrahi & Tedavi', active: true, description: 'Tedavinin küratif mi yoksa palyatif mi olacağı' },
  { id: 'cer_turu', label: 'Cerrahi Prosedür', type: 'select', options: ['1 - Total Gastrektomi', '2 - Subtotal Gastrektomi', '3 - Palyatif Rezeksiyon'], category: 'Cerrahi & Tedavi', active: true, description: '1: Total Gastrektomi; 2: Subtotal Gastrektomi; 3: Palyatif Rezeksiyon' },
  { id: 'total_subtotal', label: 'Total/Subtotal', type: 'text', category: 'Cerrahi & Tedavi', active: true, description: 'Total veya subtotal durumu.' },
  { id: 'lymph_node_dissection', label: 'Lenf Nodu Diseksiyon Genişliği', type: 'select', options: ['D0', 'D1', 'D1+', 'D2', 'D2+'], category: 'Cerrahi & Tedavi', active: true, description: 'D2 lenfadenektomi standart küratif cerrahi gereksinimdir.' },
  { id: 'retrieved_ln', label: 'Çıkarılan Lenf Nodu Sayısı', type: 'number', category: 'Cerrahi & Tedavi', active: true, description: 'En az 16 (ideal olarak >=30) lenf nodu çıkarılmış olmalıdır.' },
  { id: 'positive_ln', label: 'Metastatik Lenf Nodu Sayısı', type: 'number', category: 'Cerrahi & Tedavi', active: true, description: 'Kanser hücresi tutulumu saptanan lenf nodu sayısı.' },
  { id: 'rezeksiyon_tipi', label: 'Rezeksiyon Sınırı (R)', type: 'select', options: ['0 - R0', '1 - R1', '2 - R2'], category: 'Cerrahi & Tedavi', active: true, description: '0: R0; 1: R1; 2: R2' },
  { id: 'neoadjuvan_tedavi', label: 'Neoadjuvan Tedavi', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Cerrahi & Tedavi', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },
  { id: 'adjuvan_tedavi', label: 'Adjuvan Tedavi', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Cerrahi & Tedavi', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },
  { id: 'adjuvan_tedavi_turu', label: 'Adjuvan Tedavi Türü', type: 'select', options: ['1 - KTRT', '2 - Sadece KT'], category: 'Cerrahi & Tedavi', active: true, description: '1: KTRT; 2: Sadece KT' },
  { id: 'adjuvan_kt', label: 'Adjuvan KT', type: 'select', options: ['1 - FUFA-RT', '2 - FOLFOX RT', '3 - XELOX RT', '4 - Sadece KT', '5 - Bilgi Yok'], category: 'Cerrahi & Tedavi', active: true, description: '1: FUFA-RT; 2: FOLFOX RT; 3: XELOX RT; 4: Sadece KT; 5: Bilgi Yok' },
  { id: 'relaps', label: 'Relaps', type: 'select', options: ['0 - Relaps Yok', '1 - Relaps Var', '2 - Bilgi Yok'], category: 'Cerrahi & Tedavi', active: true, description: '0: Relaps Yok; 1: Relaps Var; 2: Bilgi Yok' },
  { id: 'lokal_nuks', label: 'Lokal Nüks', type: 'select', options: ['0 - Yok', '1 - Var', '2 - Bilgi Yok'], category: 'Cerrahi & Tedavi', active: true, description: '0: YOK; 1: VAR; 2: BİLGİ YOK' },
  { id: 'lokal_nuks_tarihi', label: 'Lokal Nüks Tarihi', type: 'date', category: 'Cerrahi & Tedavi', active: true, description: 'Lokal nüks görüldüğü tarih.' },
  { id: 'metastaz_var_mi', label: 'Metastaz Var Mı', type: 'select', options: ['0 - Yok', '1 - Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: YOK; 1: VAR' },
  { id: 'metastaz_yeri', label: 'Metastaz Yeri', type: 'text', category: 'Cerrahi & Tedavi', active: true, description: 'Metastazın bulunduğu bölge.' },
  { id: 'metastaz_tarihi', label: 'Metastaz Tarihi', type: 'date', category: 'Cerrahi & Tedavi', active: true, description: 'Metastaz tarihi.' },
  
  // Metastatik Tedavi & Takip (Eklenen alanlar)
  { id: 'metastatik_durum', label: 'Metastatik Durum', type: 'select', options: ['0 - Progresyon Sonrası', '1 - Başlangıçta Metastatik'], category: 'Cerrahi & Tedavi', active: true, description: '0: Progresyon Sonrası; 1: Başlangıçta Metastatik' },
  { id: 'metastaz_birserikt', label: 'Metastaz İlk Seri KT', type: 'select', options: ['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - ECF_EOF_EOX_ECX', '7 - Diğer', '8 - BSC'], category: 'Cerrahi & Tedavi', active: true, description: 'Metastatik ilk seri tedavi rejimi.' },
  { id: 'metastatik_ilk_seri_tedaviye_cevap', label: 'Metastatik İlk Seri Tedaviye Cevap', type: 'select', options: ['1 - CR', '2 - PR', '3 - SD', '4 - PD', '5 - Bilinmiyor'], category: 'Cerrahi & Tedavi', active: true, description: '1: CR; 2: PR; 3: SD; 4: PD; 5: Bilinmiyor' },
  { id: 'met_1_tedavi_sonrasi_pd', label: 'Metastatik 1. Tedavi Sonrası PD', type: 'select', options: ['0 - Progresyon Yok', '1 - Progresyon Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: Progresyon Yok; 1: Progresyon Var' },
  { id: 'met_2_seri_tedavi_rejimi', label: 'Metastaz 2. Seri Tedavi Rejimi', type: 'select', options: ['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - ECF_EOF_ECX_EOX', '7 - Diğer', '8 - BSC'], category: 'Cerrahi & Tedavi', active: true, description: 'Metastatik 2. seri tedavi rejimi.' },
  { id: 'met_2_seri_tedaviye_cevap', label: 'Metastatik 2. Seri Tedaviye Cevap', type: 'select', options: ['1 - CR', '2 - PR', '3 - SD', '4 - PD'], category: 'Cerrahi & Tedavi', active: true, description: '1: CR; 2: PR; 3: SD; 4: PD' },
  { id: 'met_2_seri_sonrasi_pd', label: 'Metastatik 2. Seri Sonrası PD', type: 'select', options: ['0 - Progresyon Yok', '1 - Progresyon Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: Progresyon Yok; 1: Progresyon Var' },
  { id: 'met_3_seri_tedavi_rejimi', label: 'Metastaz 3. Seri Tedavi Rejimi', type: 'select', options: ['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - Tek Ajan Paklitaksel', '7 - Diğer', '8 - BSC'], category: 'Cerrahi & Tedavi', active: true, description: 'Metastatik 3. seri tedavi rejimi.' },
  { id: 'met_3_seri_tedaviye_cevap', label: 'Metastatik 3. Seri Tedaviye Cevap', type: 'select', options: ['1 - CR', '2 - PR', '3 - SD', '4 - PD'], category: 'Cerrahi & Tedavi', active: true, description: '1: CR; 2: PR; 3: SD; 4: PD' },
  { id: 'met_3_seri_sonrasi_pd', label: 'Metastatik 3. Seri Sonrası PD', type: 'select', options: ['0 - Progresyon Yok', '1 - Progresyon Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: Progresyon Yok; 1: Progresyon Var' },
  { id: 'idame_xeloda_sonrasi_progresyon_var_mi', label: 'İdame Xeloda Sonrası Progresyon', type: 'select', options: ['0 - Progresyon Yok', '1 - Progresyon Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: Progresyon Yok; 1: Progresyon Var' },
  { id: 'trastuzumab_kullanimi', label: 'Trastuzumab Kullanımı', type: 'select', options: ['0 - Yok', '1 - Var'], category: 'Cerrahi & Tedavi', active: true, description: '0: YOK; 1: VAR' },
  { id: 'hastanin_son_durumu', label: 'Hastanın Son Durumu', type: 'select', options: ['0 - Exitus', '1 - Yaşıyor', '2 - Hastalık Dışı Exitus'], category: 'Cerrahi & Tedavi', active: true, description: '0: Exitus; 1: Yaşıyor; 2: Hastalık Dışı Exitus' },
  { id: 'medical_oncology', label: 'Medikal / Radyoterapi Tedavileri', type: 'multiselect', options: ['Neoadjuvan Kemoterapi (FLOT vd.)', 'Adjuvan Kemoterapi', 'Kemoradyoterapi', 'İmmünoterapi (Nivolumab vd.)', 'Hedefe Yönelik (Trastuzumab, Zolbetuximab)', 'Hiçbiri'], category: 'Cerrahi & Tedavi', active: true, description: 'Neoadjuvan/adjuvan kemoterapi (FLOT), immünoterapi ve akıllı ilaçlar (Trastuzumab, Zolbetuximab) ile hastaya özel tedavi protokolü.' }
];
`;

fs.writeFileSync('src/lib/schema.ts', defaultSchema);
console.log('Fixed schema');
