#!/usr/bin/env node
/**
 * Theme family: nested <Theme> wrappers change tokens and color-scheme for their subtree only,
 * server-side Icons follow the nearest Theme (Astro.locals.astryxTheme scoped per subtree),
 * no <html> sync under a request theme; MediaTheme auto measurement; SyntaxTheme tokens.
 *   node tools/tests/theme.test.mjs
 */
import {setup} from './_harness.mjs';

const {page, check, open, done} = await setup();
await open('theme');

const token = (sel, name) => page.evaluate(([sel, name]) => {
  const el = document.querySelector(sel);
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  el.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}, [sel, name]);

console.log('Wrappers');
const wrappers = await page.evaluate(() => [...document.querySelectorAll('.demo .ax-theme')].map((w) => `${w.dataset.astryxTheme}:${w.dataset.theme ?? 'system'}:${getComputedStyle(w).display}`));
check('one display:contents wrapper per Theme with data-astryx-theme / data-theme', wrappers.slice(0, 4).join() === 'neutral:light:contents,butter:light:contents,matcha:dark:contents,ocean:system:contents', wrappers.join());
check('a request theme exists, so no Theme rewrote <html>', await page.evaluate(() => document.documentElement.dataset.astryxTheme === 'neutral' && !document.documentElement.hasAttribute('data-theme')));

console.log('Tokens change per subtree');
const bg = (id) => page.evaluate((id) => getComputedStyle(document.getElementById(id)).backgroundColor, id);
const panelAccent = [await token('#theme-card-neutral', '--color-accent'), await token('#theme-card-butter', '--color-accent')];
check('butter panel accent ≠ neutral panel accent', panelAccent[0] !== panelAccent[1], panelAccent.join(' / '));
check('each wrapper sets the theme body font', await page.evaluate(() => getComputedStyle(document.getElementById('theme-card-butter')).fontFamily !== getComputedStyle(document.getElementById('theme-card-neutral')).fontFamily));
check('matcha mode="dark" resolves the dark side', await page.evaluate(() => getComputedStyle(document.getElementById('theme-card-matcha')).colorScheme === 'dark'));
check('ocean (custom CSS theme) applies its card token', (await bg('theme-card-ocean')) === 'rgb(238, 248, 255)', await bg('theme-card-ocean'));
const accent = {
  outer: await token('#theme-outer', '--color-accent'),
  middle: await token('#theme-middle', '--color-accent'),
  inner: await token('#theme-inner', '--color-accent'),
};
check('nested themes each set their own accent (butter / gothic / ocean)', new Set(Object.values(accent)).size === 3 && accent.inner === 'rgb(0, 119, 182)', JSON.stringify(accent));
check('gothic mode="dark" nested inside a light theme', await page.evaluate(() => getComputedStyle(document.getElementById('theme-middle')).colorScheme === 'dark'));

console.log('Server-side icons follow the nearest Theme');
const icon = (id) => page.evaluate((id) => {
  const svg = document.querySelector(`#${id} svg`);
  return svg?.getAttribute('data-demo-icon') ?? (svg?.classList.contains('lucide') ? 'lucide' : svg?.outerHTML.slice(0, 60));
}, id);
check('neutral panel: lucide', (await icon('theme-icon-neutral')) === 'lucide');
check('ocean panel: the ocean set', (await icon('theme-icon-ocean')) === 'ocean-close');
check('ocean nested inside gothic inside butter: the ocean set', (await icon('theme-icon-inner')) === 'ocean-close');
check('outer butter before the nested regions: lucide', (await icon('theme-icon-outer')) === 'lucide');
check('back in butter after them: lucide (scope restored)', (await icon('theme-icon-after')) === 'lucide');

console.log('MediaTheme');
await open('media-theme');
const media = (id) => page.evaluate((id) => document.querySelector(`#${id} > .ax-media-theme`).getAttribute('data-astryx-media'), id);
check('mode="dark" renders data-astryx-media="dark"', (await media('mt-dark')) === 'dark');
check('mode="off" renders no media context', (await media('mt-off')) === null);
check('auto on a deep blue → dark', (await media('mt-auto-dark')) === 'dark');
check('auto on the card surface → off (ambient text reads)', (await media('mt-auto-off')) === null);
check('auto on a pale yellow → not dark', (await media('mt-auto-light')) !== 'dark');
check('auto over a background-image keeps the fallback', (await media('mt-auto-image')) === 'dark');
check('the media surface flips color-scheme', await page.evaluate(() => getComputedStyle(document.querySelector('#mt-dark > .ax-media-theme > *')).colorScheme === 'dark'));
check('text takes the on-dark color there', await page.evaluate(() => getComputedStyle(document.querySelector('#mt-dark > .ax-media-theme')).color === 'rgb(255, 255, 255)'));

console.log('SyntaxTheme');
await open('syntax-theme');
const keyword = (id) => page.evaluate((id) => getComputedStyle(document.querySelector(`#${id} span`)).color, id);
check('dracula preset from syntax.css', (await keyword('syntax-dracula')) === 'rgb(255, 121, 198)');
check('github-light preset', (await keyword('syntax-github-light')) === 'rgb(207, 34, 46)', await keyword('syntax-github-light'));
check('defineSyntaxTheme tuple resolves the light side here', (await keyword('syntax-brand')) === 'rgb(123, 44, 191)', await keyword('syntax-brand'));
check('outside any SyntaxTheme the theme\'s own tokens apply', (await keyword('syntax-default')) !== (await keyword('syntax-dracula')));
check('wrapper carries data-astryx-syntax-theme', await page.evaluate(() => document.querySelector('#syntax-nord').parentElement.getAttribute('data-astryx-syntax-theme') === 'nord'));

await done();
