import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function check() {
  try {
    const d = await getDoc(doc(db, 'system_users', 'admin'));
    console.log('Admin exists:', d.exists());
    if (d.exists()) console.log(d.data());
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
check();
