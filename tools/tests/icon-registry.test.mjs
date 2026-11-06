#!/usr/bin/env node
/**
 * Icon resolver (src/components/Icon/iconRegistry.ts): Astryx precedence (theme entry →
 * registerIcons → built-in default), function entries, variants, theme-name sources and
 * component icon slots. Exit code 1 on any failure.
 *   node tools/tests/icon-registry.test.mjs
 */
import * as reg from '../../packages/astryx-astro/src/components/Icon/iconRegistry.ts';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log(`✓ ${name}`);
  else { failures++; console.log(`✗ ${name}${detail ? `\n    ${detail}` : ''}`); }
};
const astro = (theme) => ({locals: theme === undefined ? {} : {astryxTheme: theme}});
const md = {size: 'md'};

check('29 built-in names', reg.iconNames.length === 29, reg.iconNames.join(','));
check('no theme → built-in default', reg.resolveIcon('close', astro(), md) === reg.defaultIcons.close);
check('Astro.locals.astryxTheme → shipped theme (Lucide)', reg.resolveIcon('close', astro('butter'), md) === reg.lucideIcons.close);
check('every shipped theme maps all 29 names', ['neutral', 'butter', 'chocolate', 'gothic', 'matcha', 'stone', 'y2k']
  .every((t) => reg.iconNames.every((n) => reg.resolveIcon(n, t, md) === reg.lucideIcons[n])));
check('Lucide artwork is 1em, aria-hidden', /^<svg class="lucide lucide-circle-check-big"[^>]*width="1em" height="1em"[^>]*aria-hidden="true">/.test(reg.lucideIcons.success), reg.lucideIcons.success);
check('explicit theme prop beats locals; null forces defaults',
  reg.resolveIcon('close', astro('butter'), md, null) === reg.defaultIcons.close
  && reg.resolveIcon('close', astro(), md, 'neutral') === reg.lucideIcons.close);
check('unknown theme name → defaults', reg.resolveIcon('close', astro('nope'), md) === reg.defaultIcons.close);
check('unknown name → null', reg.resolveIcon('nope', astro(), md) === null);
check('namespaced default resolves', reg.resolveIcon('numberInput:stepperDown', astro(), md)?.includes('M7.5 9.75'));

reg.registerIcons({close: '<svg id="registered"></svg>', 'lib:bold': '<svg id="bold"></svg>'});
check('registered beats default when no theme maps the name', reg.resolveIcon('close', astro(), md) === '<svg id="registered"></svg>');
check('theme entry beats registered (Astryx selectIconEntry order)', reg.resolveIcon('close', astro('neutral'), md) === reg.lucideIcons.close);
check('registered namespaced key resolves under any theme', reg.resolveIcon('lib:bold', astro('neutral'), md) === '<svg id="bold"></svg>');
check('getExtendedIcon fallback when nothing registers the key', reg.getExtendedIcon('lib:italic', '<svg id="fb"></svg>') === '<svg id="fb"></svg>');

const calls = [];
reg.registerIconTheme('brand', {
  iconVariants: ['filled'],
  icons: {
    info: (r) => { calls.push(r); return `<svg data-size="${r.size}" data-variant="${r.variant ?? ''}"></svg>`; },
    close: () => null,
    check: null,
  },
  componentIcons: {
    'code-block-copy': ({copied}) => (copied ? {icon: 'checkDouble', size: 'sm'} : undefined),
    'table-row-expand': null,
    'table-sort-indicator': {icon: 'nope', variant: 'filled'},
  },
});
check('function entry receives the rendered size', reg.resolveIcon('info', 'brand', {size: 'lg'}) === '<svg data-size="lg" data-variant=""></svg>');
check('listed variant is passed through', reg.resolveIcon('info', 'brand', {size: 'sm', variant: 'filled'}).includes('data-variant="filled"'));
reg.resolveIcon('info', 'brand', {size: 'sm', variant: 'outline'});
check('unlisted variant is withheld', !('variant' in calls.at(-1)));
check('a function returning null is final (no fallback)', reg.resolveIcon('close', 'brand', md) === null);
check('a nullish static theme entry falls through', reg.resolveIcon('check', 'brand', md) === reg.defaultIcons.check);
check('getIcon reads function entries at md', reg.getIcon('info', 'brand').includes('data-size="md"'));
check('getIconRegistry lists built-in names only', Object.keys(reg.getIconRegistry('brand')).length === 29);

const fallback = 'copy';
check('slot: theme maps nothing → component fallback', reg.resolveComponentIcon('timestamp-copy', {copied: true}, fallback, astro('brand')).icon === 'copy');
const copied = reg.resolveComponentIcon('code-block-copy', {copied: true}, fallback, astro('brand'));
check('slot: state function returns a request', copied.icon === 'checkDouble' && copied.size === 'sm');
check('slot: state function undefined → unchanged', reg.resolveComponentIcon('code-block-copy', {copied: false}, fallback, 'brand').icon === 'copy');
check('slot: null hides the icon', reg.resolveComponentIcon('table-row-expand', {expanded: true}, 'chevronRight', 'brand').icon === null);
const sort = reg.resolveComponentIcon('table-sort-indicator', {direction: 'none'}, {icon: 'arrowsUpDown'}, 'brand');
check('slot: unknown icon ignored, listed variant applied', sort.icon === 'arrowsUpDown' && sort.variant === 'filled');
check('slot: no theme → fallback', reg.resolveComponentIcon('code-block-copy', {copied: true}, fallback, astro()).icon === 'copy');

reg.resetIcons();
check('resetIcons restores shipped themes and clears registrations',
  reg.resolveIcon('close', astro(), md) === reg.defaultIcons.close && reg.getIconTheme('brand') === null && reg.getIconTheme('neutral') != null);

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
