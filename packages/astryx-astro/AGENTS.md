# Porting conventions — astryx-astro

This package re-implements `@astryxdesign/core` (React 19 + StyleX) as server-rendered
Astro components with plain, layered CSS, plus small light-DOM web components only where
behaviour needs JavaScript. Read this before porting or reviewing a component.

## Source of truth

- Port from `node_modules/@astryxdesign/core/src/<Dir>/` (the installed **0.7.9** source,
  the same version the generated themes come from). Read `<Name>.tsx`, every `*.stylex.ts`
  it imports, and `<Name>.doc.mjs` (props, behaviour notes, `theming.targets`).
- `meta/astryx-docs.json` (generated) lists every component and sub-component with props
  and theming targets. It is the checklist: every non-hook entry gets a port.
- Never edit generated files: `src/styles/tokens.css`, `reset.css`, `themes/*`,
  `tokens.json`, `src/locales/*`, `meta/astryx-docs.json`. Regenerate with
  `node scripts/build-tokens.mjs` / `node scripts/build-manifest.mjs`.

## Files per component

```
src/components/<Dir>/
  <Name>.astro          one per public component or sub-component (CardHeader.astro …)
  <Dir>.css             styles for the whole family, imported by each .astro file
  <Name>.demo.astro     docs examples for the top-level component (and its sub-components)
src/elements/<tag>.ts   custom elements (<ax-*>), when a widget needs state
src/behaviors/<x>.ts    attribute behaviours (data-ax-*), when an element must stay native
```

Use the Astryx directory name for `<Dir>`; sub-components that Astryx keeps in their own
directory but documents under a parent (HStack → Stack, Heading → Text) live with the
parent so the docs page finds them.

Export every component from `src/index.ts` (`export {default as Button} from …`).

## The theming contract (non-negotiable)

Generated Astryx themes style components through stable hooks, e.g.
`.astryx-button[data-variant="destructive"]`. Every port must render them exactly:

- Root element class `astryx-<kebab-name>` and the same `data-*` attributes Astryx passes to
  `themeProps('<name>', {...})` in the React source, with the same values (including
  defaults Astryx resolves before calling themeProps). Use `themeProps()` from
  `src/lib/themeProps.ts`; merge the consumer `class` with `cx(themeClass, className)`.
- Sub-elements that Astryx gives `themeProps(...)` (e.g. `progress-bar-track`) get theirs too.
- `node scripts/conformance.mjs <Name>` (after a docs build) checks every
  `theming.targets` entry appears in the demo. Demos must exercise every visual prop.

## CSS

- Every stylesheet starts with `@layer reset, astryx-base, astryx-theme;` and puts all rules
  in `@layer astryx-base { … }`. Themes live in `astryx-theme`; consumer CSS is unlayered and
  always wins. Never use `!important` (except to mirror an Astryx `!important`).
- Selectors: the `astryx-*` class plus `data-*` attributes for props/state. Keep specificity
  flat (one class + attributes). Translate StyleX precedence (later style in
  `stylex.props()` wins) into **source order at equal specificity**: write rule groups in the
  same order as the React source passes styles.
- Values come from tokens (`var(--color-…)`, `var(--spacing-…)`) exactly as the StyleX
  source references them. Copy literal values verbatim. Keep Astryx's private component
  variables (`--_button-radius`, `--astryx-card-padding` …): themes set them.
- Per-instance dynamic values (widths, padding steps, line clamps): set private custom
  properties inline (`--_ax-*`) and read them in the stylesheet with a fallback, so consumer
  CSS can still override. Register non-inheriting ones in the stylesheet:
  `@property --_ax-foo { syntax: "*"; inherits: false; }`. Plain sizes Astryx sets inline
  (`width`, `height`) stay inline.
- Pseudo-states StyleX expresses as `':hover'`, `':focus-visible'`, `'@media …'` map to the
  same selectors / at-rules. Reuse shared primitives in `src/styles/shared.css`.
- Respect `prefers-reduced-motion` exactly where Astryx does.

## Props

- Same names, defaults and semantics as the React props (`label`, `variant`, `isDisabled`,
  `isLoading`, `hasX` …) so Astryx docs and agent knowledge transfer. Type them in
  `export interface Props` (the docs page shows this block), extending
  `HTMLAttributes<'tag'>` from `astro/types` and spreading the rest onto the root.
