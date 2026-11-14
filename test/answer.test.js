import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderAnswer, plainAnswer } from '../public/format.js';

test('assistant answers: bold and lists rendered, everything else escaped', () => {
  const html = renderAnswer('**Water?**\nYes, about **30 mm**.\n- No rain\n- Clay soil <script>x</script>\n\n## Price\n1. ₹9,650');
  assert.match(html, /<p><b>Water\?<\/b><\/p>/);
  assert.match(html, /<b>30 mm<\/b>/);
  assert.match(html, /<ul><li>No rain<\/li><li>Clay soil &lt;script&gt;x&lt;\/script&gt;<\/li><\/ul>/);
  assert.match(html, /<p><b>Price<\/b><\/p><ul><li>₹9,650<\/li><\/ul>/);
  assert.ok(!html.includes('<script>'));
});

test('read-aloud text has no Markdown marks', () => {
  assert.equal(plainAnswer('**Hi**\n- one\n## Two'), 'Hi\none\nTwo');
});
