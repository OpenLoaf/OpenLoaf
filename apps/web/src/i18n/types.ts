/**
 * OpenLoaf UI Language Type Definitions
 * Centralized language definitions used throughout the application
 */

export type LanguageId =
  | 'zh-CN'
  | 'zh-TW'
  | 'en-US'
  | 'ja-JP'
  | 'ko-KR'
  | 'fr-FR'
  | 'de-DE'
  | 'es-ES';

/**
 * Supported UI languages with translations
 * Only these three languages have complete translations
 */
export const SUPPORTED_UI_LANGUAGES: Array<{ value: LanguageId; label: string }> = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'en-US', label: 'English' },
];

/**
 * All available languages (including partially supported)
 * Used internally for extending language support in the future
 */
export const ALL_UI_LANGUAGES: Array<{ value: LanguageId; label: string }> = [
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'zh-TW', label: '中文（繁體）' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
];

/**
 * Determine if a language ID is fully supported (has complete translations)
 */
export function isFullySupportedLanguage(lang: LanguageId | string): lang is LanguageId {
  return SUPPORTED_UI_LANGUAGES.some(l => l.value === lang);
}

/**
 * Get the fallback language code (2-letter ISO code) from full locale code
 */
export function getLanguageCode(locale: LanguageId): string {
  return locale.split('-')[0];
}
