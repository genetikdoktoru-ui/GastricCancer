const fs = require('fs');

let content = fs.readFileSync('src/pages/PatientForm.tsx', 'utf8');
// Inject a one-time save to Firestore on mount
content = content.replace(/let activeFields = defaultFormFields;/g, 
`let activeFields = defaultFormFields;
        // FORCE UPDATE SCHEMA TO DB ONCE
        try {
          await setDoc(doc(db, 'config', 'form_schema'), { fields: defaultFormFields });
          console.log("Forced update of schema to db");
        } catch(e) {}
`);
fs.writeFileSync('src/pages/PatientForm.tsx', content);
