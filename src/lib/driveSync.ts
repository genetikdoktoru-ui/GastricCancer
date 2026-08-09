import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import { getCurrentUserRole } from './auth-helpers';
import { logAudit } from './audit';

export interface SyncDataPayload {
  exportDate: string;
  version: string;
  data: {
    patients: any[];
    identities: any[];
    formSchemas: any[];
  };
}

/**
 * Gathers all relevant application data (patients, identities, form schemas) for export/sync.
 */
export async function gatherApplicationData(): Promise<SyncDataPayload> {
  const role = await getCurrentUserRole();

  let patientsQuery = collection(db, 'patients') as any;
  let identitiesQuery = collection(db, 'patient_identities') as any;
  const formsQuery = collection(db, 'form_schemas') as any;

  if (role !== 'admin' && auth.currentUser?.email) {
    patientsQuery = query(collection(db, 'patients'), where('createdBy', '==', auth.currentUser.email));
    identitiesQuery = query(collection(db, 'patient_identities'), where('createdBy', '==', auth.currentUser.email));
  }

  const patientsSnap = await getDocs(patientsQuery);
  const patients = patientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

  const identitiesSnap = await getDocs(identitiesQuery);
  const identities = identitiesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

  const formsSnap = await getDocs(formsQuery);
  const formSchemas = formsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

  return {
    exportDate: new Date().toISOString(),
    version: '1.0.0',
    data: {
      patients,
      identities,
      formSchemas,
    },
  };
}

/**
 * Syncs application data to Google Drive using the user's OAuth access token.
 */
export async function syncDataToGoogleDrive(accessToken: string, customFileName?: string) {
  if (!accessToken) {
    throw new Error('Google Drive erişim belirteci (accessToken) bulunamadı.');
  }

  const exportData = await gatherApplicationData();
  const fileContent = JSON.stringify(exportData, null, 2);
  const fileName = customFileName || `gastrogen-yedek-${new Date().toISOString().split('T')[0]}.json`;

  const metadata = {
    name: fileName,
    mimeType: 'application/json',
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', new Blob([fileContent], { type: 'application/json' }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Google Drive yükleme hatası');
  }

  const responseData = await response.json();
  await logAudit('DIŞA_AKTARMA', 'SİSTEM_YEDEĞİ', 'Google Drive', `Google Drive sync tamamlandı: ${fileName}`);
  return responseData;
}

/**
 * Fetches the latest backup file from Google Drive.
 */
export async function fetchLatestDriveBackup(accessToken: string): Promise<{ fileId: string; fileName: string; data: SyncDataPayload }> {
  if (!accessToken) {
    throw new Error('Google Drive erişim belirteci (accessToken) bulunamadı.');
  }

  const q = encodeURIComponent("name contains 'gastrogen-yedek-' and mimeType='application/json' and trashed=false");
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=createdTime desc&spaces=drive`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Drive dosya listesi alınamadı.');
  }

  const resData = await response.json();
  if (!resData.files || resData.files.length === 0) {
    throw new Error('Google Drive hesabınızda uygun yedek dosyası bulunamadı.');
  }

  const fileId = resData.files[0].id;
  const fileName = resData.files[0].name;

  const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!fileRes.ok) {
    throw new Error('Drive dosya içeriği okunamadı.');
  }

  const fileText = await fileRes.text();
  const data = JSON.parse(fileText);

  return { fileId, fileName, data };
}
