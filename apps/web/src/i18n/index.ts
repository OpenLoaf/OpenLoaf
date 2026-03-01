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

// Import all translation files (static import for static export + Electron compatibility)
// Simplified Chinese
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNNav from './locales/zh-CN/nav.json';
import zhCNAi from './locales/zh-CN/ai.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNWorkspace from './locales/zh-CN/workspace.json';
import zhCNTasks from './locales/zh-CN/tasks.json';
import zhCNBoard from './locales/zh-CN/board.json';

// Traditional Chinese
import zhTWCommon from './locales/zh-TW/common.json';
import zhTWNav from './locales/zh-TW/nav.json';
import zhTWAi from './locales/zh-TW/ai.json';
import zhTWSettings from './locales/zh-TW/settings.json';
import zhTWWorkspace from './locales/zh-TW/workspace.json';
import zhTWTasks from './locales/zh-TW/tasks.json';
import zhTWBoard from './locales/zh-TW/board.json';

// English
import enUSCommon from './locales/en-US/common.json';
import enUSNav from './locales/en-US/nav.json';
import enUSAi from './locales/en-US/ai.json';
import enUSSettings from './locales/en-US/settings.json';
import enUSWorkspace from './locales/en-US/workspace.json';
import enUSTasks from './locales/en-US/tasks.json';
import enUSBoard from './locales/en-US/board.json';

// Initialize react-i18next
i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  debug: false,
  ns: ['common', 'nav', 'ai', 'settings', 'workspace', 'tasks', 'board'],
  defaultNS: 'common',
  resources: {
    'zh-CN': {
      common: zhCNCommon,
      nav: zhCNNav,
      ai: zhCNAi,
      settings: zhCNSettings,
      workspace: zhCNWorkspace,
      tasks: zhCNTasks,
      board: zhCNBoard,
    },
    'zh-TW': {
      common: zhTWCommon,
      nav: zhTWNav,
      ai: zhTWAi,
      settings: zhTWSettings,
      workspace: zhTWWorkspace,
      tasks: zhTWTasks,
      board: zhTWBoard,
    },
    'en-US': {
      common: enUSCommon,
      nav: enUSNav,
      ai: enUSAi,
      settings: enUSSettings,
      workspace: enUSWorkspace,
      tasks: enUSTasks,
      board: enUSBoard,
    },
  },
  interpolation: {
    escapeValue: false, // React already protects from XSS
    defaultValue: '',
  },
});

export default i18n;
