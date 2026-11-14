import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CROP_IDS } from '../src/crops.js';

globalThis.document = { documentElement: {} };
const { _test } = await import('../public/i18n.js');
const { STRINGS, CROP_NAMES } = _test;

test('Hindi has every English key with the same placeholders', () => {
  for (const [key, en] of Object.entries(STRINGS.en)) {
    const hi = STRINGS.hi[key];
    assert.ok(hi, `missing hi.${key}`);
    const ph = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    assert.equal(ph(hi), ph(en), `placeholders differ in ${key}`);
  }
});

test('every crop has an English and Hindi name', () => {
  for (const id of [...CROP_IDS, 'fallow']) {
    assert.ok(CROP_NAMES.en[id], `en ${id}`);
    assert.ok(CROP_NAMES.hi[id], `hi ${id}`);
  }
});
