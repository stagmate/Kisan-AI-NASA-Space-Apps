import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askAssistant, validateQuestion, formatContext } from '../src/assistant.js';

const fakeClient = (response, seen = {}) => ({
  beta: { messages: { create: async (req) => { seen.req = req; return response; } } },
});

test('validates questions and trims history to a user-first window', () => {
  assert.throws(() => validateQuestion({ question: '' }), RangeError);
  assert.throws(() => validateQuestion({ question: 'x'.repeat(2000) }), RangeError);
  assert.throws(() => validateQuestion({ question: 'hi', language: 'xx' }), RangeError);
  const v = validateQuestion({
    question: ' When to sow? ',
    history: [{ role: 'assistant', content: 'hello' }, { role: 'user', content: 'q' }, { role: 'system', content: 'x' }],
  });
  assert.equal(v.question, 'When to sow?');
  assert.deepEqual(v.history, [{ role: 'user', content: 'q' }]);
});

test('sends field context and answer language to Claude', async () => {
  const seen = {};
  const client = fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'नवंबर में बोएँ।' }] }, seen);
  const ctx = { lat: 28.6, lon: 77.2, annualRain: 751, seasons: [{ id: 'rabi', tempMean: 18, tempMax: 32, tempMin: 6, rainMm: 68 }] };
  const out = await askAssistant({ question: 'Wheat sowing time?', language: 'hi', context: ctx }, { anthropic: client });
  assert.equal(out.answer, 'नवंबर में बोएँ।');
  const last = seen.req.messages.at(-1).content;
  assert.match(last, /Answer in Hindi/);
  assert.match(last, /751 mm/);
  assert.equal(seen.req.model, 'claude-opus-5-5');
});

test('reports refusals instead of empty answers', async () => {
  const out = await askAssistant({ question: 'x' }, { anthropic: fakeClient({ stop_reason: 'refusal', content: [] }) });
  assert.deepEqual(out, { answer: null, refused: true });
});

test('formatContext handles missing data', () => {
  assert.equal(formatContext(null), 'No field data provided.');
});
