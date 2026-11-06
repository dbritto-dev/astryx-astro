/**
 * ChatLayout / ChatMessageList / ChatLayoutScrollButton (components/chat): stick-to-bottom,
 * the reader scrolling up unlocks, the scroll button and its "New messages" label, the button
 * click, streaming growth followed while locked, role=log live-region semantics (aria-busy
 * while streaming), message labels, the scroll-to-top loading state and its announcement.
 */
import {setup, sleep} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('chat');
await sleep(200);

const LAYOUT = '#chat-demo-layout';
const geom = () => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  const pill = el.querySelector('.astryx-chat-layout-scroll-button');
  const button = pill.querySelector('.astryx-button');
  return {
    dist: el.scrollHeight - el.scrollTop - el.clientHeight,
    scrollable: el.scrollHeight > el.clientHeight,
    following: el.hasAttribute('data-astryx-chat-following'),
    locked: el.isLocked,
    visible: pill.hasAttribute('data-ax-visible'),
    inert: pill.inert,
    expanded: pill.hasAttribute('data-ax-expanded'),
    label: button.getAttribute('aria-label'),
    iconOnly: button.hasAttribute('data-ax-icon-only'),
    text: button.querySelector('.ax-button-label')?.textContent ?? null,
  };
}, LAYOUT);

let g = await geom();
check('the layout is the scroll container and starts at the bottom', g.scrollable && g.dist < 2, JSON.stringify(g));
check('following: scroll anchoring off (data-astryx-chat-following), locked', g.following && g.locked);
check('scroll button hidden and inert at the bottom', !g.visible && g.inert && g.iconOnly && g.label === 'Scroll to bottom', JSON.stringify(g));

// Semantics of the log.
const log = await page.$eval('#chat-demo-list', (el) => ({
  role: el.getAttribute('role'), live: el.getAttribute('aria-live'), tab: el.tabIndex, busy: el.getAttribute('aria-busy'),
  density: el.getAttribute('data-density'),
  messages: [...el.querySelectorAll('.astryx-chat-message')].map((m) => ({label: m.getAttribute('aria-label'), labelledby: m.getAttribute('aria-labelledby'), name: m.getAttribute('aria-labelledby') ? document.getElementById(m.getAttribute('aria-labelledby'))?.textContent : null, sender: m.getAttribute('data-sender'), density: m.getAttribute('data-density')})),
  bubbles: [...el.querySelectorAll('.astryx-chat-message-bubble')].map((b) => `${b.getAttribute('data-sender')}/${b.getAttribute('data-density')}`),
}));
check('ChatMessageList is role="log" aria-live="polite", a tab stop, not busy', log.role === 'log' && log.live === 'polite' && log.tab === 0 && log.busy == null, JSON.stringify(log));
check('messages are articles labelled by their name, else "Message from {sender}"', log.messages[0].label === 'Message from user' && log.messages[1].name === 'Navi', JSON.stringify(log.messages));
check('density and sender reach messages and bubbles (cascade)', log.messages.every((m) => m.density === 'balanced') && log.bubbles.includes('user/balanced') && log.bubbles.includes('assistant/balanced'), JSON.stringify(log.bubbles));
const compact = await page.$$eval('.astryx-chat-message-list[data-density="compact"] .astryx-chat-message-bubble', (els) => els.map((b) => b.getAttribute('data-density')));
check('a compact list makes its bubbles compact', compact.length > 0 && compact.every((d) => d === 'compact'), JSON.stringify(compact));
const explicit = await page.$$eval('.astryx-chat-message[data-density="spacious"] .astryx-chat-message-bubble', (els) => els.map((b) => b.getAttribute('data-density')));
check('a message density overrides the list for its bubbles', explicit.length > 0 && explicit.every((d) => d === 'spacious'));
check('--_chat-avatar-offset follows a bubble name row', await page.evaluate(() => {
  const withName = [...document.querySelectorAll('.astryx-chat-message')].find((m) => m.querySelector('[data-chat-name]'));
  const without = [...document.querySelectorAll('.astryx-chat-message')].find((m) => !m.querySelector('[data-chat-name]'));
  return getComputedStyle(withName).getPropertyValue('--_chat-avatar-offset').trim() !== '0px' && getComputedStyle(without).getPropertyValue('--_chat-avatar-offset').trim() === '0px';
}));

// The reader scrolls up: unlock, the button shows (collapsed).
await page.evaluate((sel) => { const el = document.querySelector(sel); el.scrollTop = el.scrollTop - 220; }, LAYOUT);
await sleep(150);
g = await geom();
check('scrolling up unlocks following', !g.locked && !g.following, JSON.stringify(g));
check('scrolled > 100px up: the button shows, collapsed (icon only)', g.visible && !g.inert && !g.expanded && g.iconOnly, JSON.stringify(g));

