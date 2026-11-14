import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROP_IDS } from '../src/crops.js';

globalThis.document = { documentElement: {} };
const { _test } = await import('../public/i18n.js');
const { STRINGS, CROP_NAMES, MONTHS } = _test;
const { UI_LANGS } = await import('../public/i18n.js');
const { LANGUAGES: ASSISTANT_LANGS } = await import('../src/assistant.js');

const LANGS = ['hi', 'ta', 'kn', 'ml', 'te'];
const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();

for (const lang of LANGS) {
  test(`${lang}: every English key exists with the same placeholders`, () => {
    for (const [key, en] of Object.entries(STRINGS.en)) {
      const tr = STRINGS[lang][key];
      assert.ok(tr, `missing ${lang}.${key}`);
      assert.equal(ph(tr), ph(en), `placeholders differ in ${lang}.${key}`);
    }
    assert.deepEqual(Object.keys(STRINGS[lang]).filter((k) => !(k in STRINGS.en)), [], `extra keys in ${lang}`);
  });

  test(`${lang}: every crop has a name and there are 12 months`, () => {
    for (const id of [...CROP_IDS, 'fallow']) assert.ok(CROP_NAMES[lang][id], `${lang} ${id}`);
    assert.equal(MONTHS[lang].length, 12);
  });
}

test('every UI language can also be used by the assistant', () => {
  for (const code of Object.keys(UI_LANGS)) assert.ok(ASSISTANT_LANGS[code], code);
});
