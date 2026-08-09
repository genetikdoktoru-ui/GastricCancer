import { useState, useEffect } from 'react';
import { defaultFormFields, FormField } from '../lib/schema';
import { doc, getDoc, setDoc, collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Check, X, Save, Copy, RotateCcw } from 'lucide-react';

export function FormBuilder() {
  const [fields, setFields] = useState<FormField[]>(defaultFormFields);
  const [loading, setLoading] = useState(true);
  const [savedTemplates, setSavedTemplates] = useState<{id: string, name: string, fields: FormField[]}[]>([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [notification, setNotification] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const docRef = doc(db, 'config', 'form_schema');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
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
        }

        const templatesSnap = await getDocs(collection(db, 'form_schemas'));
        const templates = templatesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        setSavedTemplates(templates);
      } catch (err) {
        console.error('Error loading schema', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const saveActiveSchema = async () => {
    try {
      await setDoc(doc(db, 'config', 'form_schema'), { fields });
      setNotification('Form başarıyla uygulamada aktif edildi!');
      setTimeout(() => setNotification(''), 3000);
    } catch (err) {
      console.error(err);
      setNotification('Hata oluştu.');
      setTimeout(() => setNotification(''), 3000);
    }
  };

  const saveNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('Lütfen şablon için bir isim girin.');
      return;
    }
    setIsSavingTemplate(true);
    try {
      const docRef = await addDoc(collection(db, 'form_schemas'), {
        name: newTemplateName,
        fields,
        createdAt: new Date().toISOString()
      });
      setSavedTemplates([...savedTemplates, { id: docRef.id, name: newTemplateName, fields }]);
      setNewTemplateName('');
      alert('Şablon başarıyla kaydedildi!');
    } catch (err) {
      console.error(err);
      alert('Şablon kaydedilirken hata oluştu.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const loadTemplate = (templateFields: FormField[]) => {
    setNotification('Şablon yüklendi. Aktif etmek için "Aktif Form Olarak Kaydet"e basınız.');
    setTimeout(() => setNotification(''), 4000);
    setFields(templateFields);
  };

  const toggleField = (id: string) => {
    setFields((fields as any[]).map(f => f.id === id ? { ...f, active: !f.active } : f));
  };

  const groupedFields = fields.reduce((acc, field) => {
    if (!acc[field.category]) acc[field.category] = [];
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, FormField[]>);

  if (loading) return <div>Yükleniyor...</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Form Özelleştirme</h1>
          <p className="text-slate-600 mt-1">Araştırmanızda sık/nadir kullanacağınız alanları aktif/inaktif yapın.</p>
        </div>
        <button 
          onClick={saveActiveSchema}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
        >
          <Check className="w-5 h-5" />
          Aktif Form Olarak Kaydet
        </button>
      </div>

      <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6 justify-between items-center">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <input 
            type="text" 
            placeholder="Şablon Adı..." 
            className="border border-slate-300 rounded-lg px-4 py-2 w-full md:w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={newTemplateName}
            onChange={e => setNewTemplateName(e.target.value)}
          />
          <button 
            onClick={saveNewTemplate}
            disabled={isSavingTemplate}
            className="bg-slate-800 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-700 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Save className="w-4 h-4" />
            Şablon Olarak Kaydet
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto overflow-x-auto">
          <select 
            className="border border-slate-300 rounded-lg px-4 py-2 bg-slate-50 focus:ring-2 focus:ring-blue-500 outline-none min-w-[200px]"
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'default') {
                loadTemplate(defaultFormFields);
              } else if (val) {
                const template = savedTemplates.find(t => t.id === val);
                if (template) loadTemplate(template.fields);
              }
              e.target.value = ''; // Reset select after action
            }}
          >
            <option value="">Şablon Yükle...</option>
            <option value="default">Varsayılan Form (Tüm Alanlar)</option>
            {savedTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          
          <button 
            onClick={() => loadTemplate(defaultFormFields)}
            className="text-slate-600 bg-slate-100 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            Varsayılana Dön
          </button>
        </div>
      </div>

      <div className="grid gap-8">
        {Object.entries(groupedFields).map(([category, catFields]) => (
          <div key={category} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800">{category}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {(catFields as any[]).map(field => (
                <div key={field.id} className="p-6 flex items-start gap-4">
                  <button
                    onClick={() => toggleField(field.id)}
                    className={`mt-1 flex-shrink-0 w-12 h-6 rounded-full transition-colors relative ${field.active ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${field.active ? 'left-7' : 'left-1'}`} />
                  </button>
                  <div>
                    <h3 className="font-medium text-slate-900 flex items-center gap-2">
                      {field.label}
                      {!field.active && <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">İnaktif</span>}
                    </h3>
                    <div className="text-sm text-slate-500 mt-1">Tip: {field.type}</div>
                    {field.description && (
                      <p className="text-sm text-slate-600 mt-2 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <span className="font-semibold text-blue-800 text-xs uppercase tracking-wider block mb-1">Neden Önemli?</span>
                        {field.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
