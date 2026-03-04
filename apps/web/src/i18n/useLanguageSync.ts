/**
 * Hook to synchronize i18n language with database user preference
 * Handles:
 * 1. Loading saved language preference from DB (useBasicConfig)
 * 2. Auto-detecting system language when preference is empty ("follow system")
 * 3. Syncing i18n with user preference changes
 */

'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBasicConfig } from '@/hooks/use-basic-config';
import { detectSystemLanguage } from './detectLanguage';

export function useLanguageSync() {
  const { i18n } = useTranslation();
  const { basic, isLoading } = useBasicConfig();

  useEffect(() => {
    if (isLoading) return;

    const savedLanguage = basic.uiLanguage;

    // Empty = follow system; never write back to DB so the preference stays "follow system"
    const target = savedLanguage || detectSystemLanguage();
    if (i18n.language !== target) {
      void i18n.changeLanguage(target);
    }

    // Cache resolved language in localStorage so next page load starts with the right language
    // (eliminates flash of wrong language before tRPC responds)
    try {
      localStorage.setItem('openloaf-ui-language', target);
    } catch {
      // Silently ignore if localStorage is unavailable
    }

    // 同步语言到 Electron 主进程（托盘菜单、对话框等原生 UI 翻译）。
    window.openloafElectron?.setLanguage?.(target)?.catch?.(() => {});

  }, [basic.uiLanguage, isLoading, i18n]);
}

