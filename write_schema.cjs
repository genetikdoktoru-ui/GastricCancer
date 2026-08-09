const fs = require('fs');

function getColLetter(index) {
  let temp = index + 1;
  let letter = '';
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

function textToFieldId(text, colIndex) {
  if (!text || !text.trim()) {
    return `col_${getColLetter(colIndex).toLowerCase()}`;
  }
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const cellsContent = fs.readFileSync('cells.txt', 'utf8');
const lines = cellsContent.split('\n');

const generatedFields = [];

generatedFields.push(`  { id: 'research_id', label: '(B) DOSYA NO (Araştırma ID)', type: 'text', category: 'Genel Bilgiler', active: true }`);

const specificLabels = {
  5: '(F) CİNSİYET. 1: ERKEK; 2: KADIN',
  6: '(G) PER.DURUM. 0: PS0; 1: PS1; 2: PS2; 3: PS3; 4: PS4; 5: BİLGİ YOK',
  7: '(H) AİLE ÖYKÜSÜ. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  8: '(I) KİLO KAYBI. 1: YOK; 2: VAR; 3: BİLGİ YOK',
  9: '(J) SİGARA. 1: YOK; 2: VAR; 3: BİLGİ YOK',
  10: '(K) LOKALİZA. 1: DİSTAL; 2: PROKSİMAL',
  11: '(L) KANSER TİPİ. 1: Adenokarsinom; 2: Skuamöz Hücreli Ca; 3: Nöroendokrin Karsinom; 4: Lenfoma; 5: GİST',
  12: '(M) HİSTOLOJİ BORMANN. 1: Polipoid; 2: Fungal; 3: Ülseröz; 4: Diffüz İnfiltran; 5: Vegetan; 6: Ülsero Vegetan',
  13: '(N) HİSTOLOJİ WHO. 1: Papiller; 2: Tubuler; 3: Müsinöz; 4: Taşlı Yüzük; 6: Kribriform; 7: Miks Histoloji; 8: Solid Patern',
  14: '(O) HİSTOLOJİ MİNG. 1: İnfiltratif; 2: Ekspansif; 3: Expansif İnfitratif',
  17: '(R) T. 1: T1a; 2: T1b; 3: T2; 4: T3; 5: T4a; 6: T4b',
  18: '(S) N. 0: N0; 1: N1; 2: N2; 3: N3a; 4: N3b',
  19: '(T) M. 0: M0; 1: M1',
  23: '(X) LENF İNVAZYON. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  24: '(Y) VASK İNFAZYON. 0: YOK; 1: VAR',
  25: '(Z) PERİNÖ İNVAZYON. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  26: '(AA) GRADE. 1: Grade 1; 2: Grade 2; 3: Grade 3',
  27: '(AB) TAŞLI YÜZÜK. 0: YOK; 1: VAR',
  28: '(AC) HER2. 0: Negatif; 1: 1+; 2: 2+; 3: 3+',
  29: '(AD) HER2FİSH. 0: Negatif; 1: Pozitif; 2: Bilgi Yok',
  30: '(AE) MUSİN. 0: YOK; 1: VAR',
  31: '(AF) CER. TÜRÜ. 1: Total Gastrektomi; 2: Subtotal Gastrektomi; 3: Palyatif Rezeksiyon',
  33: '(AH) REZEKSİYON TİPİ. 0: R0; 1: R1; 2: R2',
  34: '(AI) RELAPS. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  35: '(AJ) LOKAL NÜKS. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  37: '(AL) METASTAZ_VAR_MI. 0: YOK; 1: VAR',
  40: '(AO) NEOADJUVAN TEDAVİ. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  41: '(AP) ADJUVAN TEDAVİ. 0: YOK; 1: VAR; 2: BİLGİ YOK',
  42: '(AQ) ADJUVAN TEDAVİ TÜRÜ. 1: KTRT; 2: Sadece KT',
  43: '(AR) ADJUVAN KT. 1: FUFA-RT; 2: FOLFOX RT; 3: XELOX RT; 4: Sadece KT; 5: Bilgi Yok',
  46: '(AU) METASTATİK DURUM. 0: Progresyon Sonrası; 1: Başlangıçta Metastatik',
  48: '(AW) METASTAZ_BİRSERİKT. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: ECF_EOF_EOX_ECX; 7: Diğer; 8: BSC',
  50: '(AY) METASTATİK İLK SERİ TEDAVİYE CEVAP. 1: CR; 2: PR; 3: SD; 4: PD; 5: Bilinmiyor',
  51: '(AZ) MET 1 TEDAVİ SONRASI PD. 0: YOK; 1: VAR',
  54: '(BC) MET 2.SERİ TEDAVİ REJİMİ. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: ECF_EOF_ECX_EOX; 7: Diğer; 8: BSC',
  57: '(BF) MET 2.SERİ TEDAVİYE CEVAP. 1: CR; 2: PR; 3: SD; 4: PD',
  58: '(BG) MET 2.SERİ SONRASI PD. 0: YOK; 1: VAR',
  61: '(BJ) MET 3.SERİ TEDAVİ REJİMİ. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: Tek Ajan Paklitaksel; 7: Diğer; 8: BSC',
  64: '(BM) MET 3.SERİ TEDAVİYE CEVAP. 1: CR; 2: PR; 3: SD; 4: PD',
  65: '(BN) MET 3.SERİ SONRASI PD. 0: YOK; 1: VAR',
  71: '(BT) İDAME XELODA SONRASI PROGRESYON VAR MI. 0: YOK; 1: VAR',
  74: '(BW) TRASTUZUMAB KULLANIMI. 0: YOK; 1: VAR',
  76: '(BY) HASTANIN SON DURUMU. 0: Exitus; 1: Yaşıyor; 2: Hastalık Dışı Exitus'
};

const specificOptions = {
  5: "['1 - Erkek', '2 - Kadın']",
  6: "['0 - PS0', '1 - PS1', '2 - PS2', '3 - PS3', '4 - PS4', '5 - Bilgi Yok']",
  7: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  8: "['1 - Yok', '2 - Var', '3 - Bilgi Yok']",
  9: "['1 - Yok', '2 - Var', '3 - Bilgi Yok']",
  10: "['1 - Distal', '2 - Proksimal']",
  11: "['1 - Adenokarsinom', '2 - Skuamöz Hücreli Ca', '3 - Nöroendokrin Karsinom', '4 - Lenfoma', '5 - GİST']",
  12: "['1 - Polipoid', '2 - Fungal', '3 - Ülseröz', '4 - Diffüz İnfiltran', '5 - Vegetan', '6 - Ülsero Vegetan']",
  13: "['1 - Papiller', '2 - Tubuler', '3 - Müsinöz', '4 - Taşlı Yüzük', '6 - Kribriform', '7 - Miks Histoloji', '8 - Solid Patern']",
  14: "['1 - İnfiltratif', '2 - Ekspansif', '3 - Expansif İnfitratif']",
  17: "['1 - T1a', '2 - T1b', '3 - T2', '4 - T3', '5 - T4a', '6 - T4b']",
  18: "['0 - N0', '1 - N1', '2 - N2', '3 - N3a', '4 - N3b']",
  19: "['0 - M0', '1 - M1']",
  23: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  24: "['0 - Yok', '1 - Var']",
  25: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  26: "['1 - Grade 1 (İyi)', '2 - Grade 2 (Orta)', '3 - Grade 3 (Kötü)']",
  27: "['0 - Yok', '1 - Var']",
  28: "['0 - Negatif', '1 - 1+', '2 - 2+', '3 - 3+']",
  29: "['0 - Negatif', '1 - Pozitif', '2 - Bilgi Yok']",
  30: "['0 - Yok', '1 - Var']",
  31: "['1 - Total Gastrektomi', '2 - Subtotal Gastrektomi', '3 - Palyatif Rezeksiyon']",
  33: "['0 - R0', '1 - R1', '2 - R2']",
  34: "['0 - Relaps Yok', '1 - Relaps Var', '2 - Bilgi Yok']",
  35: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  37: "['0 - Yok', '1 - Var']",
  40: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  41: "['0 - Yok', '1 - Var', '2 - Bilgi Yok']",
  42: "['1 - KTRT', '2 - Sadece KT']",
  43: "['1 - FUFA-RT', '2 - FOLFOX RT', '3 - XELOX RT', '4 - Sadece KT', '5 - Bilgi Yok']",
  46: "['0 - Progresyon Sonrası', '1 - Başlangıçta Metastatik']",
  48: "['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - ECF_EOF_EOX_ECX', '7 - Diğer', '8 - BSC']",
  50: "['1 - CR', '2 - PR', '3 - SD', '4 - PD', '5 - Bilinmiyor']",
  51: "['0 - Progresyon Yok', '1 - Progresyon Var']",
  54: "['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - ECF_EOF_ECX_EOX', '7 - Diğer', '8 - BSC']",
  57: "['1 - CR', '2 - PR', '3 - SD', '4 - PD']",
  58: "['0 - Progresyon Yok', '1 - Progresyon Var']",
  61: "['1 - FUFA-XELODA', '2 - FOLFOX/XELOX', '3 - FOLFIRI/XELİRİ', '4 - CF/CX', '5 - DCF/DCX', '6 - Tek Ajan Paklitaksel', '7 - Diğer', '8 - BSC']",
  64: "['1 - CR', '2 - PR', '3 - SD', '4 - PD']",
  65: "['0 - Progresyon Yok', '1 - Progresyon Var']",
  71: "['0 - Progresyon Yok', '1 - Progresyon Var']",
  74: "['0 - Yok', '1 - Var']",
  76: "['0 - Exitus', '1 - Yaşıyor', '2 - Hastalık Dışı Exitus']"
};

for (const line of lines) {
  if (!line.trim()) continue;
  
  const match = line.match(/\[(\d+)\]\s+(.+?)(\[\d+\])?$/);
  if (match) {
    const colIdx = parseInt(match[1]);
    const title = match[2].trim();
    const colLetter = getColLetter(colIdx);
    
    // Process B to DZ (indexes 2 to 129 because 0 is SIRA NO, 1 is DOSYA NO which we mapped to research_id)
    if (colIdx >= 2 && colIdx <= 129) {
      let fieldId = textToFieldId(title, colIdx);
      
      let label = `(${colLetter}) ${title}`;
      let type = 'text';
      let optionsStr = '';
      
      if (title.includes('TARİH')) type = 'date';
      else if (title.includes('SAYISI') || title.includes('YAŞ') || title.includes('ÇAPI') || title.includes('BMI') || title.includes('OS') || title.includes('DFS') || title.includes('PFS')) type = 'number';
      else if (title.includes('RAPOR')) type = 'textarea';
      
      if (specificLabels[colIdx]) {
        label = specificLabels[colIdx];
        type = 'select';
        optionsStr = `, options: ${specificOptions[colIdx]}`;
      }
      
      // Categorize properly
      let category = 'Genel Bilgiler';
      if (colIdx >= 4 && colIdx <= 9) category = 'Demografik & Yaşam Tarzı';
      else if (colIdx >= 10 && colIdx <= 30) category = 'Tümör Patolojisi & Evreleme';
      else if (colIdx >= 31 && colIdx <= 45) category = 'Cerrahi & Tedavi';
      else if (colIdx >= 46 && colIdx <= 75) category = 'Metastatik Tedavi';
      else if (colIdx >= 76) category = 'Klinik Sonuçlar';

      generatedFields.push(`  { id: '${fieldId}', label: '${label.replace(/'/g, "\\'")}', type: '${type}'${optionsStr}, category: '${category}', active: true }`);
    }
  }
}

let schemaContent = fs.readFileSync('src/lib/schema.ts', 'utf8');
const prefixMatch = schemaContent.match(/([\s\S]*?)export const defaultFormFields: FormField\[\] = \[/);
if (prefixMatch) {
  const newContent = prefixMatch[1] + 'export const defaultFormFields: FormField[] = [\n' + generatedFields.join(',\n') + '\n];\n';
  fs.writeFileSync('src/lib/schema.ts', newContent);
  console.log('Successfully updated src/lib/schema.ts');
} else {
  console.log('Failed to find defaultFormFields array');
}
