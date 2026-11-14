// Formatting for assistant answers, kept separate so it can be tested without a browser.

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Minimal, safe Markdown for assistant answers: text is escaped first, then only
// **bold**, "- " / "* " / "1. " list items and "#" headings become markup.
export function renderAnswer(text) {
  const inline = (line) => esc(line).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const blocks = [];
  let list = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      (list ??= []).push(`<li>${inline(item[1])}</li>`);
      continue;
    }
    if (list) {
      blocks.push(`<ul>${list.join('')}</ul>`);
      list = null;
    }
    if (!line) continue;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    blocks.push(heading ? `<p><b>${inline(heading[1])}</b></p>` : `<p>${inline(line)}</p>`);
  }
  if (list) blocks.push(`<ul>${list.join('')}</ul>`);
  return blocks.join('');
}

export const plainAnswer = (text) => String(text).replace(/\*\*/g, '').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*•]\s+/gm, '');
