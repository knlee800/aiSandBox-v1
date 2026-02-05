import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import { join } from 'path';

i18next.use(Backend).init({
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh-TW', 'zh-CN'],
  preload: ['en', 'zh-TW', 'zh-CN'],
  ns: ['auth'],
  defaultNS: 'auth',
  backend: {
    loadPath: join(__dirname, '../locales/{{lng}}.json'),
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18next;
