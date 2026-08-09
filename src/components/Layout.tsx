import { Outlet, Link, useLocation } from 'react-router-dom';
import { Activity, Users, FilePlus, Settings, Shield, Database, LogOut, ClipboardList, UserCog, Dna, User as UserIcon, Key, Sparkles, X, CheckCircle, FileSpreadsheet, Menu } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../lib/firebase';
import { useEffect, useState } from 'react';
import { getCurrentUserRole } from '../lib/auth-helpers';
import { getStoredGeminiApiKey, setStoredGeminiApiKey } from '../lib/gemini-config';

export function Layout() {
  const location = useLocation();
  const [userRole, setUserRole] = useState<string>('Araştırmacı');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = auth.currentUser;

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    getCurrentUserRole().then(role => {
      if (role === 'admin') setUserRole('Yönetici (Admin)');
      else if (role === 'doctor') setUserRole('Doktor');
      else setUserRole('Araştırmacı');
    });

    const existingKey = getStoredGeminiApiKey();
    setSavedKey(existingKey);
    setApiKeyInput(existingKey);
  }, []);

  const handleSaveApiKey = () => {
    setStoredGeminiApiKey(apiKeyInput);
    const updated = getStoredGeminiApiKey();
    setSavedKey(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleClearApiKey = () => {
    setStoredGeminiApiKey('');
    setSavedKey('');
    setApiKeyInput('');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: Activity },
    { name: 'Hasta Kodlama', path: '/identities', icon: Shield },
    { name: 'Araştırma Formları', path: '/patients', icon: Users },
    { name: 'AI Analiz & Sorgulama', path: '/analytics', icon: Sparkles },
    { name: 'Excel İçe Aktar (B-DZ)', path: '/import-excel', icon: FileSpreadsheet },
    { name: 'Yeni Kayıt', path: '/patients/new', icon: FilePlus },
    { name: 'Form Özelleştir', path: '/builder', icon: Settings },
    { name: 'Kullanıcı Yönetimi', path: '/users', icon: UserCog },
    { name: 'İşlem Kayıtları', path: '/audit-logs', icon: ClipboardList },
    { name: 'Yedekleme & Cloud', path: '/backup', icon: Database },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row w-full overflow-x-hidden">
      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "w-64 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 z-40 border-r border-slate-800 shadow-xl transition-transform duration-300 ease-in-out md:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-3 text-white font-bold text-lg tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Dna className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="block leading-none text-blue-400 text-xs font-semibold tracking-wider uppercase mb-1">GastroGen AI</span>
              <span className="block leading-none text-slate-100 font-semibold text-base">Tıbbi Portalı</span>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-1 text-slate-400 hover:text-white md:hidden"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Navigasyon Menüsü
          </div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
                             (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={twMerge(
                  clsx(
                    'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group',
                    isActive 
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20 font-semibold' 
                      : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100'
                  )
                )}
              >
                <item.icon className={clsx(
                  'w-5 h-5 transition-transform duration-200 group-hover:scale-110',
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                )} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-3">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-900/50 text-blue-300 flex items-center justify-center border border-blue-700/50 shrink-0">
              <UserIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user?.email}</p>
              <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded mt-0.5">
                {userRole}
              </span>
            </div>
          </div>

          <button
            onClick={() => auth.signOut()}
            className="flex items-center justify-center gap-2 text-slate-400 hover:text-red-400 transition-colors w-full py-2 px-3 rounded-xl hover:bg-red-500/10 border border-transparent hover:border-red-500/20 text-xs font-semibold"
          >
            <LogOut className="w-4 h-4" />
            <span>Güvenli Oturumu Kapat</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area with Top Navigation Header */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen min-w-0 w-full">
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 px-4 sm:px-6 md:px-8 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 text-slate-700 hover:text-slate-900 md:hidden rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Menüyü Aç"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-slate-500 truncate">
              <span className="text-slate-400 hidden sm:inline">GastroGen Portalı</span>
              <span className="hidden sm:inline">/</span>
              <span className="text-slate-800 font-bold truncate">
                {navItems.find(i => i.path === location.pathname || (i.path !== '/' && location.pathname.startsWith(i.path)))?.name || 'Sayfa'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setShowApiKeyModal(true)}
              className={clsx(
                "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shadow-xs",
                savedKey
                  ? "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
              )}
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{savedKey ? 'Gemini API Key (Tanımlı)' : 'Gemini API Key Gir'}</span>
              <span className="sm:hidden">{savedKey ? 'API Key' : 'Key Gir'}</span>
              {savedKey && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>}
            </button>

            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sistem Aktif & Güvenli
            </div>
          </div>
        </header>

        {/* Gemini API Key Modal */}
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Gemini API Anahtarı Ayarları</h3>
                    <p className="text-xs text-slate-500">AI destekli ses, OCR ve belge analizi için API key yönetimi</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="py-5 space-y-4">
                <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
                  <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    Bilgilendirme:
                  </p>
                  <p className="leading-relaxed">
                    Google AI Studio platformundaki ortam değişkeni (Environment Variable) yanıt vermediğinde veya geçersiz olduğunda, Google AI Studio hesabımdan aldığınız kişisel API anahtarınızı (<code className="bg-amber-100 px-1 py-0.5 rounded text-amber-950 font-mono">AIzaSy...</code>) buraya kaydedebilirsiniz.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono transition-all"
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    * API Anahtarınız yalnızca kullandığınız tarayıcıda (localStorage) güvenli bir şekilde saklanır ve sunucuya sadece AI analiz istekleri sırasında iletilir.
                  </p>
                </div>

                {saveSuccess && (
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    API Anahtarınız başarıyla kaydedildi!
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {savedKey ? (
                  <button
                    onClick={handleClearApiKey}
                    className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    Anahtarı Temizle
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowApiKeyModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Kapat
                  </button>
                  <button
                    onClick={handleSaveApiKey}
                    className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-500/20 transition-all"
                  >
                    Kaydet & Kullan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-3 sm:p-6 md:p-8 overflow-x-hidden min-w-0 w-full">
          <div className="max-w-7xl mx-auto w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

