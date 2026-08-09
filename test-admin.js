import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
const app = initializeApp();
const auth = getAuth(app);
auth.listUsers(1).then(res => {
  console.log("Success! Users found: ", res.users.length);
  process.exit(0);
}).catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
