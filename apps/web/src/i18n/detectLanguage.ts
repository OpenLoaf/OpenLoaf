/**
 * System language detection
 * Automatically detects the user's system language and maps it to a supported language
 */

import type { LanguageId } from './types';
import { SUPPORTED_UI_LANGUAGES } from './types';

const SUPPORTED_LANGUAGES = SUPPORTED_UI_LANGUAGES.map(l => l.value);

/**
 * Detect the system language from browser/Electron
 * Priority:
 * 1. Electron system locale (if available via window.openloafElectron)
 * 2. Browser navigator.languages array
 * 3. Browser navigator.language fallback
 *
 * Returns a supported language ID, or 'en-US' as ultimate fallback
 */
export function detectSystemLanguage(): LanguageId {
  const candidates: string[] = [];

  // Try Electron first (more reliable than browser navigator)
  if (typeof window !== 'undefined' && window.openloafElectron?.getSystemLocale) {
    try {
      const electronLocale = window.openloafElectron.getSystemLocale();
      if (electronLocale) candidates.push(electronLocale);
    } catch {
      // Silently ignore if Electron method is not available
    }
  }

  // Add browser languages
  if (typeof navigator !== 'undefined') {
    if (navigator.languages && navigator.languages.length > 0) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
  }

  // Process candidates in order
  for (const raw of candidates) {
    if (!raw) continue;

    // Exact match (e.g., "en-US", "zh-CN")
    if (SUPPORTED_LANGUAGES.includes(raw as LanguageId)) {
      return raw as LanguageId;
    }

    // Traditional Chinese detection (zh-Hant, zh-TW, zh-HK)
    if (/^zh[-_](TW|HK|Hant)/i.test(raw)) {
      return 'zh-TW';
    }

    // Simplified Chinese detection (zh-Hans, zh-CN, zh)
    if (/^zh/i.test(raw)) {
      return 'zh-CN';
    }

    // Language prefix matching for other languages
    const parts = raw.toLowerCase().split(/[-_]/);
    if (parts.length > 0) {
      const prefix = parts[0];

      // Try to match by 2-letter language code
      const match = SUPPORTED_LANGUAGES.find(
        lang => lang.toLowerCase().split('-')[0] === prefix
      );
      if (match) {
        return match as LanguageId;
      }
    }
  }

  // Ultimate fallback
  return 'en-US';
}

/**
 * Format language code for dayjs and other libraries
 * Converts "en-US" → "en", "zh-CN" → "zh-cn", etc.
 */
export function getLocaleCode(languageId: LanguageId): string {
  const codeMap: Record<LanguageId, string> = {
    'zh-CN': 'zh-cn',
    'zh-TW': 'zh-tw',
    'en-US': 'en',
    'ja-JP': 'ja',
    'ko-KR': 'ko',
    'fr-FR': 'fr',
    'de-DE': 'de',
    'es-ES': 'es',
  };
  return codeMap[languageId] || 'en';
}
