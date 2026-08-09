const fs = require('fs');

let content = fs.readFileSync('src/lib/schema.ts', 'utf8');

const regex = /label:\s*'([^']+)'/g;

content = content.replace(regex, (match, labelText) => {
  if (labelText.includes('. ')) {
    // Keep exactly the text with no additional descriptions since we removed field.description
    return match;
  }
  return match;
});

// Since the user specifically complained about J, let's fix the labels based on their exact instructions.
// They want: (J) Sigara. 1: YOK; 2: VAR; 3: BİLGİ YOK
content = content.replace(/label: '\(F\) CİNSİYET\. 1: ERKEK; 2: KADIN'/g, "label: '(F) Cinsiyet. 1: ERKEK; 2: KADIN'");
content = content.replace(/label: '\(G\) PER\.DURUM\. 0: PS0; 1: PS1; 2: PS2; 3: PS3; 4: PS4; 5: BİLGİ YOK'/g, "label: '(G) Per.Durum. 0: PS0; 1: PS1; 2: PS2; 3: PS3; 4: PS4; 5: BİLGİ YOK'");
content = content.replace(/label: '\(H\) AİLE ÖYKÜSÜ\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(H) Aile Öyküsü. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(I\) KİLO KAYBI\. 1: YOK; 2: VAR; 3: BİLGİ YOK'/g, "label: '(I) Kilo Kaybı. 1: YOK; 2: VAR; 3: BİLGİ YOK'");
content = content.replace(/label: '\(J\) SİGARA\. 1: YOK; 2: VAR; 3: BİLGİ YOK'/g, "label: '(J) Sigara. 1: YOK; 2: VAR; 3: BİLGİ YOK'");
content = content.replace(/label: '\(K\) LOKALİZA\. 1: DİSTAL; 2: PROKSİMAL'/g, "label: '(K) Lokaliza. 1: DİSTAL; 2: PROKSİMAL'");
content = content.replace(/label: '\(L\) KANSER TİPİ\. 1: Adenokarsinom; 2: Skuamöz Hücreli Ca; 3: Nöroendokrin Karsinom; 4: Lenfoma; 5: GİST'/g, "label: '(L) Kanser Tipi. 1: Adenokarsinom; 2: Skuamöz Hücreli Ca; 3: Nöroendokrin Karsinom; 4: Lenfoma; 5: GİST'");
content = content.replace(/label: '\(M\) HİSTOLOJİ BORMANN\. 1: Polipoid; 2: Fungal; 3: Ülseröz; 4: Diffüz İnfiltran; 5: Vegetan; 6: Ülsero Vegetan'/g, "label: '(M) Histoloji Bormann. 1: Polipoid; 2: Fungal; 3: Ülseröz; 4: Diffüz İnfiltran; 5: Vegetan; 6: Ülsero Vegetan'");
content = content.replace(/label: '\(N\) HİSTOLOJİ WHO\. 1: Papiller; 2: Tubuler; 3: Müsinöz; 4: Taşlı Yüzük; 6: Kribriform; 7: Miks Histoloji; 8: Solid Patern'/g, "label: '(N) Histoloji WHO. 1: Papiller; 2: Tubuler; 3: Müsinöz; 4: Taşlı Yüzük; 6: Kribriform; 7: Miks Histoloji; 8: Solid Patern'");
content = content.replace(/label: '\(O\) HİSTOLOJİ MİNG\. 1: İnfiltratif; 2: Ekspansif; 3: Expansif İnfitratif'/g, "label: '(O) Histoloji Ming. 1: İnfiltratif; 2: Ekspansif; 3: Expansif İnfitratif'");
content = content.replace(/label: '\(R\) T\. 1: T1a; 2: T1b; 3: T2; 4: T3; 5: T4a; 6: T4b'/g, "label: '(R) T. 1: T1a; 2: T1b; 3: T2; 4: T3; 5: T4a; 6: T4b'");
content = content.replace(/label: '\(S\) N\. 0: N0; 1: N1; 2: N2; 3: N3a; 4: N3b'/g, "label: '(S) N. 0: N0; 1: N1; 2: N2; 3: N3a; 4: N3b'");
content = content.replace(/label: '\(T\) M\. 0: M0; 1: M1'/g, "label: '(T) M. 0: M0; 1: M1'");
content = content.replace(/label: '\(X\) LENF İNVAZYON\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(X) Lenf İnvazyon. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(Y\) VASK İNFAZYON\. 0: YOK; 1: VAR'/g, "label: '(Y) Vask İnvazyon. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(Z\) PERİNÖ İNVAZYON\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(Z) Perinö İnvazyon. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(AA\) GRADE\. 1: Grade 1; 2: Grade 2; 3: Grade 3'/g, "label: '(AA) Grade. 1: Grade 1; 2: Grade 2; 3: Grade 3'");
content = content.replace(/label: '\(AB\) TAŞLI YÜZÜK\. 0: YOK; 1: VAR'/g, "label: '(AB) Taşlı Yüzük. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(AC\) HER2\. 0: Negatif; 1: 1\+; 2: 2\+; 3: 3\+'/g, "label: '(AC) HER2. 0: Negatif; 1: 1+; 2: 2+; 3: 3+'");
content = content.replace(/label: '\(AD\) HER2FİSH\. 0: Negatif; 1: Pozitif; 2: Bilgi Yok'/g, "label: '(AD) HER2FİSH. 0: Negatif; 1: Pozitif; 2: Bilgi Yok'");
content = content.replace(/label: '\(AE\) MUSİN\. 0: YOK; 1: VAR'/g, "label: '(AE) Musin. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(AF\) CER\. TÜRÜ\. 1: Total Gastrektomi; 2: Subtotal Gastrektomi; 3: Palyatif Rezeksiyon'/g, "label: '(AF) Cer. Türü. 1: Total Gastrektomi; 2: Subtotal Gastrektomi; 3: Palyatif Rezeksiyon'");
content = content.replace(/label: '\(AH\) REZEKSİYON TİPİ\. 0: R0; 1: R1; 2: R2'/g, "label: '(AH) Rezeksiyon Tipi. 0: R0; 1: R1; 2: R2'");
content = content.replace(/label: '\(AI\) RELAPS\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(AI) Relaps. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(AJ\) LOKAL NÜKS\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(AJ) Lokal Nüks. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(AL\) METASTAZ_VAR_MI\. 0: YOK; 1: VAR'/g, "label: '(AL) Metastaz Var Mı. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(AO\) NEOADJUVAN TEDAVİ\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(AO) Neoadjuvan Tedavi. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(AP\) ADJUVAN TEDAVİ\. 0: YOK; 1: VAR; 2: BİLGİ YOK'/g, "label: '(AP) Adjuvan Tedavi. 0: YOK; 1: VAR; 2: BİLGİ YOK'");
content = content.replace(/label: '\(AQ\) ADJUVAN TEDAVİ TÜRÜ\. 1: KTRT; 2: Sadece KT'/g, "label: '(AQ) Adjuvan Tedavi Türü. 1: KTRT; 2: Sadece KT'");
content = content.replace(/label: '\(AR\) ADJUVAN KT\. 1: FUFA-RT; 2: FOLFOX RT; 3: XELOX RT; 4: Sadece KT; 5: Bilgi Yok'/g, "label: '(AR) Adjuvan KT. 1: FUFA-RT; 2: FOLFOX RT; 3: XELOX RT; 4: Sadece KT; 5: Bilgi Yok'");
content = content.replace(/label: '\(AU\) METASTATİK DURUM\. 0: Progresyon Sonrası; 1: Başlangıçta Metastatik'/g, "label: '(AU) Metastatik Durum. 0: Progresyon Sonrası; 1: Başlangıçta Metastatik'");
content = content.replace(/label: '\(AW\) METASTAZ_BİRSERİKT\. 1: FUFA-XELODA; 2: FOLFOX\/XELOX; 3: FOLFIRI\/XELİRİ; 4: CF\/CX; 5: DCF\/DCX; 6: ECF_EOF_EOX_ECX; 7: Diğer; 8: BSC'/g, "label: '(AW) Metastaz Bir. Seri KT. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: ECF_EOF_EOX_ECX; 7: Diğer; 8: BSC'");
content = content.replace(/label: '\(AY\) METASTATİK İLK SERİ TEDAVİYE CEVAP\. 1: CR; 2: PR; 3: SD; 4: PD; 5: Bilinmiyor'/g, "label: '(AY) Metastatik İlk Seri Tedaviye Cevap. 1: CR; 2: PR; 3: SD; 4: PD; 5: Bilinmiyor'");
content = content.replace(/label: '\(AZ\) MET 1 TEDAVİ SONRASI PD\. 0: YOK; 1: VAR'/g, "label: '(AZ) Met 1 Tedavi Sonrası PD. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(BC\) MET 2\.SERİ TEDAVİ REJİMİ\. 1: FUFA-XELODA; 2: FOLFOX\/XELOX; 3: FOLFIRI\/XELİRİ; 4: CF\/CX; 5: DCF\/DCX; 6: ECF_EOF_ECX_EOX; 7: Diğer; 8: BSC'/g, "label: '(BC) Met 2.Seri Tedavi Rejimi. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: ECF_EOF_ECX_EOX; 7: Diğer; 8: BSC'");
content = content.replace(/label: '\(BF\) MET 2\.SERİ TEDAVİYE CEVAP\. 1: CR; 2: PR; 3: SD; 4: PD'/g, "label: '(BF) Met 2.Seri Tedaviye Cevap. 1: CR; 2: PR; 3: SD; 4: PD'");
content = content.replace(/label: '\(BG\) MET 2\.SERİ SONRASI PD\. 0: YOK; 1: VAR'/g, "label: '(BG) Met 2.Seri Sonrası PD. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(BJ\) MET 3\.SERİ TEDAVİ REJİMİ\. 1: FUFA-XELODA; 2: FOLFOX\/XELOX; 3: FOLFIRI\/XELİRİ; 4: CF\/CX; 5: DCF\/DCX; 6: Tek Ajan Paklitaksel; 7: Diğer; 8: BSC'/g, "label: '(BJ) Met 3.Seri Tedavi Rejimi. 1: FUFA-XELODA; 2: FOLFOX/XELOX; 3: FOLFIRI/XELİRİ; 4: CF/CX; 5: DCF/DCX; 6: Tek Ajan Paklitaksel; 7: Diğer; 8: BSC'");
content = content.replace(/label: '\(BM\) MET 3\.SERİ TEDAVİYE CEVAP\. 1: CR; 2: PR; 3: SD; 4: PD'/g, "label: '(BM) Met 3.Seri Tedaviye Cevap. 1: CR; 2: PR; 3: SD; 4: PD'");
content = content.replace(/label: '\(BN\) MET 3\.SERİ SONRASI PD\. 0: YOK; 1: VAR'/g, "label: '(BN) Met 3.Seri Sonrası PD. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(BT\) İDAME XELODA SONRASI PROGRESYON VAR MI\. 0: YOK; 1: VAR'/g, "label: '(BT) İdame Xeloda Sonrası Progresyon Var Mı. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(BW\) TRASTUZUMAB KULLANIMI\. 0: YOK; 1: VAR'/g, "label: '(BW) Trastuzumab Kullanımı. 0: YOK; 1: VAR'");
content = content.replace(/label: '\(BY\) HASTANIN SON DURUMU\. 0: Exitus; 1: Yaşıyor; 2: Hastalık Dışı Exitus'/g, "label: '(BY) Hastanın Son Durumu. 0: Exitus; 1: Yaşıyor; 2: Hastalık Dışı Exitus'");

// Remove descriptions completely as requested "VERİNİN GİRİLDİĞİ BOİLUĞUN ALTINA BAŞKA BİR AÇIKLAMA YAZMA Kİ GÖRÜNÜŞ SADE OLSUN"
content = content.replace(/,\s*description:\s*'[^']*'/g, '');

fs.writeFileSync('src/lib/schema.ts', content);
console.log('Fixed labels');
