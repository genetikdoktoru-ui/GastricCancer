// gemini-config.ts — Stores the user's own Gemini API key and builds request headers.
//
// exports: getStoredGeminiApiKey() -> string | setStoredGeminiApiKey(key) | getGeminiHeaders() -> headers
// used_by: src/components/Layout.tsx | src/pages/PatientForm.tsx | src/pages/PatientAnalytics.tsx
// rules:   key lives only in browser localStorage and travels as the x-gemini-api-key header; the server falls back to GEMINI_API_KEY when absent
// agent:   claude-code | anthropic | 2026-10-15 | codedna-init | initial CodeDNA annotation

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
