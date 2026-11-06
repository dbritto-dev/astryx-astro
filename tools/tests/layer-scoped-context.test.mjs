#!/usr/bin/env node
/**
 * Layer-scoped contexts (Astryx createLayerScopedContext + LayerContentBoundary, contract #23):
 * `renderLayerContent()` (lib/subtreeLocals.ts) resets the List, CheckboxList, RadioList,
 * TabList and Stepper locals inside overlay content, while Theme, locale, link component and
 * calendar keys pass through — with and without AsyncLocalStorage. Then the Popover demo: a
 * compact, divided List around a Popover does not reach the row inside it, while the Theme
 * (its icon set) and the locale (fr-FR) do; the same List reset for a nav menu (TopNavHeading's
 * `menu` slot, pre-rendered by the heading) and a ContextMenu (`menuContent`, in its template).
 *   node tools/tests/layer-scoped-context.test.mjs
 */
import {lib} from './lib-loader.mjs';
import {setup} from './_harness.mjs';

const {page, context, check, open, done} = await setup();

const components = new URL('../../packages/astryx-astro/src/components/', import.meta.url);
const ctx = (path) => import(new URL(path, components).href);
const sl = await lib('subtreeLocals.ts');
const {LIST_LOCAL, readListContext} = await ctx('List/listContext.ts');
const {RADIO_LIST_LOCAL, readRadioListContext} = await ctx('RadioList/radioListContext.ts');
const {CHECKBOX_LIST_LOCAL} = await ctx('CheckboxList/checkboxListContext.ts');
const {TAB_LIST_LOCAL} = await ctx('TabList/tabListContext.ts');
const {STEPPER_LOCAL, readStepperContext} = await ctx('Stepper/stepperContext.ts');

console.log('Registry');
const keys = sl.layerScopedLocals();
check('List, CheckboxList, RadioList, TabList and Stepper keys are layer-scoped',
  [LIST_LOCAL, CHECKBOX_LIST_LOCAL, RADIO_LIST_LOCAL, TAB_LIST_LOCAL, STEPPER_LOCAL].every((k) => keys.includes(k)), keys.join());
check('Theme, locale, link and calendar keys are not', ['astryxTheme', 'astryxLocale', 'astryxLinkComponent', 'astryxCalendar'].every((k) => !keys.includes(k)));

const scenario = async (label) => {
  console.log(label);
  const astro = {locals: {astryxTheme: 'request-theme'}};
  const list = {density: 'compact', hasDividers: true, edge: 'padded', listStyle: 'none'};
  const radio = {name: 'plan', value: 'pro', isDisabled: false, hasDisabledMessage: false, isRequired: false, size: 'md'};
  const seen = await sl.renderWithLocals(astro, {astryxTheme: 'ocean', astryxLocale: 'fr-FR', astryxLinkComponent: 'RouterLink'}, () =>
    sl.renderWithLocals(astro, {[LIST_LOCAL]: list, [RADIO_LIST_LOCAL]: radio, [STEPPER_LOCAL]: {activeStep: 1}}, async () => {
      const outside = {list: readListContext(astro), radio: readRadioListContext(astro)};
      const inside = await sl.renderLayerContent(astro, async () => {
        await new Promise((r) => setTimeout(r, 5));
        const plain = {
          list: readListContext(astro), radio: readRadioListContext(astro), stepper: readStepperContext(astro),
          theme: astro.locals.astryxTheme, locale: astro.locals.astryxLocale, link: astro.locals.astryxLinkComponent,
        };
        // A provider inside the layer content provides again for its own subtree.
        const nested = await sl.renderWithLocals(astro, {[LIST_LOCAL]: {...list, density: 'spacious'}}, async () => readListContext(astro)?.density);
        return {...plain, nested, afterNested: readListContext(astro)};
      });
      const after = readListContext(astro);
      return {outside, inside, after};
    }));
  check('outside the overlay the item reads the List / RadioList', seen.outside.list?.density === 'compact' && seen.outside.radio?.name === 'plan');
  check('inside the overlay content List, RadioList and Stepper are reset', seen.inside.list === null && seen.inside.radio === null && seen.inside.stepper === null, JSON.stringify(seen.inside));
  check('inside the overlay content Theme, locale and link component pass through', seen.inside.theme === 'ocean' && seen.inside.locale === 'fr-FR' && seen.inside.link === 'RouterLink', JSON.stringify(seen.inside));
  check('a List inside the overlay content provides again', seen.inside.nested === 'spacious' && seen.inside.afterNested === null);
  check('after the overlay the List context is back', seen.after?.density === 'compact');
  check('the request values are restored', astro.locals.astryxTheme === 'request-theme' && astro.locals[LIST_LOCAL] === undefined && sl.requestLocal(astro, 'astryxTheme') === 'request-theme');

  // A request value (middleware) is what an overlay resets to.
  const req = {locals: {[LIST_LOCAL]: {density: 'spacious'}}};
  const inLayer = await sl.renderWithLocals(req, {[LIST_LOCAL]: {density: 'compact'}}, () => sl.renderLayerContent(req, async () => readListContext(req)?.density));
  check('overlay content resets to the request value', inLayer === 'spacious', String(inLayer));
};

