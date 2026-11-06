/**
 * ChatComposerInput trigger menus (components/chat): static '@' source (server-rendered rows,
 * multi-word query), async '/' source through astryx-query (loading row + one announcement),
 * keyboard / pointer selection, token insertion + serialization + Backspace removal, Escape
 * dismissal that sticks while the query grows, combobox ARIA, paste-as-token and expand.
 */
import {setup, isOpen} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('chat');

const INPUT = '#chat-demo-input';
const EDITOR = `${INPUT} [data-ax-chat-editable]`;
const LAYER = `${INPUT} ax-combobox-layer`;
const menu = () => page.evaluate((sel) => {
  const input = document.querySelector(sel);
  const editor = input.querySelector('[data-ax-chat-editable]');
  const listbox = input.querySelector('[role="listbox"]');
  const layer = input.querySelector('ax-combobox-layer');
  let open = false;
  try { open = layer.matches(':popover-open'); } catch {}
  return {
    open,
    expanded: editor.getAttribute('aria-expanded'),
    controls: editor.getAttribute('aria-controls'),
    active: editor.getAttribute('aria-activedescendant'),
    label: listbox.getAttribute('aria-label'),
    options: [...listbox.querySelectorAll('[role="option"]')].map((o) => ({id: o.id, text: o.textContent.trim(), selected: o.getAttribute('aria-selected'), hi: o.hasAttribute('data-ax-highlighted')})),
    groups: [...listbox.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label')),
    rows: listbox.textContent.trim(),
    value: input.value,
    editorHtml: editor.innerHTML,
  };
}, INPUT);

await page.evaluate(() => {
  document.addEventListener('astryx-submit', (e) => e.stopPropagation(), true);
});

// ── Static '@' trigger ───────────────────────────────────────────────────────
await page.click(EDITOR);
await page.keyboard.type('Ask @');
let m = await menu();
check('typing @ opens the menu above the caret (popover)', m.open && m.expanded === 'true', JSON.stringify(m));
check('listbox named by the trigger (menuLabel "People")', m.label === 'People');
check('static rows are grouped (Team, Guests) in display order', m.groups.join() === 'Team,Guests' && m.options.length === 5, JSON.stringify(m.groups));
check('first row highlighted, aria-activedescendant + aria-controls on the editor', m.options[0].hi && m.options[0].selected === 'true' && m.active === m.options[0].id && m.controls != null, JSON.stringify(m));
check('server renderItem content in the rows (Avatar)', await page.$eval(`${INPUT} [role="option"]`, (o) => o.querySelector('.astryx-avatar') != null));
check('focus stays in the editor', await page.evaluate((sel) => document.activeElement === document.querySelector(sel), EDITOR));

await page.keyboard.type('gr');
m = await menu();
check('the query filters the rows ("gr" → Grace Hopper)', m.options.length === 1 && m.options[0].text.includes('Grace Hopper'), JSON.stringify(m.options));
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
m = await menu();
check('ArrowDown/ArrowUp move and wrap', m.options.length === 5);
await page.keyboard.press('ArrowUp');
m = await menu();
check('ArrowUp from the first row wraps to the last', m.options.at(-1).hi && m.active === m.options.at(-1).id, JSON.stringify(m.options.map((o) => o.hi)));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowDown');
m = await menu();
check('ArrowDown wraps to the first and moves on', m.options[1].hi, JSON.stringify(m.options.map((o) => o.hi)));
// Multi-word query (hasMultiWordQuery): spaces stay in the query.
await page.keyboard.type('margaret ham');
m = await menu();
check('multi-word query keeps matching across spaces', m.open && m.options.length === 1 && m.options[0].text.includes('Margaret Hamilton'), JSON.stringify(m.options));
await page.keyboard.press('Enter');
m = await menu();
check('Enter picks the row: menu closes, no submit', !m.open && m.expanded === 'false' && m.controls == null && m.active == null, JSON.stringify(m));
check('a token is inserted (Badge, contenteditable=false) and serializes to its value', m.value === 'Ask @margaret ' && /data-astryx-token-value="@margaret"/.test(m.editorHtml) && /contenteditable="false"/.test(m.editorHtml), JSON.stringify(m.value));
check('the token renders the server Badge (blue, "@Margaret Hamilton")', await page.$eval(`${EDITOR} [data-astryx-token] .astryx-badge`, (b) => b.getAttribute('data-variant') === 'blue' && b.textContent.includes('@Margaret Hamilton')));

// Backspace after the token's trailing NBSP removes both.
await page.keyboard.press('Backspace');
m = await menu();
check('Backspace after a token removes the token and its space', m.value === 'Ask ' && !/data-astryx-token/.test(m.editorHtml), JSON.stringify(m.value));

// Pointer selection.
await page.keyboard.type('@');
await page.waitForTimeout(30);
await page.click(`${INPUT} [role="group"] [role="option"] >> nth=1`);
m = await menu();
check('a click on a row inserts it and keeps focus in the editor', !m.open && m.value.includes('@grace') && await page.evaluate((sel) => document.activeElement === document.querySelector(sel), EDITOR), JSON.stringify(m.value));

// Escape dismisses and stays dismissed while the same query grows. (A trigger needs a space,
// tab or line break before it: the NBSP after a token is not one, as in Astryx.)
await page.keyboard.type(' @a');
m = await menu();
check('a new @ query reopens the menu', m.open);
await page.keyboard.press('Escape');
m = await menu();
check('Escape closes the menu (and does not reach outer layers)', !m.open && m.expanded === 'false');
await page.keyboard.type('d');
m = await menu();
check('the dismissed query stays closed while it grows', !m.open);
await page.keyboard.type(' ');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.press('Backspace');
await page.keyboard.type('@');
m = await menu();
check('a new trigger reopens after a dismissal', m.open, JSON.stringify(m));

// Outside press closes; a press in the editor does not.
const editorBox = await (await page.$(EDITOR)).boundingBox();
// Past the end of the line: the caret stays at the end of the query.
await page.mouse.click(editorBox.x + editorBox.width - 4, editorBox.y + 11);
await page.waitForTimeout(30);
m = await menu();
check('a press inside the editor keeps the menu open', m.open, JSON.stringify(m));
const heading = await (await page.$('main h1')).boundingBox();
await page.mouse.click(heading.x + heading.width + 40, heading.y + heading.height / 2);
check('a press outside closes it', !(await isOpen(page, LAYER)));

// Unmatched multi-word query hides the menu while the query stays active.
await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, INPUT);
await page.click(EDITOR);
await page.keyboard.type('@zzz');
m = await menu();
check('an unmatched multi-word query hides the menu', !m.open && m.expanded === 'false', JSON.stringify(m));
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');

