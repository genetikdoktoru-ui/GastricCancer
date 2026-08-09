const fs = require('fs');
let content = fs.readFileSync('src/lib/schema.ts', 'utf8');

// Parse the default fields array
const arrayMatch = content.match(/export const defaultFormFields: FormField\[\] = \[([\s\S]*?)\];/);
if (!arrayMatch) {
  console.log("Could not find array");
  process.exit(1);
}

let fieldsStr = arrayMatch[1];

// We need to parse each object and fix its type and options if the label has " 1: ..., 2: ..."
// A safer way is to just use regex replace on the entire file.

content = content.replace(/\{([^}]+)\}/g, (match, inner) => {
  // If it already has options, skip
  if (inner.includes("options:")) return match;

  // Extract label
  const labelMatch = inner.match(/label:\s*'([^']+)'/);
  if (!labelMatch) return match;
  
  const label = labelMatch[1];
  
  // Look for options in label like ". 1: X; 2: Y" or ". 0: A; 1: B"
  const optionsMatch = label.match(/\.\s*(\d+:\s*[^;]+(?:;\s*\d+:\s*[^;]+)*)$/);
  if (optionsMatch) {
    const optsStr = optionsMatch[1];
    const opts = optsStr.split(';').map(o => {
      const parts = o.trim().split(':');
      if (parts.length === 2) {
        return `'${parts[0].trim()} - ${parts[1].trim()}'`;
      }
      return null;
    }).filter(Boolean);
    
    if (opts.length > 0) {
      // Replace type: 'text' with type: 'select' and append options
      let newInner = inner.replace(/type:\s*'text'/, `type: 'select', options: [${opts.join(', ')}]`);
      return `{${newInner}}`;
    }
  }
  return match;
});

fs.writeFileSync('src/lib/schema.ts', content);
console.log("Fixed schema options");
