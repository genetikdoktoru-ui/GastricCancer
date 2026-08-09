const fs = require('fs');

let content = fs.readFileSync('src/pages/ExcelImport.tsx', 'utf8');

const replacement = `function textToFieldId(text: string, colIndex: number): string {
  if (!text || !text.trim()) {
    return \`col_\${indexToColLetter(colIndex).toLowerCase()}\`;
  }
  const str = text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\\u0300-\\u036f]/g, "")
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return str;
}`;

content = content.replace(/function textToFieldId[\s\S]*?return str;\n}/, replacement);
fs.writeFileSync('src/pages/ExcelImport.tsx', content);

console.log("ExcelImport.tsx updated.");