// ── Async '/' trigger (astryx-query) ────────────────────────────────────────
await page.evaluate(() => {
  window.__queries = [];
  document.addEventListener('astryx-query', (e) => window.__queries.push({query: e.detail.query, trigger: e.detail.trigger, kind: e.detail.kind}), true);
});
await page.keyboard.type('/');
await page.waitForTimeout(40);
m = await menu();
check('async trigger: loading row while waiting (debounce + request)', m.open && m.options.length === 0 && m.rows === 'Searching…' && m.label === 'Commands', JSON.stringify(m));
await page.waitForTimeout(250);
const loadingAnnounced = await page.evaluate(() => document.querySelector('[data-astryx-live-region="polite"]')?.textContent ?? '');
check('the loading row is announced once ("Searching…")', loadingAnnounced.includes('Searching'), JSON.stringify(loadingAnnounced));
await page.waitForTimeout(400);
m = await menu();
const queries = await page.evaluate(() => window.__queries);
check('astryx-query carries {query, kind, trigger}', queries.length >= 1 && queries.at(-1).trigger === '/' && queries.at(-1).kind === 'search', JSON.stringify(queries));
check('async results replace the loading row (grouped Text/Code)', m.options.length === 4 && m.groups.join() === 'Text,Code', JSON.stringify(m));
await page.keyboard.type('xyz');
await page.waitForTimeout(600);
m = await menu();
check('no matches: the trigger\'s empty text', m.open && m.rows === 'No such command', JSON.stringify(m.rows));
for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('ex');
await page.waitForTimeout(600);
m = await menu();
check('async filtering ("ex" → explain)', m.options.length === 1 && m.options[0].text === 'explain', JSON.stringify(m.options));
await page.keyboard.press('Tab');
m = await menu();
check('Tab picks the row; the client onSelect token is inserted', !m.open && m.value === '/explain ' && await page.$eval(`${EDITOR} [data-astryx-token] .astryx-badge`, (b) => b.getAttribute('data-variant') === 'purple' && b.textContent === '/explain'), JSON.stringify(m.value));

