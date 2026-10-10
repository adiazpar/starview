import { describe, expect, it } from 'vitest';

// A key missing from a locale silently falls back to English, so parity has to be checked here.
const files = import.meta.glob('../../public/locales/*/common.json', { eager: true, import: 'default' });
const locales = Object.fromEntries(Object.entries(files).map(([path, json]) => [path.split('/').at(-2), json]));
const translated = Object.keys(locales).filter(code => code !== 'en');

describe('profile privacy strings', () => {
  it('are found for every supported language', () => {
    expect(Object.keys(locales)).toEqual(expect.arrayContaining(['en', 'es', 'fr', 'ja', 'de', 'pt-BR', 'zh-CN', 'ko', 'it']));
  });

  it.each(Object.keys(locales))('%s defines every key with text', code => {
    const strings = locales[code].profilePrivacy;
    expect(Object.keys(strings).sort()).toEqual(Object.keys(locales.en.profilePrivacy).sort());
    Object.values(strings).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    });
  });

  it.each(translated)('%s translates the sentences rather than repeating English', code => {
    // The title is left out: Italian uses the word "Privacy" itself.
    for (const key of ['private', 'description', 'saved', 'saveFailed']) {
      expect(locales[code].profilePrivacy[key], key).not.toBe(locales.en.profilePrivacy[key]);
    }
  });
});
