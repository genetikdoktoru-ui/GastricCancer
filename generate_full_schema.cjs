const fs = require('fs');

const cellsContent = fs.readFileSync('cells.txt', 'utf8');
const lines = cellsContent.split('\n');

const generatedFields = [];
const letters = [];
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

const headerRegex = /\[(\d+)\]\s+(.+?)(\[\d+\])?$/;

for (const line of lines) {
  if (!line.trim()) continue;
  
  // Try to parse [index] TITLE [footnote_index]
  const match = line.match(/\[(\d+)\]\s+(.+?)(\[\d+\])?$/);
  if (match) {
    const colIdx = parseInt(match[1]);
    const title = match[2].trim();
    const colLetter = getColLetter(colIdx); // 0 -> A, 1 -> B, etc
    
    // Only process columns B to DZ (indexes 1 to 129)
    if (colIdx >= 1 && colIdx <= 129) {
      let fieldId = title.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      if (!fieldId || fieldId.length < 2) {
          fieldId = `col_${colLetter.toLowerCase()}`;
      }
      
      const label = `[${colLetter}] ${title}`;
      const description = `(${colLetter}) ${title}`;
      
      generatedFields.push(`  { id: '${fieldId}', label: '${label.replace(/'/g, "\\'")}', type: 'text', category: 'Excel İçe Aktarılan Değişkenler (B-DZ)', active: true, description: '${description.replace(/'/g, "\\'")}' }`);
    }
  }
}

// Also add research_id at the very beginning of the fields list
const researchIdField = `  { id: 'research_id', label: 'Araştırma ID (Kodu)', type: 'text', category: 'Genel Bilgiler', active: true, description: 'Örn: GST-001' }`;

let schemaContent = fs.readFileSync('src/lib/schema.ts', 'utf8');
// Keep everything before defaultFormFields
const prefixMatch = schemaContent.match(/([\s\S]*?)export const defaultFormFields: FormField\[\] = \[/);
if (prefixMatch) {
  const newContent = prefixMatch[1] + 'export const defaultFormFields: FormField[] = [\n' + researchIdField + ',\n' + generatedFields.join(',\n') + '\n];\n';
  fs.writeFileSync('src/lib/schema.ts', newContent);
  console.log('Successfully updated src/lib/schema.ts with ' + generatedFields.length + ' fields.');
} else {
  console.log('Failed to find defaultFormFields array');
}