await scenario('AsyncLocalStorage');
check('isolation active', sl.hasSubtreeIsolation());
const holder = globalThis[Symbol.for('astryx-astro/subtree-locals/v1')];
const storage = holder.storage;
holder.storage = null;
try {
  await scenario('Fallback (no AsyncLocalStorage: set and restore)');
} finally {
  holder.storage = storage;
}

console.log('Popover inside a List, Theme and InternationalizationProvider');
await open('popover');
const html = await page.evaluate(() => {
  const at = (id) => document.getElementById(id);
  return {
    outer: {density: at('pop-scope-outer').dataset.density, divided: at('pop-scope-outer').hasAttribute('data-ax-divided'), inList: at('pop-scope-outer').hasAttribute('data-ax-in-list')},
    inner: {density: at('pop-scope-inner').dataset.density, divided: at('pop-scope-inner').hasAttribute('data-ax-divided'), inList: at('pop-scope-inner').hasAttribute('data-ax-in-list')},
    icon: at('pop-scope-icon').querySelector('svg')?.getAttribute('data-demo-icon'),
    spinner: at('pop-scope-spinner').querySelector('[role="progressbar"]')?.getAttribute('aria-label'),
  };
});
check('the List rows outside the popover are compact and divided', html.outer.density === 'compact' && html.outer.divided && html.outer.inList, JSON.stringify(html.outer));
check('the row inside the popover reads no List context (balanced, undivided)', html.inner.density === 'balanced' && !html.inner.divided && !html.inner.inList, JSON.stringify(html.inner));
check('the Theme reaches popover content (its close icon)', html.icon === 'scope-close', String(html.icon));
check('the locale reaches popover content (fr-FR "Chargement")', html.spinner === 'Chargement', String(html.spinner));
await page.click('#pop-scope-trigger');
await page.waitForTimeout(100);
check('the popover opens with its content', await page.evaluate(() => document.getElementById('pop-scope').matches(':popover-open') && document.getElementById('pop-scope-inner').checkVisibility()));
await page.keyboard.press('Escape');

// A ListItem's List context, read from its attributes (in the document or in a template).
await context.addInitScript(() => {
  window.__rowContext = (row) => row && {density: row.dataset.density, divided: row.hasAttribute('data-ax-divided'), inList: row.hasAttribute('data-ax-in-list')};
});
const listed = (r) => r?.density === 'compact' && r.divided && r.inList;
const plain = (r) => r?.density === 'balanced' && !r.divided && !r.inList;

console.log('Nav menu (TopNavHeading menu slot) inside a List');
await open('top-nav');
const nav = await page.evaluate(() => {
  const inner = document.getElementById('nav-scope-inner');
  return {
    outer: window.__rowContext(document.getElementById('nav-scope-outer')),
    inner: window.__rowContext(inner),
    inLayer: !!inner?.closest('ax-nav-menu[data-astryx-layer-root]'),
  };
});
check('the List rows outside the nav menu are compact and divided', listed(nav.outer), JSON.stringify(nav.outer));
check('the row inside the nav menu layer reads no List context (balanced, undivided)', nav.inLayer && plain(nav.inner), JSON.stringify(nav));
await page.click('#nav-scope-heading button[aria-haspopup]');
await page.waitForFunction(() => document.getElementById('nav-scope-inner')?.checkVisibility());
check('the nav menu opens with its content', await page.evaluate(() => document.getElementById('nav-scope-inner').closest('ax-nav-menu').matches(':popover-open')));
await page.keyboard.press('Escape');

console.log('Context menu (menuContent slot) inside a List');
await open('context-menu');
const cmLayer = '[data-ax-context-target="cm-scope-area"]';
const cm = await page.evaluate((sel) => {
  const template = document.querySelector(`${sel} > template[data-ax-menu-content]`);
  return {outer: window.__rowContext(document.getElementById('cm-scope-outer')), inner: window.__rowContext(template?.content.getElementById('cm-scope-inner'))};
}, cmLayer);
check('the List rows outside the context menu are compact and divided', listed(cm.outer), JSON.stringify(cm.outer));
check('the row in the context menu content reads no List context (balanced, undivided)', plain(cm.inner), JSON.stringify(cm.inner));
const target = await page.locator('#cm-scope-target').boundingBox();
await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2, {button: 'right'});
await page.waitForFunction((sel) => document.querySelector(sel).matches(':popover-open') && !!document.querySelector(`${sel} #cm-scope-inner`), cmLayer);
const mounted = await page.evaluate(() => window.__rowContext(document.getElementById('cm-scope-inner')));
check('the context menu opens with the plain row mounted', plain(mounted), JSON.stringify(mounted));
await page.keyboard.press('Escape');

await done();
