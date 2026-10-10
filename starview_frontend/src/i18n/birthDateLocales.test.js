import { describe, expect, it } from 'vitest';

// A key missing from a locale silently falls back to English, so parity has to be checked here.
const files = import.meta.glob('../../public/locales/*/common.json', { eager: true, import: 'default' });
const locales = Object.fromEntries(Object.entries(files).map(([path, json]) => [path.split('/').at(-2), json]));

describe('date of birth strings', () => {
  it('are found for every supported language', () => {
    expect(Object.keys(locales)).toEqual(expect.arrayContaining(['en', 'es', 'fr', 'ja', 'de', 'pt-BR', 'zh-CN', 'ko', 'it']));
  });

  it.each(Object.keys(locales))('%s defines every key with text', code => {
    const strings = locales[code].birthDate;
    expect(Object.keys(strings).sort()).toEqual(Object.keys(locales.en.birthDate).sort());
    Object.values(strings).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    });
  });
});
