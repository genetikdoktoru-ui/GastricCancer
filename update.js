import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDocs, collection, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  projectId: "gen-lang-client-0381039620",
  appId: "1:762472864082:web:7694f7ca64709ce294028b",
  apiKey: "AIzaSyAkAufKxUlYkpoUezXAiWqkHuywGY6MVV8",
  authDomain: "gen-lang-client-0381039620.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-60a9e196-ec9c-4711-a16e-b60103911aeb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

import { defaultFormFields } from "./dist/server.mjs" // not really possible as it's an express app. 
