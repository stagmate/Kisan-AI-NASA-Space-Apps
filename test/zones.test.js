import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyCells, slopes, pixelPolygon, fromSinusoidal } from '../src/zones.js';
import { toSinusoidal, tilePixel } from '../src/ndvi.js';

test('sinusoidal round trip and pixel polygons near the point', () => {
  const { x, y } = toSinusoidal(21.05, 79.2);
  const [lat, lon] = fromSinusoidal(x, y);
  assert.ok(Math.abs(lat - 21.05) < 1e-9 && Math.abs(lon - 79.2) < 1e-9);
  const px = tilePixel(21.05, 79.2);
  const poly = pixelPolygon(px.h, px.v, px.col, px.row);
  assert.equal(poly.length, 4);
  assert.ok(poly.every(([a, b]) => Math.abs(a - 21.05) < 0.005 && Math.abs(b - 79.2) < 0.005));
});

test('slope from a tilted plane: 10 m rise per cell ≈ 4.3%', () => {
  const n = 3;
  const elev = [0, 10, 20, 0, 10, 20, 0, 10, 20];
  const s = slopes(elev, n);
  assert.ok(Math.abs(s[4] - (10 / 231.66) * 100) < 0.2);
});

test('flags: steep bare cell erodes, sick cell is a stress hotspot, low cell is frost-prone', () => {
  const n = 3;
  const ndviNow = [0.6, 0.6, 0.6, 0.6, 0.35, 0.6, 0.6, 0.6, 0.1];
  const ndviLastYear = [0.6, 0.6, 0.6, 0.6, 0.62, 0.6, 0.6, 0.6, 0.1];
  const elev = [100, 100, 100, 100, 90, 100, 100, 130, 160];
  const cells = classifyCells({ ndviNow, ndviLastYear, elev, n, frostClimate: true });
  assert.equal(cells[4].stress, true);
  assert.equal(cells[0].stress, false);
  assert.equal(cells[8].stress, false); // bare both years: not stress
  assert.equal(cells[4].frost, true);
  assert.notEqual(cells[8].erosion, 'low');
  assert.equal(classifyCells({ ndviNow, ndviLastYear, elev, n, frostClimate: false })[4].frost, false);
});
