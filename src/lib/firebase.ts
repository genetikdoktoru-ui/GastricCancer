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
