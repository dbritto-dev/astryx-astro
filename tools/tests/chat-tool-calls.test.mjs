/**
 * ChatToolCalls disclosures and ChatComposerDrawer (components/chat-tool-calls, chat): the group
 * header (role=button, aria-expanded/controls, inert content, both header views, keyboard),
 * row details (aria-controls only while shown), status text, astryx-expanded-change, and the
 * drawer toggle (data-collapsed theme hook, labels, inert content, astryx-collapsed-change).
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('chat-tool-calls');

const GROUP = '#tool-demo-group';
const group = () => page.$eval(GROUP, (el) => {
  const header = el.querySelector(':scope > [role="button"]');
  const content = document.getElementById(header.getAttribute('aria-controls'));
  const view = (k) => header.querySelector(`[data-ax-view="${k}"]`).hidden;
  return {
    expanded: header.getAttribute('aria-expanded'),
    contentInert: content.inert,
    contentOpen: content.hasAttribute('data-ax-expanded'),
    rows: content.getBoundingClientRect().height,
    collapsedViewHidden: view('collapsed'),
    expandedViewHidden: view('expanded'),
    headerText: header.textContent.replace(/\s+/g, ' ').trim(),
    isExpanded: el.isExpanded,
  };
});

await page.evaluate(() => {
  window.__events = [];
  document.addEventListener('astryx-expanded-change', (e) => window.__events.push(e.detail));
});

let g = await group();
check('group starts collapsed: latest call + count, content inert and closed', g.expanded === 'false' && g.contentInert && !g.contentOpen && g.rows < 2 && !g.collapsedViewHidden && g.expandedViewHidden, JSON.stringify(g));
check('collapsed header shows the latest call, its status text and the count', /Running/.test(g.headerText) && g.headerText.includes('run_tests') && /4/.test(g.headerText), g.headerText);

await page.click(`${GROUP} > [role="button"]`);
await page.waitForTimeout(50);
g = await group();
check('click expands: aria-expanded, content open and not inert, summary label', g.expanded === 'true' && !g.contentInert && g.contentOpen && g.rows > 40 && g.collapsedViewHidden && !g.expandedViewHidden && g.headerText.includes('4 tool calls'), JSON.stringify(g));
let events = await page.evaluate(() => window.__events);
check('astryx-expanded-change {isExpanded: true}', events.length === 1 && events[0].isExpanded === true, JSON.stringify(events));

await page.keyboard.press('Enter');
g = await group();
check('Enter on the focused header collapses', g.expanded === 'false' && g.contentInert);
await page.keyboard.press(' ');
g = await group();
check('Space expands', g.expanded === 'true' && g.isExpanded === true);
check('the header is a focus stop with the shared ring', await page.$eval(`${GROUP} > [role="button"]`, (h) => h === document.activeElement && h.tabIndex === 0 && getComputedStyle(h).outlineStyle !== 'none'));

// A row with a detail inside the group.
const row = `${GROUP} [data-ax-detail]`;
const detail = () => page.$eval(row, (r) => ({
  expanded: r.getAttribute('aria-expanded'),
  controls: r.getAttribute('aria-controls'),
  hidden: document.getElementById(r.getAttribute('data-ax-detail')).hidden,
  inset: getComputedStyle(r).outlineOffset,
}));
let d = await detail();
check('detail row: role=button, collapsed, no aria-controls while hidden', d.expanded === 'false' && d.controls == null && d.hidden, JSON.stringify(d));
await page.focus(row);
await page.keyboard.press('Enter');
d = await detail();
check('Enter shows the detail; aria-controls names it', d.expanded === 'true' && d.controls != null && !d.hidden, JSON.stringify(d));
events = await page.evaluate(() => window.__events.length);
check('a row detail does not fire the group event', events === 3, String(events));
await page.click(row);
d = await detail();
check('click hides it again', d.expanded === 'false' && d.hidden && d.controls == null);

// Single call with detail.
await page.click('#tool-demo-detail [data-ax-detail]');
check('single call detail toggles', await page.$eval('#tool-demo-detail [data-ax-detail]', (r) => r.getAttribute('aria-expanded') === 'true' && !document.getElementById(r.getAttribute('data-ax-detail')).hidden));

// Status text and error title.
const statuses = await page.$$eval('.astryx-chat-tool-calls .ax-chat-tool-status', (els) => els.map((s) => ({status: s.getAttribute('data-ax-status'), text: s.querySelector('.ax-visually-hidden')?.textContent, title: s.getAttribute('title')})));
check('status text per call (Pending, Running, Complete, Error: message)', ['Pending', 'Running', 'Complete'].every((t) => statuses.some((s) => s.text === t)) && statuses.some((s) => s.status === 'error' && s.text === 'Error: Permission denied' && s.title === 'Permission denied'), JSON.stringify(statuses.slice(0, 5)));
check('defaultIsExpanded renders open with the custom label', await page.$$eval('.astryx-chat-tool-calls > [role="button"][aria-expanded="true"]', (els) => els.some((h) => h.textContent.includes('Investigated the focus ring'))));

// ── ChatComposerDrawer (on the chat page) ───────────────────────────────────
await open('chat');
const drawers = await page.$$eval('.astryx-chat-composer-drawer', (els) => els.map((el) => ({collapsed: el.getAttribute('data-collapsed'), label: el.querySelector('[role="button"]')?.getAttribute('aria-label')})));
check('drawers render data-collapsed="collapsed" when collapsed, labels name the action', drawers.some((d) => d.collapsed === 'collapsed' && d.label === 'Expand Attachments') && drawers.some((d) => d.collapsed == null && d.label === 'Collapse Files'), JSON.stringify(drawers));
await page.evaluate(() => {
  window.__drawer = [];
  document.addEventListener('astryx-collapsed-change', (e) => window.__drawer.push(e.detail.isCollapsed));
});
const DRAWER = '#chat-demo-composer .astryx-chat-composer-drawer';
const toggle = `${DRAWER} > [role="button"]`;
const drawer = () => page.$eval(DRAWER, (el) => {
  const t = el.querySelector(':scope > [role="button"]');
  const grid = document.getElementById(t.getAttribute('aria-controls'));
  return {collapsed: el.getAttribute('data-collapsed'), expanded: t.getAttribute('aria-expanded'), label: t.getAttribute('aria-label'), inert: grid.inert, isCollapsed: el.isCollapsed};
});
await page.click(toggle);
let dr = await drawer();
check('drawer toggle collapses: data-collapsed, aria-expanded=false, "Expand Files", content inert', dr.collapsed === 'collapsed' && dr.expanded === 'false' && dr.label === 'Expand Files' && dr.inert && dr.isCollapsed, JSON.stringify(dr));
await page.focus(toggle);
await page.keyboard.press('Enter');
dr = await drawer();
check('Enter expands it again', dr.collapsed == null && dr.expanded === 'true' && dr.label === 'Collapse Files' && !dr.inert, JSON.stringify(dr));
check('astryx-collapsed-change reports each toggle', JSON.stringify(await page.evaluate(() => window.__drawer)) === '[true,false]');

await done();
