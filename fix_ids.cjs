const fs = require('fs');

let content = fs.readFileSync('src/lib/schema.ts', 'utf8');

// Replace malformed IDs with proper ones
content = content.replace(/id: 'ya', label: '\(E\) YA'/g, "id: 'yas', label: '(E) YAŞ'");
content = content.replace(/id: 'c_ns_yet'/g, "id: 'cinsiyet'");
content = content.replace(/id: 'a_le_yk_s'/g, "id: 'aile_oykusu'");
content = content.replace(/id: 'k_lo_kaybi'/g, "id: 'kilo_kaybi'");
content = content.replace(/id: 's_gara'/g, "id: 'sigara'");
content = content.replace(/id: 'lokal_za'/g, "id: 'lokaliza'");
content = content.replace(/id: 'kanser_t_p'/g, "id: 'kanser_tipi'");
content = content.replace(/id: 'h_stoloj_bormann'/g, "id: 'histoloji_bormann'");
content = content.replace(/id: 'h_stoloj_who'/g, "id: 'histoloji_who'");
content = content.replace(/id: 'h_stoloj_m_ng'/g, "id: 'histoloji_ming'");
content = content.replace(/id: 'tm_api_cm', label: '\(Q\) TM API \(CM\)'/g, "id: 'tm_capi_cm', label: '(Q) TM ÇAPI (CM)'");
content = content.replace(/id: 'mal_gn_ln_sayisi', label: '\(W\) MALGN LN SAYISI'/g, "id: 'malign_ln_sayisi', label: '(W) MALİGN LN SAYISI'");
content = content.replace(/id: 'lenf_nvazyon'/g, "id: 'lenf_invazyon'");
content = content.replace(/id: 'vask_nfazyon'/g, "id: 'vask_infazyon'");
content = content.replace(/id: 'per_n_nvazyon'/g, "id: 'perino_invazyon'");

fs.writeFileSync('src/lib/schema.ts', content);
console.log('Fixed IDs');
