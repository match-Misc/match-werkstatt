import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import translationDE from './locales/de.json';
import translationEN from './locales/en.json';

const resources = {
  de: translationDE,
  en: translationEN
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'de',
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
