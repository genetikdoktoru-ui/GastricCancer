function normalizeTitle(text) {
  if (!text) return '';
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}
console.log(normalizeTitle('CİNSİYET'));
console.log(normalizeTitle('KİLO KAYBI'));
console.log(normalizeTitle('KANSER TİPİ'));
console.log(normalizeTitle('HİSTOLOJİ BORMANN'));
