// firebase.ts — Single Firebase app, named Firestore DB and Auth instances.
//
// exports: firebaseConfig | app | db | auth
// used_by: src/App.tsx | src/components/Layout.tsx | src/lib/{audit,auth-helpers,codebook,driveSync,google-drive,idGenerator}.ts | src/pages/*.tsx
// rules:   Firestore is the NAMED database firestoreDatabaseId (not '(default)'); always import db/auth from here — only UserManagement.tsx may create a secondary app (to add users without signing out the admin)
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const firebaseConfig = {
  projectId: "gen-lang-client-0381039620",
  appId: "1:762472864082:web:7694f7ca64709ce294028b",
  apiKey: "AIzaSyAkAufKxUlYkpoUezXAiWqkHuywGY6MVV8",
  authDomain: "gen-lang-client-0381039620.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-60a9e196-ec9c-4711-a16e-b60103911aeb",
  storageBucket: "gen-lang-client-0381039620.firebasestorage.app",
  messagingSenderId: "762472864082",
  measurementId: "",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
