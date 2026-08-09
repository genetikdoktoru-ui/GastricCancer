import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { FileEdit, Trash2, Search, FileSpreadsheet, Sparkles, RefreshCw, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { logAudit } from '../lib/audit';
import { getCurrentUserRole } from '../lib/auth-helpers';
import { normalizePatientRecord, normalizeAllExistingRecordsInFirestore, normalizeFieldValue } from '../lib/codebook';

export function PatientList() {
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [normalizeProgress, setNormalizeProgress] = useState<{ current: number; total: number } | null>(null);

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const role = await getCurrentUserRole();
      setIsAdmin(role === 'admin');
      
      let q = collection(db, 'patients') as any;
      if (role !== 'admin' && auth.currentUser?.email) {
         q = query(collection(db, 'patients'), where('createdBy', '==', auth.currentUser.email));
      }
      
      const snap = await getDocs(q);
      const data = snap.docs.map(d => {
        const raw = { id: d.id, ...d.data() as any };
        return normalizePatientRecord(raw);
      });
      
      // Sort by creation date descending
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setPatients(data);
      logAudit('GÖRÜNTÜLEME', 'HASTA_LİSTESİ', 'Genel', 'Hasta listesi görüntülendi');
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchNormalize = async () => {
    if (!confirm(`Sistemde kayıtlı tüm (${patients.length}) hasta verisindeki sayısal kodları (ör. 1 ➔ 1 - Polipoid (Fungat), 2 ➔ 2 - Ülserofungat) veritabanında kalıcı olarak metin etiketlerine dönüştürmek istiyor musunuz?`)) {
      return;
    }

    setIsNormalizing(true);
    setNormalizeProgress({ current: 0, total: patients.length });

    try {
      const updatedCount = await normalizeAllExistingRecordsInFirestore((current, total) => {
        setNormalizeProgress({ current, total });
      });

      await logAudit('GÜNCELLEME', 'HASTA_VERİTABANI', 'Tüm_Kayıtlar', `${updatedCount} hasta kaydı etiket formatına dönüştürüldü`);
      alert(`BAŞARILI! Veritabanındaki ${updatedCount} kayıt içinde yer alan tüm sayısal kodlar (1 ➔ 1 - Polipoid (Fungat) vb.) metin etiketlerine dönüştürüldü.`);
      await loadPatients();
    } catch (err: any) {
      console.error('Normalizasyon hatası:', err);
      alert('Dönüştürme sırasında bir hata oluştu: ' + err.message);
    } finally {
      setIsNormalizing(false);
      setNormalizeProgress(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Bu kaydı silmek istediğinize emin misiniz?')) {
      await deleteDoc(doc(db, 'patients', id));
      setPatients(patients.filter((p: any) => p.id !== id));
      await logAudit('SİLME', 'HASTA_FORMU', id, 'Hasta kaydı silindi');
    }
  };

  const filteredPatients = patients.filter((p: any) => {
    const search = searchTerm.toLowerCase();
    return (
      (p.research_id?.toLowerCase().includes(search)) ||
      ((p as any).patient_age?.toString().includes(search)) ||
      (p.tnm_stage?.toLowerCase().includes(search)) ||
      (p.t_stage?.toLowerCase().includes(search)) ||
      (p.family_history?.toLowerCase().includes(search)) ||
      (p.family_gc?.toLowerCase().includes(search)) ||
      (p.source?.toLowerCase().includes(search)) ||
      (p.excelRowNumber?.toString().includes(search))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Araştırma Formları</h1>
          <p className="text-slate-600 mt-1">Gastrik kanser araştırma kohortu ({patients.length} hasta)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1 sm:flex-initial min-w-[200px]">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Yaş veya Evre ara..."
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-56 text-sm outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleBatchNormalize}
            disabled={isNormalizing}
            className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-lg font-medium transition-colors shadow-sm flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50"
            title="Sistemde daha önce yüklü 386 kayıttaki tüm 1, 2, 3 gibi kodları '1 - Polipoid (Fungat)' gibi metin etiketlerine dönüştürür"
          >
            <RefreshCw className={`w-4 h-4 ${isNormalizing ? 'animate-spin' : ''}`} />
            <span>{isNormalizing ? 'Dönüştürülüyor...' : '386 Kaydı Etiketle (1 ➔ 1-Polipoid)'}</span>
          </button>
          <Link
            to="/analytics"
            className="bg-indigo-600 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          >
            <Sparkles className="w-4 h-4" />
            AI Analiz & Sorgula
          </Link>
          <Link
            to="/import-excel"
            className="bg-emerald-600 text-white px-3.5 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel İçe Aktar
          </Link>
          <Link
            to="/patients/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm text-xs font-semibold"
          >
            Serbest Form Ekle
          </Link>
        </div>
      </div>

      {normalizeProgress && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <RefreshCw className="w-5 h-5 text-amber-600 animate-spin" />
          <div className="flex-1">
            <div className="flex justify-between text-xs font-semibold text-amber-900 mb-1">
              <span>Sistemdeki Kayıtlar Kod Değerlerine Dönüştürülüyor (1 ➔ 1-Polipoid (Fungat))...</span>
              <span>{normalizeProgress.current} / {normalizeProgress.total} (%{Math.round((normalizeProgress.current / normalizeProgress.total) * 100)})</span>
            </div>
            <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-amber-600 h-full transition-all duration-300" 
                style={{ width: `${(normalizeProgress.current / normalizeProgress.total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto w-full">
          <table className="w-full text-left text-sm min-w-[650px]">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Araştırma Kodu</th>
                <th className="px-6 py-4">Veri Kaynağı</th>
                <th className="px-6 py-4">Kayıt Tarihi</th>
                <th className="px-6 py-4">Yaş / Cinsiyet</th>
                <th className="px-6 py-4">Evre</th>
                <th className="px-6 py-4">Genetik Marker</th>
                <th className="px-6 py-4 text-right">Form İşlemleri</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredPatients.map(patient => (
                  <tr key={patient.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <td className="px-6 py-4 font-bold text-indigo-700">
                      <Link 
                        to={`/patients/${patient.id}`}
                        className="inline-flex items-center gap-1.5 hover:underline text-indigo-700 font-extrabold text-sm"
                      >
                        {patient.research_id || '-'}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      {patient.source === 'Excel_B_DZ_Aktarimi' || patient.excelRowNumber ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                          Excel Satır {patient.excelRowNumber || '-'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          Serbest Form
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {patient.createdAt ? format(new Date(patient.createdAt), 'dd.MM.yyyy') : '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {patient.patient_age || '-'} / {patient.patient_gender || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                        {patient.tnm_stage || (patient.t_stage ? `${patient.t_stage} ${patient.n_stage || ''} ${patient.m_stage || ''}`.trim() : 'Bilinmiyor')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-xs">
                      {patient.cdh1_germline || patient.cdh1_mutation || '-'}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <Link
                        to={`/patients/${patient.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors border border-blue-200"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Formu Aç</span>
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(patient.id);
                        }}
                        className="inline-flex p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Kaydı Sil"
                      >
                        <Trash2 className="w-4 h-4" />
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
