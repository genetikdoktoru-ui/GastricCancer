const fs = require('fs');
let content = fs.readFileSync('src/pages/FormBuilder.tsx', 'utf8');

// Add state
content = content.replace(/const \[isSavingTemplate, setIsSavingTemplate\] = useState\(false\);/, 
`const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [notification, setNotification] = useState('');`);

// Replace alert with setNotification
content = content.replace(/alert\('Form başarıyla uygulamada aktif edildi!'\);/g, 
`setNotification('Form başarıyla uygulamada aktif edildi!');
      setTimeout(() => setNotification(''), 3000);`);

content = content.replace(/alert\('Hata oluştu.'\);/g, 
`setNotification('Hata oluştu.');
      setTimeout(() => setNotification(''), 3000);`);

// For loadTemplate, since we removed confirm, let's also show a notification
content = content.replace(/const loadTemplate = \(templateFields: FormField\[\]\) => {/, 
`const loadTemplate = (templateFields: FormField[]) => {
    setNotification('Şablon yüklendi. Aktif etmek için "Aktif Form Olarak Kaydet"e basınız.');
    setTimeout(() => setNotification(''), 4000);`);

// Display notification below the header
content = content.replace(/<div className="flex items-center gap-3">/, 
`{notification && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg mb-6 flex items-center gap-3 shadow-sm">
          <Check className="w-5 h-5" />
          <span className="font-medium">{notification}</span>
        </div>
      )}
      <div className="flex items-center gap-3">`);

fs.writeFileSync('src/pages/FormBuilder.tsx', content);
