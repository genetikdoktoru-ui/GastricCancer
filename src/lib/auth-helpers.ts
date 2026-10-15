// auth-helpers.ts — Username→Firebase email mapping, password suffix, role lookup.
//
// exports: getFirebaseEmail(username) -> Promise<string> | getFirebasePassword(pw) -> string | getCurrentUserRole() -> Promise<string>
// used_by: src/pages/Login.tsx | src/pages/UserManagement.tsx | src/components/Layout.tsx | src/lib/driveSync.ts | src/pages/{Dashboard,PatientList,PatientAnalytics,IdentityRegistry,Backup}.tsx
// rules:   getFirebasePassword's fixed suffix must stay identical in Login and UserManagement or every existing login breaks; usernames without '@' become <username>@gastrogen.local; role comes from user_roles/{email}, default 'user'
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';

export const getFirebaseEmail = async (username: string) => {
  const usernameLower = username.toLowerCase().trim();
  
  try {
    // Try to find the user in system_users
    const q = query(collection(db, 'system_users'), where('username', '==', usernameLower));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      return snap.docs[0].data().firebaseEmail;
    }
  } catch (error) {
    console.warn("Firestore query failed, falling back to generic email mapping.", error);
  }
  
  // Fallback for initial admin or existing users
  return username.includes('@') ? username : `${usernameLower}@gastrogen.local`;
};

export const getFirebasePassword = (password: string) => {
  return password + "_GSt0!";
};

export const getCurrentUserRole = async (): Promise<string> => {
  if (!auth.currentUser) return 'user';
  try {
    const email = auth.currentUser.email;
    if (!email) return 'user';
    const docRef = doc(db, 'user_roles', email);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data().role || 'user';
    }
  } catch (e) {
    console.error(e);
  }
  return 'user';
};
