const fs = require('fs');

let ei = fs.readFileSync('src/pages/ExcelImport.tsx', 'utf8');
ei = ei.replace(/if \(schemaSnap\.exists\(\)\) \{\s*existingFields = schemaSnap\.data\(\)\.fields;\s*\}/, 
`if (schemaSnap.exists()) {
        existingFields = schemaSnap.data().fields.map((field: any) => {
          const df = defaultFormFields.find(d => d.id === field.id);
          if (df) {
            return { ...field, label: df.label, type: df.type, options: df.options };
          }
          return field;
        });
      }`);
fs.writeFileSync('src/pages/ExcelImport.tsx', ei);
console.log("Done fixing sync for ExcelImport");
