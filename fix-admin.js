import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const auth = getAuth(app);

async function fixAdmin() {
  try {
    const firebaseEmail = 'admin@gastrogen.local';
    const pwd = 'admin_GSt0!';
    
    // Create auth user
    await createUserWithEmailAndPassword(auth, firebaseEmail, pwd).catch(async (e) => {
        if(e.code === 'auth/email-already-in-use') {
            console.log('Already in use, testing login...');
            await signInWithEmailAndPassword(auth, firebaseEmail, pwd);
            console.log('Login successful');
        } else {
            throw e;
        }
    });

    console.log('Successfully configured fallback admin user.');
  } catch (error) {
    console.error('Error:', error);
  }
  process.exit(0);
}
fixAdmin();
