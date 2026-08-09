const fs = require('fs');

// Fix PatientForm.tsx
let pf = fs.readFileSync('src/pages/PatientForm.tsx', 'utf8');
pf = pf.replace(/if \(schemaSnap\.exists\(\)\) \{\s*activeFields = schemaSnap\.data\(\)\.fields;\s*\}/, 
`if (schemaSnap.exists()) {
          activeFields = schemaSnap.data().fields.map((field: any) => {
            const df = defaultFormFields.find(d => d.id === field.id);
            if (df) {
              return { ...field, label: df.label, type: df.type, options: df.options };
            }
            return field;
          });
        }`);
fs.writeFileSync('src/pages/PatientForm.tsx', pf);

// Fix FormBuilder.tsx
let fb = fs.readFileSync('src/pages/FormBuilder.tsx', 'utf8');
fb = fb.replace(/if \(snap\.exists\(\)\) \{\s*setFields\(snap\.data\(\)\.fields\);\s*\}/, 
`if (snap.exists()) {
          const dbFields = snap.data().fields;
          const mergedFields = dbFields.map((field: any) => {
            const df = defaultFormFields.find(d => d.id === field.id);
            if (df) {
              return { ...field, label: df.label, type: df.type, options: df.options };
            }
            return field;
          });
          // Also add any new fields from defaultFormFields that are not in DB
          defaultFormFields.forEach(df => {
            if (!mergedFields.find((f: any) => f.id === df.id)) {
              mergedFields.push(df);
            }
          });
          setFields(mergedFields);
        }`);
fs.writeFileSync('src/pages/FormBuilder.tsx', fb);

console.log("Done fixing sync");
