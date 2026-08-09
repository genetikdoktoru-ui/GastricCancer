const fs = require('fs');

let content = fs.readFileSync('src/lib/schema.ts', 'utf8');

// Replace type: 'select', options: [...] with type: 'text'
content = content.replace(/type:\s*'select',\s*options:\s*\[.*?\],\s*/g, "type: 'text', ");

fs.writeFileSync('src/lib/schema.ts', content);
console.log('Done replacing select with text.');
