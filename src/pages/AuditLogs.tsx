import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Activity, Search } from 'lucide-react';
import { format } from 'date-fns';

export function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(log => 
    log.userEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resourceType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.resourceId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionColor = (action: string) => {
    switch (action) {
      case 'OLUŞTURMA': return 'bg-green-100 text-green-800 border-green-200';
      case 'GÜNCELLEME': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SİLME': return 'bg-red-100 text-red-800 border-red-200';
      case 'GÖRÜNTÜLEME': return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'DIŞA_AKTARMA': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-indigo-600" />
            Sistem İşlem Kayıtları (Log)
          </h1>
          <p className="text-slate-600 mt-1 max-w-2xl">
            Sistemdeki tüm erişim, değişiklik ve veri aktarım işlemleri güvenlik amacıyla kayıt altına alınmaktadır.
          </p>
        </div>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Kullanıcı, işlem veya dosya ara..."
            className="pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-72 outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Yükleniyor...</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Tarih / Saat</th>
                <th className="px-6 py-4">Kullanıcı (E-posta)</th>
                <th className="px-6 py-4">İşlem Tipi</th>
                <th className="px-6 py-4">Kaynak / Dosya</th>
                <th className="px-6 py-4">Detay / Kayıt ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {log.timestamp ? format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm:ss') : '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      {log.userEmail}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-bold border ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {log.resourceType}
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="text-xs font-mono text-slate-400 mb-0.5">ID: {log.resourceId}</div>
                      <div>{log.details}</div>
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
