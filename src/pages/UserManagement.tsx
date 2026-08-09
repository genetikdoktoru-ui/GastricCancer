import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updatePassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, query, orderBy, deleteDoc } from 'firebase/firestore';
import { firebaseConfig, db, auth } from '../lib/firebase';
import { logAudit } from '../lib/audit';
import { UserPlus, User as UserIcon, ShieldAlert, Loader2, Key, Users, Copy, Check } from 'lucide-react';
import { getFirebasePassword } from '../lib/auth-helpers';

export function UserManagement() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  // For password change of existing user
  const [resetUsername, setResetUsername] = useState('');
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const q = query(collection(db, 'system_users'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
    } catch (err) {
      console.error('Kullanıcıları yükleme hatası:', err);
    }
  };

  const generatePassword = (setter: (val: string) => void) => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let newPassword = '';
    for (let i = 0; i < 8; i++) {
      newPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setter(newPassword);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateUser = async (e: any) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!username || !password) {
      setError('Lütfen kullanıcı adı ve şifre belirleyin.');
      return;
    }

    setLoading(true);
    try {
      const usernameLower = username.toLowerCase().trim();
      
      // Check if user already exists in firestore
      if (users.some(u => u.username === usernameLower)) {
        setError('Bu kullanıcı adı sistemde zaten kayıtlı.');
        setLoading(false);
        return;
      }

      // Generate a unique firebase email
      const uniqueSuffix = Date.now().toString(36);
      const firebaseEmail = `${usernameLower}-${uniqueSuffix}@gastrogen.local`;
      const firebasePassword = getFirebasePassword(password);

      // Create a secondary app to create user without signing out the current admin
      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);

      // Create the user in Firebase Auth
      await createUserWithEmailAndPassword(secondaryAuth, firebaseEmail, firebasePassword);
      
      // Sign out and clean up secondary app
      await signOut(secondaryAuth);
      
      // Save mapping in Firestore
      await setDoc(doc(db, 'system_users', usernameLower), {
        username: usernameLower,
        firebaseEmail: firebaseEmail,
        role: 'user',
        createdAt: new Date().toISOString()
      });

      setSuccess(`Kullanıcı başarıyla oluşturuldu (${usernameLower}). Aşağıdaki bilgileri kopyalayıp kullanıcıya iletebilirsiniz.`);
      
      // Log the audit
      await logAudit('OLUŞTURMA', 'KİMLİK_KAYDI', usernameLower, 'Yeni sistem kullanıcısı yetkilendirildi');
      
      await loadUsers();
    } catch (err: any) {
      console.error('Kullanıcı oluşturma hatası:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('Bu kullanıcı adı sistemde zaten kayıtlı.');
      } else {
        setError('Kullanıcı oluşturulurken bir hata oluştu: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: any) => {
    e.preventDefault();
    if (!resetUsername || !resetPassword) return;

    if (resetUsername === 'admin' && auth.currentUser?.email !== 'admin-system@gastrogen.local' && auth.currentUser?.email !== 'admin@admin.com') {
       alert("Yönetici şifresini sadece yönetici hesabı ile giriş yaptığınızda değiştirebilirsiniz.");
       return;
    }

    try {
      const usernameLower = resetUsername.toLowerCase().trim();
      const userDoc = users.find(u => u.username === usernameLower);
      
      if (!userDoc) {
        alert("Kullanıcı bulunamadı.");
        return;
      }

      // If they are changing their own password, use currentUser
      let currentAuthUser = auth.currentUser;
      
      // Wait, since we map to a fake email, we can't easily sign in as them without their OLD password.
      // So instead, we create a completely NEW Firebase Auth user and update the mapping!
      const uniqueSuffix = Date.now().toString(36);
      const newFirebaseEmail = `${usernameLower}-${uniqueSuffix}@gastrogen.local`;
      const newFirebasePassword = getFirebasePassword(resetPassword);

      const secondaryApp = initializeApp(firebaseConfig, 'SecondaryAppReset' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);

      await createUserWithEmailAndPassword(secondaryAuth, newFirebaseEmail, newFirebasePassword);
      await signOut(secondaryAuth);

      // Update mapping in Firestore
      await setDoc(doc(db, 'system_users', usernameLower), {
        ...userDoc,
        firebaseEmail: newFirebaseEmail,
        updatedAt: new Date().toISOString()
      });

      alert(`${usernameLower} için şifre başarıyla güncellendi. Yeni şifre: ${resetPassword}`);
      setResetUsername('');
      setResetPassword('');
      await loadUsers();
      await logAudit('GÜNCELLEME', 'KİMLİK_KAYDI', usernameLower, 'Kullanıcı şifresi sıfırlandı');

    } catch (err: any) {
       console.error(err);
       alert("Şifre sıfırlama başarısız: " + err.message);
    }
  };

  const handleDeleteUser = async (usernameToDelete: string) => {
    if(usernameToDelete === 'admin') {
      alert("Yönetici (admin) hesabı silinemez.");
      return;
    }
    if (confirm(`${usernameToDelete} kullanıcısını sistemden tamamen silmek istediğinize emin misiniz?`)) {
      try {
        await deleteDoc(doc(db, 'system_users', usernameToDelete));
        await logAudit('SİLME', 'KİMLİK_KAYDI', usernameToDelete, 'Kullanıcı hesabı silindi');
        await loadUsers();
      } catch (err) {
        console.error(err);
        alert("Silme işlemi başarısız.");
      }
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-indigo-600 shrink-0" />
            Kullanıcı Yönetimi
          </h1>
          <p className="text-slate-600 mt-1 max-w-2xl text-sm sm:text-base">
            Sisteme giriş yapabilecek kullanıcı adlarını ve şifrelerini belirleyin. Kullanıcıların e-posta adresine ihtiyacı yoktur.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* YENI KULLANICI FORMU */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-slate-500" />
            Yeni Kullanıcı Oluştur
          </h2>
          <div className="mb-6 bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3 text-blue-800">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Oluşturduğunuz kullanıcı, sadece sizin belirlediğiniz bu kullanıcı adı ve şifre ile sisteme giriş yapabilir.
            </p>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kullanıcı Adı
              </label>
              <div className="relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  required
                  className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none"
                  placeholder="isim veya rakam (örn: doktor1)"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Şifre
              </label>
              <div className="flex gap-2">
                <div className="relative rounded-md shadow-sm flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    required
                    className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-slate-300 rounded-lg py-2.5 border outline-none font-mono"
                    placeholder="Şifre belirleyin..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => generatePassword(setPassword)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-200 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  Rastgele Üret
                </button>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {success && (
              <div className="text-green-600 text-sm bg-green-50 p-4 rounded-lg border border-green-100 flex flex-col gap-3">
                <p>{success}</p>
                <div className="bg-white p-3 rounded border border-green-200">
                  <p><strong>Kullanıcı Adı:</strong> {username}</p>
                  <p><strong>Şifre:</strong> {password}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(`GastroGen Klinik Giriş Bilgileriniz:\n\nKullanıcı Adı: ${username}\nŞifre: ${password}`)}
                    className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Kopyalandı!' : 'Bilgileri Kopyala'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUsername('');
                      setPassword('');
                      setSuccess('');
                    }}
                    className="px-3 py-1.5 bg-white text-slate-700 border border-slate-300 rounded-md font-medium hover:bg-slate-50 transition-colors flex-1 text-center"
                  >
                    Yeni Kullanıcı Ekle
                  </button>
                </div>
              </div>
            )}

            {!success && (
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                  {loading ? 'Oluşturuluyor...' : 'Kullanıcı Oluştur'}
                </button>
              </div>
            )}
          </form>
        </div>

        {/* MEVCUT KULLANICILAR VE SIFRE SIFIRLAMA */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            Kayıtlı Kullanıcılar
          </h2>
          
          <div className="flex-1 overflow-auto max-h-60 mb-6 border border-slate-100 rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-medium border-b border-slate-200">Kullanıcı Adı</th>
                  <th className="px-4 py-2 font-medium border-b border-slate-200">Rol</th>
                  <th className="px-4 py-2 font-medium border-b border-slate-200 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-900">{u.username}</td>
                    <td className="px-4 py-2 text-slate-500 text-xs uppercase">{u.role}</td>
                    <td className="px-4 py-2 text-right">
                      {u.username !== 'admin' && (
                        <button 
                          onClick={() => handleDeleteUser(u.username)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium"
                        >
                          Sil
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-slate-500 text-xs">Yükleniyor veya kayıt yok...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-auto">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Şifre Değiştir / Sıfırla</h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                 <select 
                   className="flex-1 text-sm border-slate-300 rounded-md py-2 px-3 border outline-none focus:ring-blue-500 focus:border-blue-500"
                   value={resetUsername}
                   onChange={e => setResetUsername(e.target.value)}
                   required
                 >
                   <option value="">Kullanıcı Seç...</option>
                   {users.map(u => (
                     <option key={u.id} value={u.username}>{u.username}</option>
                   ))}
                 </select>
                 <input
                    type="text"
                    required
                    className="flex-1 text-sm border-slate-300 rounded-md py-2 px-3 border outline-none font-mono focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Yeni şifre..."
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => generatePassword(setResetPassword)}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-md border border-slate-200 hover:bg-slate-200 transition-colors text-xs font-medium"
                    title="Rastgele Üret"
                  >
                    Üret
                  </button>
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-slate-800 text-white rounded-md text-sm font-medium hover:bg-slate-900 transition-colors"
              >
                Şifreyi Güncelle
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}
