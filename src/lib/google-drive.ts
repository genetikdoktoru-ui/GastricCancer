import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

let cachedAccessToken: string | null = null;
let isSigningIn = false;

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');
provider.addScope('https://www.googleapis.com/auth/spreadsheets.readonly');

/**
 * Initializes Google auth state listener and caches access token when available.
 */
export function initGoogleDriveAuth(
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (user && cachedAccessToken) {
      if (onSuccess) onSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      if (onFailure) onFailure();
    }
  });
}

/**
 * Triggers Google Sign-In popup with Drive & Sheets readonly scopes.
 */
export async function signInWithGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google erişim jetonu (access token) alınamadı.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign-in hatası:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
}

export function getCachedDriveAccessToken(): string | null {
  return cachedAccessToken;
}

export function setCachedDriveAccessToken(token: string | null) {
  cachedAccessToken = token;
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  iconLink?: string;
  webViewLink?: string;
}

/**
 * Extracts Google Drive File / Sheet ID from a URL or raw ID string.
 */
export function extractDriveFileId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  // Pattern for /d/FILE_ID/
  const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (dMatch && dMatch[1]) return dMatch[1];

  // Pattern for id=FILE_ID
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) return idMatch[1];

  // Otherwise assume it's already a raw fileId if alphanumeric with dashes
  if (/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Lists Excel and Spreadsheet files from user's Google Drive.
 */
export async function listGoogleDriveSpreadsheets(token: string, searchQuery: string = ''): Promise<DriveFileItem[]> {
  const mimeQuery = `(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType = 'application/vnd.ms-excel' or mimeType = 'text/csv') and trashed = false`;
  const nameQuery = searchQuery.trim() ? ` and name contains '${searchQuery.trim().replace(/'/g, "\\'")}'` : '';
  const q = encodeURIComponent(`${mimeQuery}${nameQuery}`);

  const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,iconLink,webViewLink)&pageSize=30&orderBy=modifiedTime%20desc`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive dosyaları listelenemedi (${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.files || [];
}

/**
 * Gets metadata for a specific Google Drive file by ID.
 */
export async function getDriveFileMetadata(fileId: string, token: string): Promise<DriveFileItem> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,modifiedTime,webViewLink`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive dosya bilgisi alınamadı (${response.status}): ${errText}`);
  }

  return await response.json();
}

/**
 * Downloads a Drive file or exports a Google Sheet as XLSX ArrayBuffer.
 */
export async function downloadDriveFileAsArrayBuffer(fileId: string, mimeType: string, token: string): Promise<{ arrayBuffer: ArrayBuffer; fileNameSuffix: string }> {
  let url = '';
  let fileNameSuffix = '';

  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Export native Google Sheet as XLSX
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    fileNameSuffix = '.xlsx';
  } else {
    // Binary download for uploaded .xlsx / .csv / .xls
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Drive dosyası indirilemedi (${response.status}): ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return { arrayBuffer, fileNameSuffix };
}
