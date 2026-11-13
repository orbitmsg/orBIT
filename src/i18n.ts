import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import be from './locales/be.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import kk from './locales/kk.json';
import ko from './locales/ko.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import zh from './locales/zh.json';
import zhHant from './locales/zh-Hant.json';

const rawResources: Record<string, any> = {
  be,
  de,
  en,
  es,
  fr,
  hi,
  it,
  ja,
  kk,
  ko,
  nl,
  pl,
  pt,
  ru,
  tr,
  uk,
  zh,
  'zh-Hant': zhHant,
};

const resources: Record<string, any> = {};
for (const lang of Object.keys(rawResources)) {
  const item = { ...rawResources[lang] };
  if (item && item.translation) {
    const translationCopy = { ...item.translation };
    for (const key of Object.keys(item)) {
      if (key !== 'translation' && !(key in translationCopy)) {
        translationCopy[key] = item[key];
      }
    }
    item.translation = translationCopy;
  }
  resources[lang] = item;
}

let initialLang: string | undefined = undefined;
if (typeof window !== 'undefined') {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const urlLang = searchParams.get('lang');
    if (urlLang) {
      initialLang = urlLang;
    } else {
      const explicit = localStorage.getItem('orbita_app_language');
      if (explicit) {
        initialLang = explicit;
      } else {
        const raw = localStorage.getItem('orbita-chat-storage');
        if (raw) {
          const parsed = JSON.parse(raw);
          const l = parsed?.state?.language || parsed?.language;
          if (l) initialLang = l;
        }
      }
    }
  } catch {}
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLang,
    fallbackLng: 'en',
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: [],
    },
    interpolation: {
      escapeValue: false,
    },
  });

i18n.on('languageChanged', (lng) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('orbita_app_language', lng);
    } catch {}
  }
});

export default i18n;