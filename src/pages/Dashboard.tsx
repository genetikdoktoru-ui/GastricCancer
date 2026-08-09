import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Users, AlertTriangle, Dna, Activity } from 'lucide-react';
import { getCurrentUserRole } from '../lib/auth-helpers';

export function Dashboard() {
  const [stats, setStats] = useState({
    total: 0,
    cdh1Positive: 0,
    familyHistory: 0,
    earlyOnset: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const role = await getCurrentUserRole();
        
        let q = collection(db, 'patients') as any;
        if (role !== 'admin' && auth.currentUser?.email) {
           q = query(collection(db, 'patients'), where('createdBy', '==', auth.currentUser.email));
        }

        const snap = await getDocs(q);
        const patients = snap.docs.map(d => d.data() as any);
        
        setStats({
          total: patients.length,
          cdh1Positive: patients.filter((p: any) => p.cdh1_mutation === 'Pozitif' || p.cdh1_germline?.includes('Pozitif')).length,
          familyHistory: patients.filter((p: any) => (p.family_history && p.family_history !== 'Yok') || (p.family_gc && p.family_gc !== 'Yok')).length,
          earlyOnset: patients.filter((p: any) => Number(p.patient_age) < 50).length
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) return <div>Yükleniyor...</div>;

  const statCards = [
    { title: 'Toplam Hasta', value: stats.total, icon: Users, color: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
    { title: 'Aile Öyküsü (+)', value: stats.familyHistory, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
    { title: 'Erken Yaş (<50)', value: stats.earlyOnset, icon: Activity, color: 'bg-rose-50 text-rose-600', border: 'border-rose-100' },
    { title: 'CDH1 Mutasyonu (+)', value: stats.cdh1Positive, icon: Dna, color: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Araştırma Özeti</h1>
        <p className="text-slate-600 mt-1">Gastrik Kanser Genetik & Cerrahi Ortak Çalışma İstatistikleri</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map(stat => (
          <div key={stat.title} className={`bg-white rounded-xl p-6 border ${stat.border} shadow-sm flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">{stat.title}</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>
      
      {/* AI Analysis Suggestion box */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-5 sm:p-8 text-white shadow-lg">
        <h2 className="text-xl font-semibold mb-2">Yapay Zeka ile Veri Analizi</h2>
        <p className="text-blue-100 max-w-2xl text-sm sm:text-base leading-relaxed">
          Veritabanınız büyüdükçe Gemini AI, hastalarınız arasındaki gizli korelasyonları (ör: diffüz tip ile erken başlangıç arasındaki ilişki) otomatik olarak tespit edip size raporlayacaktır. Hasta sayınız istatistiksel anlamlılığa ulaştığında gelişmiş analizler burada aktifleşecektir.
        </p>
        <button className="mt-5 sm:mt-6 bg-white text-blue-600 px-5 sm:px-6 py-2.5 rounded-lg font-medium text-sm shadow-sm hover:bg-blue-50 transition-colors">
          Analiz Raporu Oluştur (Yakında)
        </button>
      </div>
    </div>
  );
}