- `ReactNode` props become named slots when they hold markup (`<Fragment slot="icon">`) and
  stay string props when Astryx uses them as text (`label`, `description`). When both are
  plausible accept both: `label` prop or `label` slot.
- `children` → default slot. `as` → dynamic tag. `ref` / `xstyle` have no equivalent; drop.
- Event-handler props (`onClick`, `onChange`, `clickAction` …) don't exist server-side.
  Native events work as-is on native elements. Custom elements dispatch DOM `CustomEvent`s
  named `astryx-<event>` (e.g. `astryx-change`, `astryx-open-change`) with the same payload
  in `detail`, bubbling and composed. Document them in the component's JSDoc.
- Controlled/uncontrolled state: SSR renders the initial state from props
  (`isOpen`, `value`, `defaultValue` …); the element owns state afterwards and reflects it
  in attributes. Expose an imperative API on the element (`open()`, `close()`, `value`).
- Context-driven props (SizeContext, group contexts) become inherited CSS or attributes on
  the container that children read with selectors — see shared.css notes.

## Behaviour (JavaScript)

- Prefer the platform: `<dialog>`, the `popover` attribute, invoker commands, `<details>`,
  native form controls, `:has()`, CSS anchor positioning, `inert`, `focusgroup`-style roving
  tabindex. Zero JS for components that are static in Astryx. What may be used without a
  fallback is set by `docs/platform.md`.
- Stateful widgets: a custom element `<ax-<name>>` defined in `src/elements/<name>.ts`, light
  DOM only (no shadow root), wrapping the server-rendered markup. Load it from the component
  with `<script>import '../../elements/<name>';</script>` (Astro bundles and de-duplicates).
  Guard registration: `if (!customElements.get(tag)) customElements.define(tag, Cls)`.
  Must work when the element connects after load and clean up in `disconnectedCallback`.
- Enhancements on elements that must stay native (a flex child, a `<button>`):
  `defineBehavior('<name>', setup)` from `src/elements/behavior.ts`, driven by a
  `data-ax-<name>` attribute. Only conditionally include the `<script>` when the feature is
  used, as Text does for truncation tooltips.
- Accessibility parity: keep every ARIA attribute, role, keyboard interaction and live-region
  announcement the React source has. Port keyboard maps from `src/keyboard` / hooks.

## Shared building blocks (use these; don't re-invent)

- `src/styles/shared.css` (loaded globally via `astryx.css`): focus-ring classes
  (`ax-focus-visible`, `ax-focus-within`, `ax-focus-within-first-child`,
  `ax-focus-within-combobox`, `ax-focus-suppressed`, `ax-focus-publish` +
  `ax-focus-within-or-published`), hover/press overlays (`ax-overlay-bg`, `ax-overlay-image`,
  `ax-overlay-image-neutral`, `ax-overlay-pressed-bg`) with Astryx's enabled guard and
  `(hover: hover)` gating, `ax-mirror-rtl`, `ax-hit-area`, scroll lock
  (`data-ax-scroll-lock` on a modal `<dialog>`), and the `[data-astryx-layer-root]` reset.
  Add the class next to the `astryx-*` class wherever the React source applies
  `focusOutlineStyles.*` / `interactionOverlayStyles.*`. Override with a more specific
  selector, never by stylesheet order.
- `src/lib/cascade.ts`: context replacement. Providers (SizeContext, ButtonGroup size and
  disabled, Toolbar size, IconDefaultSize inside Button, FormLayout optionality, RadioList
  name, List density …) render their slot with `await Astro.slots.render('default')` and
  `stamp()` the effective value onto descendants that opted in with
  `data-ax-inherit="<key> …"` (only when the prop was not explicit). Always render the
  effective `data-size` etc. yourself too, so theme rules match without a provider.
  Overlays `seal()` their content: cascades end at layer roots. Layer-scoped subtree-locals
  contexts (List, CheckboxList, RadioList, TabList, Stepper — `layerScopedLocal()` in
  `src/lib/subtreeLocals.ts`) end there too: render the content slot through
  `renderLayerContent(Astro, () => Astro.slots.render(…))`.
- `src/lib/safeUrl.ts`: run `safeHref()` on every href you render (Link, Button href, Item,
  Token, ClickableCard, Citation, Markdown, TopNav). A blocked URL renders an inert element.
