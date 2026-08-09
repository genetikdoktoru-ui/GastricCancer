/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { PatientList } from './pages/PatientList';
import { PatientForm } from './pages/PatientForm';
import { FormBuilder } from './pages/FormBuilder';
import { IdentityRegistry } from './pages/IdentityRegistry';
import { Backup } from './pages/Backup';
import { Login } from './pages/Login';
import { AuditLogs } from './pages/AuditLogs';
import { UserManagement } from './pages/UserManagement';
import { ExcelImport } from './pages/ExcelImport';
import { PatientAnalytics } from './pages/PatientAnalytics';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="identities" element={<IdentityRegistry />} />
          <Route path="patients" element={<PatientList />} />
          <Route path="analytics" element={<PatientAnalytics />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientForm />} />
          <Route path="builder" element={<FormBuilder />} />
          <Route path="import-excel" element={<ExcelImport />} />
          <Route path="backup" element={<Backup />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="users" element={<UserManagement />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
