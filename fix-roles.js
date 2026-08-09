import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function fix() {
  try {
    const snap = await getDocs(collection(db, 'system_users'));
    for (const d of snap.docs) {
      const data = d.data();
      if (data.firebaseEmail) {
        await setDoc(doc(db, 'user_roles', data.firebaseEmail), {
          role: data.role,
          username: data.username
        });
        console.log('Set role for', data.firebaseEmail, 'to', data.role);
      }
    }
  } catch(e) { console.error(e) }
  process.exit(0);
}
fix();
