/**
 * Hook to synchronize i18n language with database user preference
 * Handles:
 * 1. Loading saved language preference from DB (useBasicConfig)
 * 2. Auto-detecting system language on first use
 * 3. Syncing i18n with user preference changes
 */

'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBasicConfig } from '@/hooks/useBasicConfig';
import { detectSystemLanguage } from './detectLanguage';
import type { LanguageId } from './types';

export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { basic, setBasic, isLoading } = useBasicConfig();

  useEffect(() => {
    if (isLoading) return;

    const savedLanguage = basic.uiLanguage;

    if (savedLanguage) {
      // User has a saved preference, use it
      if (i18n.language !== savedLanguage) {
        void i18n.changeLanguage(savedLanguage);
      }
    } else {
      // First use: auto-detect system language and save preference
      const detected = detectSystemLanguage();
      void setBasic({ uiLanguage: detected });
      if (i18n.language !== detected) {
        void i18n.changeLanguage(detected);
      }
    }
  }, [basic.uiLanguage, isLoading, i18n]);
}

/**
 * Change UI language and save preference to database
 * Call this when user explicitly selects a language from settings
 */
export async function changeUILanguage(lang: LanguageId) {
  const { i18n } = useTranslation();
  const { setBasic } = useBasicConfig();

  // Update i18n immediately for responsive UI
  await i18n.changeLanguage(lang);

  // Save preference to database
  await setBasic({ uiLanguage: lang });
}
