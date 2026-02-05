'use client';

import { useTranslationContext } from '../components/TranslationProvider';

export function useTranslations(namespace?: string) {
  const { messages } = useTranslationContext();

  return function t(key: string): string {
    // If a namespace is provided, prefix the key with it
    const fullKey = namespace ? `${namespace}.${key}` : key;

    // Split the key by dots to traverse the nested object
    const keys = fullKey.split('.');
    let value: any = messages;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Return the key itself if translation not found
        return fullKey;
      }
    }

    return typeof value === 'string' ? value : fullKey;
  };
}

export function useLocale() {
  const { locale } = useTranslationContext();
  return locale;
}
