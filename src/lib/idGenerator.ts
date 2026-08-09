import { doc, runTransaction } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Generates the next unique patient research ID (e.g., GST-001, GST-002)
 * using an atomic Firestore transaction.
 */
export async function generateNextResearchId(): Promise<string> {
  const counterRef = doc(db, 'config', 'patient_counter');
  let generatedId = '';

  await runTransaction(db, async (transaction) => {
    const docSnap = await transaction.get(counterRef);
    let currentCount = 0;
    if (docSnap.exists()) {
      currentCount = docSnap.data().count || 0;
    }
    currentCount++;
    transaction.set(counterRef, { count: currentCount }, { merge: true });
    generatedId = `GST-${currentCount.toString().padStart(3, '0')}`;
  });

  return generatedId;
}