// A new message while scrolled up: "New messages" and no auto-scroll.
const before = g.dist;
await page.evaluate(() => {
  const content = document.getElementById('chat-demo-list').contentElement;
  const t = document.getElementById('chat-demo-assistant-template').content.firstElementChild.cloneNode(true);
  t.querySelector('[data-demo-text]').textContent = 'A message that arrived while you were reading.';
  content.append(t);
});
await sleep(150);
g = await geom();
check('a new message while scrolled up does not move the reader', g.dist > before, JSON.stringify({before, after: g.dist}));
check('…and expands the button with "New messages"', g.visible && g.expanded && !g.iconOnly && g.text === 'New messages' && g.label === 'New messages', JSON.stringify(g));
check('the new message lands inside the live log', await page.evaluate(() => {
  const list = document.getElementById('chat-demo-list');
  return list.contentElement.lastElementChild.matches('.astryx-chat-message') && list.closest('[role="log"]') === list;
}));

// Clicking the button scrolls to the bottom and dismisses the flag.
await page.click(`${LAYOUT} .astryx-chat-layout-scroll-button .astryx-button`);
await sleep(200);
g = await geom();
check('the button scrolls to the bottom and re-locks', g.dist < 2 && g.locked && g.following, JSON.stringify(g));
check('…and hides (flag dismissed)', !g.visible && g.inert && !g.expanded, JSON.stringify(g));

// Growth while locked is followed (streaming), and the log is busy meanwhile.
await page.evaluate(() => {
  const list = document.getElementById('chat-demo-list');
  list.isStreaming = true;
  const t = document.getElementById('chat-demo-assistant-template').content.firstElementChild.cloneNode(true);
  t.id = 'stream-target';
  list.contentElement.append(t);
});
for (let i = 0; i < 6; i++) {
  await page.evaluate((i) => { document.querySelector('#stream-target [data-demo-text]').textContent += `Streaming line ${i}\n`; }, i);
  await sleep(40);
}
await sleep(150);
g = await geom();
check('streaming growth is followed while locked', g.dist < 2 && g.locked, JSON.stringify(g));
check('the log is aria-busy while streaming', await page.$eval('#chat-demo-list', (el) => el.getAttribute('aria-busy') === 'true'));
await page.evaluate(() => { document.getElementById('chat-demo-list').isStreaming = false; });
check('aria-busy is removed when the stream completes', await page.$eval('#chat-demo-list', (el) => !el.hasAttribute('aria-busy')));

// Full flow through the composer: send → user + streamed reply, stop button meanwhile.
await page.click('#chat-demo-input [data-ax-chat-editable]');
await page.keyboard.type('Thanks!');
await page.keyboard.press('Enter');
await sleep(100);
const mid = await page.evaluate(() => ({
  busy: document.getElementById('chat-demo-list').getAttribute('aria-busy'),
  stop: document.querySelector('#chat-demo-composer [data-ax-chat-send]').getAttribute('aria-label'),
}));
check('demo: sending streams a reply (log busy, stop shown)', mid.busy === 'true' && mid.stop === 'Stop', JSON.stringify(mid));
await sleep(2000);
g = await geom();
const end = await page.evaluate(() => ({
  busy: document.getElementById('chat-demo-list').hasAttribute('aria-busy'),
  last: [...document.querySelectorAll('#chat-demo-list .astryx-chat-message')].at(-1).textContent,
}));
check('demo: the reply completes at the bottom, log idle again', !end.busy && end.last.includes('overlay tokens') && g.dist < 2, JSON.stringify({end, g}));

// scrollToTopAction: the sentinel at the top dispatches astryx-scroll-to-top; spinner + announcement.
await page.evaluate(() => {
  window.__older = 0;
  document.getElementById('chat-demo-list').addEventListener('astryx-scroll-to-top', (e) => {
    window.__older++;
    e.detail.waitUntil(new Promise((resolve) => setTimeout(resolve, 600)));
  });
});
await page.evaluate((sel) => { document.querySelector(sel).scrollTop = 0; }, LAYOUT);
await sleep(120);
check('reaching the top dispatches astryx-scroll-to-top', await page.evaluate(() => window.__older) === 1);
const loading = await page.evaluate(() => ({
  shown: !document.querySelector('#chat-demo-list [data-ax-chat-loading]').hidden,
  spinnerHidden: document.querySelector('#chat-demo-list [data-ax-chat-loading] .astryx-spinner')?.getAttribute('aria-hidden'),
}));
check('reaching the top shows the loading spinner (silent itself)', loading.shown && loading.spinnerHidden === 'true', JSON.stringify(loading));
await sleep(50);
const said = await page.evaluate(() => document.querySelector('[data-astryx-live-region="polite"]')?.textContent ?? '');
check('loading older messages is announced once ("Loading")', said.includes('Loading'), JSON.stringify(said));
await sleep(700);
check('the spinner hides when the promise settles', await page.evaluate(() => document.querySelector('#chat-demo-list [data-ax-chat-loading]').hidden));

// Empty states and a hidden scroll button.
check('ChatLayout renders its emptyState when the default slot is empty', await page.evaluate(() => [...document.querySelectorAll('.ax-chat-layout-empty')].some((e) => e.textContent.includes('No messages yet'))));
check('ChatMessageList renders its emptyState', await page.evaluate(() => [...document.querySelectorAll('.ax-chat-list-empty')].some((e) => e.textContent.includes('This list is empty'))));
check('scrollButton={null} renders no button', await page.evaluate(() => {
  const layout = document.querySelector('.astryx-chat-layout[data-density="spacious"]');
  return layout && layout.querySelector('.astryx-chat-layout-scroll-button') === null;
}));

await done();
