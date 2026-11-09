/**
 * Browser-only preview annotations (registered through `previewAnnotations` in main.ts, so the
 * framework's server-side prerender, which loads preview.ts, never imports them).
 *
 *  - Docs pages (DocsPage.ts): a read-only props table in the static build, and the component's
 *    JSDoc (events, element API) under the stories.
 *  - Actions panel: every `astryx-*` CustomEvent a component dispatches is logged, so a story's
 *    interactions show their result even though Astro components take no callback props.
 *  - Links and forms in a story never navigate the preview iframe (that would replace Storybook
 *    with a 404 or another site); the click or submit is logged to the Actions panel instead.
 *  - Component scripts run in document order, as on an Astro page (see keepScriptOrder), and a
 *    story counts as rendered once they have run (see renderToCanvas), so play functions and the
 *    a11y check see the components with their behaviour attached, as after a page load.
 */
import type {AstroRenderer} from '@storybook-astro/framework';
import {renderToCanvas as renderAstroToCanvas} from '@storybook-astro/renderer/entry-preview';
import {action} from 'storybook/actions';
import type {ProjectAnnotations} from 'storybook/internal/types';
import DocsPage from './DocsPage';

/**
 * Where stories render: the canvas, docs-page stories, and any element renderToCanvas rendered
 * into (marked below), which covers the Vitest runner's canvas. Its page has
 * `<base target="_parent">`, so an unguarded link click there navigates the test orchestrator.
 */
const STORY_ROOT_ATTR = 'data-astryx-story-root';
const STORY_ROOTS = `#storybook-root, .docs-story, [${STORY_ROOT_ATTR}]`;

const describe = (node: EventTarget) =>
  node instanceof Element
    ? `${node.localName}${node.id ? `#${node.id}` : ''}${node.classList[0] ? `.${node.classList[0]}` : ''}`
    : String(node);

const inStory = (node: EventTarget | null) => node instanceof Element && node.closest(STORY_ROOTS) !== null;

/**
 * On an Astro page a component's `<script type="module">` tags run in document order, so a
 * demo's inline script that reads an element defined by an earlier component's script (the
 * PowerSearch demo reads `<ax-power-search>.filters`) finds it upgraded. The Storybook renderer
 * re-creates each script after injecting a story, and a script created with
 * `document.createElement` is async: they would run in download order. `async = false` puts them
 * back in insertion order (the "execute in order as soon as possible" list), which matches the
 * page. Installed when this module loads, before the first story renders.
 */
const scriptRuns = new WeakMap<HTMLScriptElement, Promise<void>>();

function keepScriptOrder() {
  const createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (this: Document, ...args: Parameters<Document['createElement']>) {
    const element = createElement.apply(this, args);
    if (element instanceof HTMLScriptElement) {
      element.async = false;
      // `load` / `error` fire once an external script has run (or failed).
      scriptRuns.set(element, new Promise((resolve) => {
        element.addEventListener('load', () => resolve(), {once: true});
        element.addEventListener('error', () => resolve(), {once: true});
      }));
    }
    return element;
  } as Document['createElement'];
}
keepScriptOrder();

/** Resolves once every external script the story's render inserted has run (10 s at most). */
async function storyScriptsRan(canvasElement: HTMLElement) {
  const runs = [...canvasElement.querySelectorAll<HTMLScriptElement>('script[src]')].flatMap((script) => scriptRuns.get(script) ?? []);
  await Promise.race([Promise.all(runs), new Promise((resolve) => setTimeout(resolve, 10_000))]);
}

/** Whether every `@import` of a story `<style>` has loaded (an imported sheet has rules then). */
const importsLoaded = (style: HTMLStyleElement) => {
  try {
    const rules = style.sheet?.cssRules;
    if (!rules) return false;
    return [...rules].every((rule) => !(rule instanceof CSSImportRule) || (rule.styleSheet?.cssRules.length ?? 0) > 0);
  } catch {
    return true;
  }
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * The static build keeps each story stylesheet as `@import url(…)` in a `<style>` that the
 * renderer moves into <head> (scripts/postbuild.mjs). Imports load asynchronously, so a play
 * could measure markup before its CSS applies (a Grid with one column, an unhidden
 * VisuallyHidden). Wait for them, as a page's first render does. Inline CSS (dev, the test
 * runner) has no imports and passes at once.
 *
 * Markup that rendered before its CSS also *transitions* into it (a Button's background fades
 * in from transparent, a hidden reveal fades out), which a page whose CSS precedes its first
 * render never does. Once the CSS applies, those transitions are finished.
 */
async function storyStylesLoaded(timeout = 10_000) {
  const styles = () => [...document.querySelectorAll<HTMLStyleElement>('style[data-storybook-astro-styles]')];
  if (!styles().some((style) => style.textContent?.includes('@import'))) return;
  const start = performance.now();
  while (performance.now() - start < timeout && !styles().every(importsLoaded)) {
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  await nextFrame();
  for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish();
}

/** Log `astryx-*` CustomEvents to the Actions panel. */
function logAstryxEvents() {
  const dispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (this: EventTarget, event: Event) {
    if (event instanceof CustomEvent && event.type.startsWith('astryx-') && inStory(this)) {
      action(event.type)({target: describe(this), detail: event.detail});
    }
    return dispatch.call(this, event);
  };
}

/** The browsing context a link opens in: its own target, else the document's `<base target>`. */
const linkTarget = (link: HTMLAnchorElement) =>
  (link.target || document.querySelector('base[target]')?.getAttribute('target') || '_self').toLowerCase();

/**
 * Same-document anchors (`#id`) that stay in this frame keep working; every other navigation is
 * logged instead (the Vitest page's `<base target="_parent">` would send even `#id` elsewhere).
 */
function onClick(event: MouseEvent) {
  if (event.defaultPrevented || !inStory(event.target)) return;
  const link = (event.target as Element).closest('a[href]');
  if (!(link instanceof HTMLAnchorElement)) return;
  const url = new URL(link.href, location.href);
  const samePage = url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;
  if (samePage && url.hash && linkTarget(link) === '_self') return;
  event.preventDefault();
  action('navigate')({href: link.getAttribute('href'), target: link.target || undefined});
}

function onSubmit(event: SubmitEvent) {
  if (event.defaultPrevented || !inStory(event.target)) return;
  const form = event.target as HTMLFormElement;
  event.preventDefault();
  action('submit')({form: describe(form), data: Object.fromEntries(new FormData(form, event.submitter))});
}

/** Installed once per preview page, on the first story render. */
let installed = false;

const preview: ProjectAnnotations<AstroRenderer> = {
  /**
   * The framework's renderToCanvas resolves when the story's HTML is in the page; its component
   * scripts (custom elements, behaviours) and, in the static build, its stylesheets are then
   * still loading. Play functions and addon-a11y run next, so wait for both, as a page's first
   * render would. A static build loads
   * them over the network on first view, which is where interacting early showed.
   */
  async renderToCanvas(context, canvasElement) {
    canvasElement.setAttribute(STORY_ROOT_ATTR, '');
    const teardown = await renderAstroToCanvas(context, canvasElement);
    await Promise.all([storyScriptsRan(canvasElement), storyStylesLoaded()]);
    return teardown;
  },
  parameters: {
    docs: {page: DocsPage},
  },
  beforeEach() {
    if (installed) return;
    installed = true;
    logAstryxEvents();
    // Bubble phase on window: components see the event first and may handle it themselves.
    window.addEventListener('click', onClick);
    window.addEventListener('submit', onSubmit);
  },
};

export default preview;
