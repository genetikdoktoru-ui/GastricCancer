/**
 * Helper to manage custom Gemini API Key in client storage and build API request headers
 */

const GEMINI_API_KEY_STORAGE_KEY = 'gastro_gen_gemini_api_key';

export function getStoredGeminiApiKey(): string {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY) || '';
}

export function setStoredGeminiApiKey(key: string): void {
  if (!key || !key.trim()) {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
  } else {
    localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key.trim());
  }
}

export function getGeminiHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  const key = getStoredGeminiApiKey();
  if (key) {
    headers['x-gemini-api-key'] = key;
  }
  return headers;
}
