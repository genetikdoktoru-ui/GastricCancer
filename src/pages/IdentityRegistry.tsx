import { useState, useEffect } from 'react';
import { collection, getDocs, doc, runTransaction, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Shield, Plus, Trash2, ArrowRight, UserPlus, FilePlus, X, FileSpreadsheet, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { logAudit } from '../lib/audit';
import { getCurrentUserRole } from '../lib/auth-helpers';
import { generateNextResearchId } from '../lib/idGenerator';
import * as XLSX from 'xlsx';

export function IdentityRegistry() {
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [newIdentity, setNewIdentity] = useState({
    fullName: '',
    nationalId: '',
    contact: ''
  });

  useEffect(() => {
    loadIdentities();
  }, []);

  const loadIdentities = async () => {
    try {
      const role = await getCurrentUserRole();
      setIsAdmin(role === 'admin');
      
      let q = collection(db, 'patient_identities') as any;
      if (role !== 'admin' && auth.currentUser?.email) {
         q = query(collection(db, 'patient_identities'), where('createdBy', '==', auth.currentUser.email));
      }
      
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setIdentities(data);
      logAudit('GÖRÜNTÜLEME', 'KİMLİK_LİSTESİ', 'Genel', 'Kimlik eşleşme listesi görüntülendi');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateId = async () => {
    return await generateNextResearchId();
  };

  const handleExportExcel = () => {
    if (!isAdmin) {
      alert('Hasta kimlik eşleşme listesini Excel olarak indirme yetkisi sadece yöneticilere (Admin) aittir.');
      return;
    }

    if (identities.length === 0) {
      alert('İndirilecek kimlik eşleşme kaydı bulunamadı.');
      return;
    }

    const exportRows = identities.map(item => ({
      'Araştırma Kodu (GST Kod)': item.researchId || '-',
      'Hasta Adı Soyadı': item.fullName || '-',
      'TC Kimlik / Protokol No': item.nationalId || '-',
      'İletişim / Not': item.contact || '-',
      'Kayıt Tarihi': item.createdAt ? format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm') : '-',
      'Kayıt Yapan Kullanıcı': item.createdBy || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    worksheet['!cols'] = [
      { wch: 24 }, // Research ID
      { wch: 28 }, // Full Name
      { wch: 25 }, // National ID
      { wch: 25 }, // Contact
      { wch: 20 }, // Date
      { wch: 28 }  // CreatedBy
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kimlik Eşleşmeleri');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `gastrogen-hasta-kimlik-kodlama-listesi-${dateStr}.xlsx`);

    logAudit('DIŞA_AKTARMA', 'KİMLİK_LİSTESİ', 'Excel', 'Admin hasta kimlik eşleşme Excel listesini indirdi');
  };

  const handleAdd = async (e: any) => {
    e.preventDefault();
    if (!newIdentity.fullName || !newIdentity.nationalId) {
      alert('Lütfen ad soyad ve kimlik no alanlarını doldurun.');
      return;
    }
    
    try {
      const researchId = await generateId();
      const payload = {
        researchId,
        fullName: newIdentity.fullName,
        nationalId: newIdentity.nationalId,
        contact: newIdentity.contact,
        createdBy: auth.currentUser?.email,
        createdAt: new Date().toISOString()
      };
      
      // Save identity mapping with researchId as document ID
      await setDoc(doc(db, 'patient_identities', researchId), payload);
      
      setIdentities([payload, ...identities]);
      setIsAdding(false);
      setNewIdentity({ fullName: '', nationalId: '', contact: '' });
      await logAudit('OLUŞTURMA', 'KİMLİK_KAYDI', researchId, 'Yeni kimlik eşleşmesi oluşturuldu');
    } catch (err) {
      console.error(err);
      alert('Kayıt başarısız oldu.');
    }
  };

  const handleDelete = async (researchId: string) => {
    if (confirm('Bu kimlik eşleşmesini silmek istediğinize emin misiniz? DİKKAT: Araştırma verisi silinmez, sadece kimlik bağı koparılır ve bu işlem geri alınamaz.')) {
      await deleteDoc(doc(db, 'patient_identities', researchId));
      setIdentities(identities.filter(i => i.researchId !== researchId));
      await logAudit('SİLME', 'KİMLİK_KAYDI', researchId, 'Kimlik eşleşmesi silindi');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600 shrink-0" />
            Hasta Kodlama ve Kimlik Yönetimi
          </h1>
          <p className="text-slate-600 mt-1 max-w-2xl text-sm sm:text-base">
            Araştırma verilerinin gizliliği için hastaların açık kimlikleri araştırma formuna kaydedilmez. 
            Burada her hasta için benzersiz bir araştırma kodu (Örn: GST-001) üretilir ve kimlik eşleşmesi gizli tutulur.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {isAdmin ? (
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2 text-xs sm:text-sm"
              title="Hasta kodu ve kimlik eşleşmelerini Excel (.xlsx) olarak indir"
            >
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
              Excel (Kimlik Listesi) İndir
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium border border-slate-200">
              <Lock className="w-4 h-4 text-slate-400" />
              <span>Excel İndirme Yetkisi: Yalnızca Admin</span>
            </div>
          )}

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2 text-xs sm:text-sm"
          >
            {isAdding ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />}
            {isAdding ? 'İptal' : 'Yeni Hasta Kodla'}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-indigo-900 mb-4">Yeni Kimlik Şifreleme</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-indigo-900 mb-1">Ad Soyad</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={newIdentity.fullName}
                onChange={e => setNewIdentity({ ...newIdentity, fullName: e.target.value })}
                placeholder="Örn: Ahmet Yılmaz"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-900 mb-1">TC Kimlik / Protokol No</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={newIdentity.nationalId}
                onChange={e => setNewIdentity({ ...newIdentity, nationalId: e.target.value })}
                placeholder="Örn: 12345678901"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-indigo-900 mb-1">İletişim / Ek Not (Opsiyonel)</label>
              <input
                type="text"
                className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                value={newIdentity.contact}
                onChange={e => setNewIdentity({ ...newIdentity, contact: e.target.value })}
                placeholder="Tel veya Açıklama"
              />
            </div>
            <div className="md:col-span-3 flex justify-end mt-2">
              <button
                type="submit"
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm"
              >
                Kod Oluştur ve Kaydet
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto w-full">
          <table className="w-full text-left text-sm min-w-[600px]">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Araştırma Kodu</th>
                <th className="px-6 py-4">Hasta Adı Soyadı</th>
                <th className="px-6 py-4">Kimlik / Protokol No</th>
                <th className="px-6 py-4">Oluşturulma Tarihi</th>
                <th className="px-6 py-4 text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {identities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Henüz kimlik eşleşmesi bulunmuyor.
                  </td>
                </tr>
              ) : (
                identities.map(identity => (
                  <tr key={identity.researchId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="inline-flex px-3 py-1 rounded-md text-sm font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {identity.researchId}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {identity.fullName}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {identity.nationalId}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {identity.createdAt ? format(new Date(identity.createdAt), 'dd.MM.yyyy HH:mm') : '-'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link
                        to={`/patients/new?researchId=${identity.researchId}`}
                        title="Bu hasta için araştırma formu doldur"
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <FilePlus className="w-4 h-4" />
                        Form Doldur
                      </Link>
                      <button
                        onClick={() => handleDelete(identity.researchId)}
                        title="Kimlik Eşleşmesini Sil"
                        className="inline-flex p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
