/**
 * i18next initialization
 * This module must be imported at the top of the application entry point
 * (in main.tsx or layout component)
 *
 * Usage:
 *   import '@/i18n/index';  // Import early, before any components
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { detectSystemLanguage } from './detectLanguage';
import { SUPPORTED_UI_LANGUAGES } from './types';

// Import all translation files (static import for static export + Electron compatibility)
// Simplified Chinese
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNNav from './locales/zh-CN/nav.json';
import zhCNAi from './locales/zh-CN/ai.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNProject from './locales/zh-CN/project.json';
import zhCNTasks from './locales/zh-CN/tasks.json';
import zhCNBoard from './locales/zh-CN/board.json';
import zhCNCalendar from './locales/zh-CN/calendar.json';
import zhCNDesktop from './locales/zh-CN/desktop.json';

// Traditional Chinese
import zhTWCommon from './locales/zh-TW/common.json';
import zhTWNav from './locales/zh-TW/nav.json';
import zhTWAi from './locales/zh-TW/ai.json';
import zhTWSettings from './locales/zh-TW/settings.json';
import zhTWProject from './locales/zh-TW/project.json';
import zhTWTasks from './locales/zh-TW/tasks.json';
import zhTWBoard from './locales/zh-TW/board.json';
import zhTWCalendar from './locales/zh-TW/calendar.json';
import zhTWDesktop from './locales/zh-TW/desktop.json';

// English
import enUSCommon from './locales/en-US/common.json';
import enUSNav from './locales/en-US/nav.json';
import enUSAi from './locales/en-US/ai.json';
import enUSSettings from './locales/en-US/settings.json';
import enUSProject from './locales/en-US/project.json';
import enUSTasks from './locales/en-US/tasks.json';
import enUSBoard from './locales/en-US/board.json';
import enUSCalendar from './locales/en-US/calendar.json';
import enUSDesktop from './locales/en-US/desktop.json';

// Japanese
import jaJPCommon from './locales/ja-JP/common.json';
import jaJPNav from './locales/ja-JP/nav.json';
import jaJPAi from './locales/ja-JP/ai.json';
import jaJPSettings from './locales/ja-JP/settings.json';
import jaJPProject from './locales/ja-JP/project.json';
import jaJPTasks from './locales/ja-JP/tasks.json';
import jaJPBoard from './locales/ja-JP/board.json';
import jaJPCalendar from './locales/ja-JP/calendar.json';
import jaJPDesktop from './locales/ja-JP/desktop.json';

/**
 * Resolve initial language:
 * 1. localStorage cache (written by useLanguageSync on every change)
 * 2. detectSystemLanguage() as fallback
 * This eliminates the "flash of wrong language" on page load.
 */
function getInitialLanguage(): string {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('openloaf-ui-language');
      if (cached && SUPPORTED_UI_LANGUAGES.some(l => l.value === cached)) {
        return cached;
      }
    } catch {
      // localStorage may be unavailable (SSR, privacy mode, etc.)
    }
  }
  return detectSystemLanguage();
}

// Initialize react-i18next
i18n.use(initReactI18next).init({
  lng: getInitialLanguage(),
  fallbackLng: 'zh-CN',
  debug: false,
  ns: ['common', 'nav', 'ai', 'settings', 'project', 'tasks', 'board', 'calendar', 'desktop'],
  defaultNS: 'common',
  resources: {
    'zh-CN': {
      common: zhCNCommon,
      nav: zhCNNav,
      ai: zhCNAi,
      settings: zhCNSettings,
      project: zhCNProject,
      tasks: zhCNTasks,
      board: zhCNBoard,
      calendar: zhCNCalendar,
      desktop: zhCNDesktop,
    },
    'zh-TW': {
      common: zhTWCommon,
      nav: zhTWNav,
      ai: zhTWAi,
      settings: zhTWSettings,
      project: zhTWProject,
      tasks: zhTWTasks,
      board: zhTWBoard,
      calendar: zhTWCalendar,
      desktop: zhTWDesktop,
    },
    'en-US': {
      common: enUSCommon,
      nav: enUSNav,
      ai: enUSAi,
      settings: enUSSettings,
      project: enUSProject,
      tasks: enUSTasks,
      board: enUSBoard,
      calendar: enUSCalendar,
      desktop: enUSDesktop,
    },
    'ja-JP': {
      common: jaJPCommon,
      nav: jaJPNav,
      ai: jaJPAi,
      settings: jaJPSettings,
      project: jaJPProject,
      tasks: jaJPTasks,
      board: jaJPBoard,
      calendar: jaJPCalendar,
      desktop: jaJPDesktop,
    },
  },
  interpolation: {
    escapeValue: false, // React already protects from XSS
  },
});

export default i18n;