// Submit payload carries the tokens.
await page.evaluate(() => {
  window.__payload = null;
  document.addEventListener('astryx-submit', (e) => { window.__payload = e.detail; }, {capture: true, once: true});
});
await page.keyboard.type('this');
await page.keyboard.press('Enter');
const payload = await page.evaluate(() => window.__payload);
check('astryx-submit {value, tokens} lists the inserted tokens', payload?.value === '/explain this' && payload.tokens.length === 1 && payload.tokens[0].value === '/explain' && payload.tokens[0].variant === 'purple', JSON.stringify(payload));

// ── Paste as token ──────────────────────────────────────────────────────────
await page.click(EDITOR);
const long = Array.from({length: 6}, (_, i) => `line ${i}: ${'lorem ipsum '.repeat(4)}`).join('\n');
await page.evaluate(([sel, text]) => {
  const editor = document.querySelector(sel);
  const data = new DataTransfer();
  data.setData('text/plain', text);
  editor.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
}, [EDITOR, long]);
const pasted = await page.evaluate(([sel, text]) => {
  const input = document.querySelector(sel);
  const token = input.querySelector('[data-astryx-token]');
  const badge = token?.querySelector('.astryx-badge');
  const card = token?.querySelector('ax-hover-card');
  return {
    value: input.value === text + ' ',
    label: badge?.textContent.trim(),
    describedBy: badge?.getAttribute('aria-describedby') === card?.id && badge?.getAttribute('data-ax-hover-card') === card?.id,
    preview: card?.querySelector('.ax-chat-pasted-text')?.textContent === text,
  };
}, [INPUT, long]);
check('a paste over 200 characters becomes a pasted-text token', pasted.value, JSON.stringify(pasted));
check('pasted token label "6 lines, N chars" (translated, grapheme count)', /^6 lines, \d+ chars$/.test(pasted.label ?? ''), pasted.label);
check('the hover card preview is wired to the badge (fresh ids)', pasted.describedBy && pasted.preview, JSON.stringify(pasted));
await page.evaluate((sel) => document.querySelector(sel).querySelector('[data-ax-chat-expand]').click(), INPUT);
const expanded = await page.evaluate((sel) => {
  const input = document.querySelector(sel);
  return {tokens: input.querySelectorAll('[data-astryx-token]').length, starts: input.value.startsWith('line 0:')};
}, INPUT);
check('Expand replaces the token with its text', expanded.tokens === 0 && expanded.starts, JSON.stringify(expanded));

// Short paste stays inline; astryx-paste can claim it.
await page.evaluate((sel) => { document.querySelector(sel).value = ''; }, INPUT);
await page.click(EDITOR);
await page.evaluate((sel) => {
  const editor = document.querySelector(sel);
  const data = new DataTransfer();
  data.setData('text/plain', 'short');
  editor.dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
}, EDITOR);
check('a short paste is inserted as text', await page.evaluate((sel) => document.querySelector(sel).value === 'short', INPUT));
const claimed = await page.evaluate((sel) => {
  const input = document.querySelector(sel);
  const once = (e) => { e.preventDefault(); input.insertText('[claimed]'); };
  input.addEventListener('astryx-paste', once, {once: true});
  const data = new DataTransfer();
  data.setData('text/plain', 'ignored');
  input.querySelector('[data-ax-chat-editable]').dispatchEvent(new ClipboardEvent('paste', {clipboardData: data, bubbles: true, cancelable: true}));
  return input.value;
}, INPUT);
check('astryx-paste preventDefault() handles the paste (Astryx onPaste)', claimed === 'short[claimed]', claimed);

await done();
