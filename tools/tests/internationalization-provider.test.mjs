#!/usr/bin/env node
/**
 * InternationalizationProvider: translated strings change for its subtree only (siblings
 * rendered concurrently keep the page locale, nested providers win and end), direction is
 * published but never written to the DOM. LinkProvider: the same subtree scoping for
 * Astro.locals.astryxLinkComponent, `as` override, blocked destinations.
 *   node tools/tests/internationalization-provider.test.mjs
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('internationalization-provider');

const row = (id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  const t = [...el.querySelectorAll('[data-locale]')];
  return {
    text: t.map((s) => s.textContent).join(' | '),
    locale: t[0]?.dataset.locale,
    direction: t[0]?.dataset.direction,
    spinner: el.querySelector('[role="progressbar"], .astryx-spinner')?.getAttribute('aria-label') ?? null,
    kbd: el.querySelector('.astryx-kbd')?.getAttribute('aria-label') ?? null,
    hint: el.querySelector('[data-ax-keyboard-hint]')?.textContent ?? null,
  };
}, id);

let r = await row('i18n-before');
check('page locale before the provider: en', r.locale === 'en' && r.text === 'Loading | to navigate' && r.spinner === 'Loading', JSON.stringify(r));
r = await row('i18n-fr');
check('inside the provider: fr-FR strings', r.locale === 'fr-FR' && r.text === 'Chargement | pour naviguer', JSON.stringify(r));
check('real components translate too (Spinner, Kbd, SegmentedControl hint)', r.spinner === 'Chargement' && /Ctrl|Contr/.test(r.kbd ?? '') && (r.hint ?? '').includes('pour naviguer'), JSON.stringify(r));
r = await row('i18n-de');
check('a nested provider wins for its subtree', r.locale === 'de-DE' && r.text === 'Wird geladen' && r.spinner === 'Wird geladen', JSON.stringify(r));
r = await row('i18n-fr-after');
check('after the nested provider the outer locale is back', r.locale === 'fr-FR' && r.text === 'Chargement', JSON.stringify(r));
r = await row('i18n-sibling');
check('a sibling after the provider keeps en (concurrent render isolated)', r.locale === 'en' && r.text === 'Loading' && r.spinner === 'Loading', JSON.stringify(r));
r = await row('i18n-ar');
check('ar-SA strings, direction published as rtl', r.locale === 'ar-SA' && r.direction === 'rtl' && r.text !== 'Loading', JSON.stringify(r));
check('the provider writes no dir (the page set it on the wrapper)', await page.evaluate(() => {
  const ar = document.getElementById('i18n-ar');
  return !ar.hasAttribute('dir') && ar.parentElement.getAttribute('dir') === 'rtl' && !document.getElementById('i18n-fr').closest('[dir]');
}));
check('fr row direction is ltr', (await row('i18n-fr')).direction === 'ltr');

console.log('LinkProvider');
await open('link-provider');
const links = (id) => page.evaluate((id) => [...document.querySelectorAll(`#${id} a`)].map((a) => `${a.getAttribute('href') ?? '∅'}${a.hasAttribute('data-router-link') ? '+router' : ''}${a.hasAttribute('data-link-blocked') ? '+blocked' : ''}`).join(' '), id);
check('no provider: native <a>', (await links('link-native')) === '/docs');
check('inside: the custom component; as="a" overrides; blocked href inert, never routed', (await links('link-custom')) === '/docs+router /pricing+router ∅+blocked /plain', await links('link-custom'));
check('a nested provider resets to <a>', (await links('link-reset')) === '/docs');
check('after the provider: native again', (await links('link-after')) === '/docs');

await done();