- `src/lib/padding.ts`, `src/lib/style.ts`, `src/lib/types.ts`, `src/lib/i18n.ts`.
- `src/elements/behavior.ts`: attribute behaviours.
- Client runtime singletons live in `src/elements/runtime/` (modality, announce, layer stack
  with Escape/outside-press/focus return, anchor positioning, roving focus, typeahead,
  disabled-interaction). Import them; never add a second document-level Escape or
  modality listener. Module-level mutable state in `src/elements/**` goes through
  `globalSingleton()` (`runtime/global.ts`) so a duplicated module copy shares it (see
  docs/handoffs.md, "Global-singleton rule").

## Overlays (from docs/architecture-map.md §4 and §8)

1. Native promotion only: `popover="auto|manual"` (or `hint` where supported) and
   `<dialog>.showModal()`. Render layer markup as a sibling of its trigger, never inside
   `<button>`, `<a>` or phrasing-only parents. No portals.
2. Position with CSS anchor positioning: the runtime stamps a unique `anchor-name` on the
   trigger while open and `position-anchor` on the layer; static CSS keyed on
   `data-placement` / `data-align` supplies `position-area`, `position-try-fallbacks`, the
   viewport gutter (`max(var(--spacing-4), env(safe-area-inset-*))`) and `max-*-size` caps.
   There is no JS positioner (the anchor positioning used is Baseline).
3. One document Escape stack (topmost layer only, skip `defaultPrevented`, ignore IME), a
   press must start and end outside/on the backdrop to dismiss, focus returns with
   `preventScroll: true`.
4. Every layer root carries `data-astryx-layer-root` and `seal()`s its slot content, rendered
   through `renderLayerContent()` (layer-scoped contexts reset, Theme/locale pass through).
5. Entry/exit animation with `@starting-style` + `transition-behavior: allow-discrete`,
   tokens `--duration-*` / `--ease-*`; no travel under `prefers-reduced-motion` or
   `[data-astryx-reduced-motion]` (cross-fade instead).

## Cross-component contracts

Read `docs/handoffs.md` (contracts other batches established) and `docs/architecture-map.md` §5 (theming mechanics, private vars themes write such as
`--_button-radius`, size cascade) and §8 (26 contracts: accessible names, `aria-disabled`
for disabled-but-focusable, pending state, size/height contract, container padding protocol,
edge compensation `data-astryx-edge-comp`, Field routing, InputGroup admission, navigation
safety, dismissal, modality, press paint, minimal DOM). They are binding.

## Scope for this version

Desktop, keyboard and assistive-technology behaviour at parity. Astryx's UIKit-style touch
extras are deferred and must be listed in the component's header comment when skipped:
the coarse-pointer press controller (`data-astryx-press`), slide-across action groups,
press-drag-release menus, long-press-and-hold drags, swipe actions, wheel pickers,
keyboard riding. Plain touch use (tap, scroll, native controls) must still work.

## Working in parallel

- Work only inside your own component directories, plus files you are explicitly told
  you own (e.g. `src/elements/runtime/*`). Do **not** edit `src/index.ts` (generated by
  `node scripts/build-index.mjs`), `src/styles/shared.css`, `src/lib/*`, the docs app,
  or generated files. If you need a shared change, describe it in your final report.
- Build the docs to check your work: `cd apps/docs && npx astro build`, then
  `node packages/astryx-astro/scripts/conformance.mjs <Name …>` from the repo root and
  `node tools/shot.mjs <slug> [--mode=dark] [--theme=butter]` for screenshots (reads
  apps/docs/dist; slug = kebab-case component name).

## i18n

User-visible strings Astryx gets from `useComponentTranslator` come from the same keys:
`const t = translator(Astro, locale)` (`src/lib/i18n.ts`), `t('@astryx.pagination.next')`.
Components that render strings accept an optional `locale` prop. Elements never translate
in the browser: render strings into attributes or `<template>`s on the server.

## Demos

`<Name>.demo.astro` renders realistic examples of every variant, size and state, plus
sub-components. No external images: use inline SVG or CSS. It is the conformance fixture.

## Done means

1. `.astro` files for the component and every sub-component in the manifest.
2. Exported from `src/index.ts`.
3. Demo covers every visual prop; `pnpm build` succeeds; conformance passes.
4. Behaviour verified in a browser for interactive components (keyboard included).
5. File header comment names the Astryx source files it ports. MIT notice stays in NOTICE.
