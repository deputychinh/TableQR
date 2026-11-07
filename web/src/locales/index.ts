import { createI18n } from 'vue-i18n';
import { vi, type Messages } from './vi';

export const i18n = createI18n<[Messages], 'vi'>({
  legacy: false,
  locale: 'vi',
  fallbackLocale: 'vi',
  messages: { vi },
});
