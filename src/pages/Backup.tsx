import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { Download, Database, HardDrive, FileJson, Cloud, Loader2, Upload, RefreshCw } from 'lucide-react';
import { logAudit } from '../lib/audit';
import { getCurrentUserRole } from '../lib/auth-helpers';
import { syncDataToGoogleDrive, fetchLatestDriveBackup } from '../lib/driveSync';

export function Backup() {
  const [isExporting, setIsExporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isRestoringFromDrive, setIsRestoringFromDrive] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setAccessToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive.file');
      
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential && credential.accessToken) {
        setAccessToken(credential.accessToken);
      }
    } catch (error) {
      console.error('Sign-in error:', error);
      alert('Google ile giriş yapılırken hata oluştu.');
    }
  };

  const getExportData = async () => {
    const role = await getCurrentUserRole();

    let patientsQuery = collection(db, 'patients') as any;
    let identitiesQuery = collection(db, 'patient_identities') as any;
    let formsQuery = collection(db, 'form_schemas') as any;

    if (role !== 'admin' && auth.currentUser?.email) {
      patientsQuery = query(collection(db, 'patients'), where('createdBy', '==', auth.currentUser.email));
      identitiesQuery = query(collection(db, 'patient_identities'), where('createdBy', '==', auth.currentUser.email));
    }

    const patientsSnap = await getDocs(patientsQuery);
    const patients = patientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    const identitiesSnap = await getDocs(identitiesQuery);
    const identities = identitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    const formsSnap = await getDocs(formsQuery);
    const formSchemas = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

    return {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      data: {
        patients,
        identities,
        formSchemas
      }
    };
  };

  const handleRestoreData = async (parsedData: any) => {
    setIsRestoring(true);
    try {
      const { patients, identities, formSchemas } = parsedData.data || {};
      
      let restoreCount = 0;
      
      // Import patients
      if (patients && Array.isArray(patients)) {
        for (const p of patients) {
          const { id, ...data } = p;
          await setDoc(doc(db, 'patients', id), data);
          restoreCount++;
        }
      }
      
      // Import identities
      if (identities && Array.isArray(identities)) {
        for (const i of identities) {
          const { id, ...data } = i;
          await setDoc(doc(db, 'patient_identities', id), data);
          restoreCount++;
        }
      }

      // Import forms
      if (formSchemas && Array.isArray(formSchemas)) {
        for (const f of formSchemas) {
          const { id, ...data } = f;
          await setDoc(doc(db, 'form_schemas', id), data);
          restoreCount++;
        }
      }
      
      alert(`Geri yükleme başarılı! Toplam ${restoreCount} kayıt veritabanına eklendi/güncellendi.`);
      await logAudit('OLUŞTURMA', 'SİSTEM_YEDEĞİ', 'Geri Yükleme', `${restoreCount} kayıt geri yüklendi`);
    } catch (error) {
      console.error(error);
      alert('Geri yükleme sırasında bir hata oluştu. Veritabanı kurallarınızı ve JSON dosyanızı kontrol edin.');
    } finally {
      setIsRestoring(false);
      setIsRestoringFromDrive(false);
    }
  };

  const handleLocalRestore = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        if (!data.data) throw new Error("Geçersiz yedek dosyası formatı");
        
        if (confirm('Bu işlem mevcut veritabanı kayıtlarının üzerine yazabilir veya yeni kayıtlar ekleyebilir. Devam etmek istiyor musunuz?')) {
            await handleRestoreData(data);
        }
      } catch (err) {
        alert('Dosya okuma hatası. Geçerli bir JSON yedek dosyası seçtiğinizden emin olun.');
      }
      // Reset input
      const input = document.getElementById('local-restore-input') as HTMLInputElement;
      if (input) input.value = '';
    };
    reader.readAsText(file);
  };

  const handleDriveRestore = async () => {
    if (!accessToken) {
      alert('Lütfen önce Google ile giriş yapın.');
      return;
    }
    
    setIsRestoringFromDrive(true);
    try {
      const { fileName, data } = await fetchLatestDriveBackup(accessToken);
      
      if (!confirm(`Google Drive'da bulunan en son yedek: ${fileName}\n\nBu dosyadan geri yükleme yapmak, mevcut verilerin üzerine yazabilir. Devam etmek istiyor musunuz?`)) {
        setIsRestoringFromDrive(false);
        return;
      }
      
      await handleRestoreData(data);
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Google Drive\'dan geri yükleme yapılırken bir hata oluştu.');
      setIsRestoringFromDrive(false);
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const exportData = await getExportData();
      
      // Create blob and trigger download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gastrogen-yedek-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      await logAudit('DIŞA_AKTARMA', 'SİSTEM_YEDEĞİ', 'Lokal JSON', 'Tüm veritabanı yedeği indirildi');
    } catch (error) {
      console.error('Yedekleme sırasında hata oluştu:', error);
      alert('Yedekleme alınırken bir hata oluştu. Lütfen bağlantınızı kontrol edin.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDriveUpload = async () => {
    if (!accessToken) {
      alert('Lütfen önce Google ile giriş yapın.');
      return;
    }

    setIsUploading(true);
    try {
      await syncDataToGoogleDrive(accessToken);
      alert('Yedekleme başarıyla Google Drive hesabınıza yüklendi!');
    } catch (error: any) {
      console.error('Drive upload error:', error);
      alert(error.message || 'Google Drive\'a yüklenirken bir hata oluştu. Oturumunuz süresi dolmuş olabilir, lütfen tekrar giriş yapın.');
      setAccessToken(null); // Clear token on error
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Database className="w-6 h-6 text-indigo-600" />
          Veritabanı ve Yedekleme
        </h1>
        <p className="text-slate-600 mt-1 max-w-2xl">
          Araştırma verilerinizi güvende tutmak için bilgisayarınıza veya bulut sürücünüze yedekleyebilirsiniz.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local Export Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center mb-4">
            <HardDrive className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Lokal Yedekleme / Geri Yükleme</h2>
          <p className="text-sm text-slate-600 mt-2 mb-6 flex-1">
            Tüm araştırma formlarınızı ve kimlik eşleşmelerinizi bilgisayarınıza indirebilirsiniz. 
            Ayrıca önceden bilgisayarınıza indirdiğiniz JSON yedek dosyasını geri yükleyebilirsiniz.
          </p>
          
          <div className="flex gap-2">
            <button
              onClick={handleExportData}
              disabled={isExporting || isRestoring}
              className={`flex-1 flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                isExporting 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              }`}
            >
              {isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileJson className="w-5 h-5" />
              )}
              {isExporting ? 'İndiriliyor...' : 'Yedekle'}
            </button>
            
            <label className={`flex-1 flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors border border-blue-600 text-blue-600 hover:bg-blue-50 cursor-pointer ${isRestoring ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {isRestoring ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" />
              )}
              {isRestoring ? 'Yükleniyor...' : 'Geri Yükle'}
              <input 
                id="local-restore-input"
                type="file" 
                accept=".json" 
                className="hidden" 
                onChange={handleLocalRestore}
                disabled={isRestoring}
              />
            </label>
          </div>
        </div>

        {/* Google Drive Export Card */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center mb-4">
            <Cloud className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Google Drive Yedekleme / Geri Yükleme</h2>
          <p className="text-sm text-slate-600 mt-2 mb-6 flex-1">
            Verilerinizi doğrudan Google Drive hesabınıza güvenli bir şekilde yedekleyebilir, 
            ya da Drive'daki en son yedeğinizden sisteme geri yükleme yapabilirsiniz.
          </p>
          
          {!user || !accessToken ? (
            <button 
              onClick={handleSignIn}
              className="w-full flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                <path fill="none" d="M0 0h48v48H0z"></path>
              </svg>
              Google ile Giriş Yap
            </button>
          ) : (
            <div className="space-y-3 w-full mt-auto">
              <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded text-center truncate">
                Bağlı hesap: <span className="font-medium text-slate-900">{user.email}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDriveUpload}
                  disabled={isUploading || isRestoringFromDrive}
                  className={`flex-1 flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    isUploading 
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Cloud className="w-5 h-5" />
                  )}
                  {isUploading ? 'Yükleniyor...' : 'Drive\'a Gönder'}
                </button>

                <button
                  onClick={handleDriveRestore}
                  disabled={isUploading || isRestoringFromDrive}
                  className={`flex-1 flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors border border-indigo-600 text-indigo-600 hover:bg-indigo-50 ${
                    isRestoringFromDrive 
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  }`}
                >
                  {isRestoringFromDrive ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-5 h-5" />
                  )}
                  {isRestoringFromDrive ? 'İndiriliyor...' : 'Drive\'dan Çek'}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
