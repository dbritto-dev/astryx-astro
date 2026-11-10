# Writing stories for astryx-astro

How to write the Storybook stories of an astryx-astro component. Read it all once; the rules
follow from how stories render (section 1), and `pnpm -F storybook check` enforces the ones a
script can see. Templates: [`templates/Component.stories.ts.template`](templates/Component.stories.ts.template)
and [`templates/ComponentStory.astro.template`](templates/ComponentStory.astro.template). Finished
examples (the pilots): Button, Text, DropdownMenu, Dialog, Tooltip, DateInput, Calendar, Table,
Layout under `stories/`.

Contents: 1 How stories render · 2 Workflow · 3 Files, title, meta · 4 Overview · 5 Variant
stories · 6 Args, slots and wrappers · 7 Story wrappers · 8 Interaction tests · 9 Overlays,
popovers, modals · 10 Dates and Temporal · 11 Server-only props, locals, locale · 12 Theme and
mode · 13 Accessibility · 14 Docs page · 15 Don'ts · 16 Checklist · 17 Commands · 18 Framework
notes.

## 1. How stories render (the model behind every rule)

Storybook runs on `@storybook-astro/framework` 1.15 (`apps/storybook/.storybook/main.ts`).

- **Static build** (`pnpm -F storybook build`, published on GitHub Pages under
  `/astryx-astro/storybook/`): every story is rendered **once, on the server, at build time**,
  into `storybook-static/astro-prerendered-stories.json`. In the browser only the components' own
  `<script>`s run. Args, Controls and toolbar globals cannot change the HTML afterwards, so the
  Controls panel is hidden there and the docs page shows a read-only props table.
- **Dev** (`pnpm -F storybook dev`) and **tests** (`pnpm -F storybook test`) render on demand
  through the Astro Container API, so Controls work in dev.
- A story must therefore look and behave the same in all three: **one meaningful prop
  combination per story** ("variants as stories"), fixed values, and `play` tests that pass
  against the pre-rendered markup.
- **Only `meta.component` is pre-rendered.** A story with its own `component`, or a `render`
  function, is dropped from (or ignored by) the static build. To render anything else, a story
  uses a decorator that *replaces* the story with another `.astro` file: `overview()` (the docs
  demo) and `composed()` (a story wrapper) in `stories/_lib/story.ts` do exactly that.
- **Every component in a story is a separate Astro render**: the story itself, each component
  passed in `args.slots`, each decorator. Astro contexts that flow from a parent to its children
  during one render (List → ListItem, TabList → Tab, DropdownMenu → its rows, providers, Layout
  regions …) only work when parent and children are in **one `.astro` file**. That is why
  compositions live in story wrappers.
- `Astro.locals` are set for every render by `lib/containerLocals.mjs`, as the docs middleware
  does: `astryxTheme: 'neutral'` (icon artwork) and `astryxLocale: 'en'`.

## 2. Workflow for one component

1. Read the component: its `.astro` header JSDoc (behaviour, events, element API), `export
   interface Props`, its `<Name>.demo.astro`, and `tools/tests/<name>.test.mjs` (proven
   selectors and interaction steps).
2. Open `stories/<Name>/<Name>.stories.ts`. It exists already (scaffolded, Overview only). If it
   does not, run `pnpm -F storybook stories`.
3. Add variant stories (section 5), wrappers where needed (sections 6–7) and `play` tests for
   interactive behaviour (section 8).
4. Run the checklist (section 16).

Do not edit anything in `packages/astryx-astro` to make a story work. If a component truly
cannot be shown, write down why in your report.

## 3. Files, title, meta

```
apps/storybook/stories/<Name>/
  <Name>.stories.ts          one story file per manifest component (<Name> = manifest `name`)
  <Name><Thing>.astro        story wrappers, if any (e.g. DialogStory.astro, TableDataHeavy.astro)
```

- `<Name>` is the manifest name (`DropdownMenu`, `ChatToolCalls`). Folders named otherwise fail
  the check. Sub-components (DropdownMenuItem, Heading, LayoutPanel …) have no file of their
  own: they appear in their parent's stories, through wrappers.
- `title` is `'<category>/<displayName>'` from the manifest, as in
  `stories/_lib/catalog.generated.ts` (`catalog.<Name>.title`), e.g. `'Action/Dropdown Menu'`,
  `'Feedback & Status/Spinner'`. It must be a string literal (Storybook reads it statically).
- `component` is the component's `.astro`, imported by package path
  (`astryx-astro/components/<Dir>/<Name>.astro`; `catalog.<Name>.component` has the path). Two
  manifest entries document another file: Chat → `Chat/ChatLayout.astro`, Resizable →
  `Resizable/ResizeHandle.astro`.
- The meta spreads `...astryx('<Name>')` (the manifest description for the docs page) and ends
  with `satisfies Meta`. `args` on the meta hold the required props with realistic values; every
  story starts from them.

```ts
const meta = {
  title: 'Action/Button',
  component: Button,
  ...astryx('Button'),
  args: {label: 'Save'},
} satisfies Meta;
export default meta;
```

Never edit `stories/_lib/catalog.generated.ts` or
`.storybook/script-registry/ScriptRegistry.generated.astro`; `pnpm -F storybook stories`
regenerates them (the registry must list every story wrapper: rerun it after adding one).

## 4. The Overview story

The first export of every file, unchanged from the scaffold:

```ts
import Demo from 'astryx-astro/components/Button/Button.demo.astro';
import demoSource from 'astryx-astro/components/Button/Button.demo.astro?raw';

/** Every example from the docs page (Button.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);
```

It renders the component's whole docs demo (the same examples as the docs site), shows the
demo's source in the Code panel and hides Controls. It is the docs page's first story. Do not
add a `play` to it: the demo is covered by `tools/tests`; focused stories carry the tests.

## 5. Variant stories

One story per meaningful prop combination, pre-rendered.

- **Meaningful** = a different look or behaviour a user of the component would choose: each
  `variant`, each non-default `size`, each state (`isDisabled`, `isLoading`, `isInvalid`,
  `status`), each layout or placement option, each optional part (icon, description,
  `endContent`, clear button), each slot. The manifest's theme hooks
  (`catalog`/`meta/astryx-docs.json` `theming.visualProps`) list the visual props: each value of
  each of them should appear in some story (or in a matrix wrapper, below).
- **Not meaningful**: every `id`, `class`, `style`, ARIA pass-through; the default value on its
  own (the meta args already show it); permutations that look the same.
- **A matrix** (all variants × sizes × states on one canvas) is a good extra story for visual
  components: a wrapper like `stories/Button/ButtonMatrix.astro`, exported as `Matrix`.
- **Names** (export name → sidebar name): PascalCase, describing the combination, not the
  implementation.
  - a value of the main visual prop: the value (`Primary`, `Ghost`, `Destructive`, `Compact`);
  - sizes: `Small`, `Large` (`SmallSize` when `Small` would be ambiguous);
  - states: `Disabled`, `Loading`, `Required`, `ReadOnly`, `ErrorStatus`, `Empty`, `Open`;
  - other enum props: prop + value (`PlacementAbove`, `AlignEnd`, `GridDividers`);
  - optional parts: `With<Part>` (`WithIcon`, `WithTooltip`, `WithClear`);
  - slots: `<SlotName>Slot` or what the content is (`IconSlot`, `CustomContent`);
  - compositions: what they show (`CompoundRows`, `DataHeavy`, `AllSlots`);
  - the interaction-tested baseline: `Default` (args = the meta args plus what the test needs).
- Give a story a one-line JSDoc when its name does not say everything (it becomes the story's
  description on the docs page).
- Values are fixed and realistic: real-looking labels, no lorem ipsum, no `Date.now()`,
  `Temporal.Now`, `Math.random()` (a pre-rendered "today" is the build day).
- `parameters.layout`: `'padded'` by default; `'centered'` for small triggers whose layer opens
  on any side (placement stories).

## 6. Args, slots and wrappers: which one

| What the story needs | Use |
|---|---|
| Plain props: strings, numbers, booleans, plain objects and arrays (no functions, no class instances) | `args` |
| Text or HTML in a slot | `args.slots` string: `{slots: {default: '…', footer: '…'}}` |
| One leaf component (Icon, Badge, Avatar, Kbd, Spinner, StatusDot) in a named slot | `args.slots` configured component: `{slots: {icon: {component: Icon, props: {icon: 'upload'}}}}` |
| The component in a sized box (truncation, overflow, wrapping, scrolling) | `decorators: [frame({width: 280})]` |
| Sub-components or any other component composed with it; a trigger plus its overlay; functions (formatters, `renderCell`, plugins, `dateConstraints`); Temporal or `Date` values; a locale provider; several instances side by side | a story wrapper with `composed()` (section 7) |

- `args.slots.default` is the default slot; other keys are named slots. Slot strings are raw HTML
  (sanitizing is off: buttons, inputs and `data-*` attributes survive) and are not compiled: an
  Astro component tag in a string (`'<Badge …/>'`) renders as an unknown element.
- A configured component in a slot is rendered on its own, then inserted. Attribute-based
  cascades still apply (Button stamps its icon size onto a slotted Icon), but nothing the parent
  provides through `Astro.locals` reaches it. When in doubt, use a wrapper.
- Args travel to the server as JSON in dev: anything that does not survive `JSON.stringify` (a
  function, a Temporal object, a `Map`) silently becomes something else there. Use a wrapper.
- `args.slots` objects merge between meta and story: a slot the meta sets reaches every story.
  Keep `slots` off the meta when stories use a prop of the same name (HoverCard's `content`).
- A story arg set to `undefined` does not reliably remove a meta arg: give the value explicitly.

## 7. Story wrappers

A wrapper is a small `.astro` file in the component's story folder that renders the composition
in one Astro render. Template: `templates/ComponentStory.astro.template`; examples:
`stories/Dialog/DialogStory.astro`, `stories/Table/TableDataHeavy.astro`,
`stories/DateInput/DateInputTemporal.astro`, `stories/Layout/LayoutStory.astro`.

- Name: `<Name><Thing>.astro` (`DialogStory`, `DropdownMenuCompound`, `CalendarTemporalRange`).
- A header JSDoc says what it composes and why it needs a wrapper.
- Import components by package path (`astryx-astro/components/...`), Temporal from
  `astryx-astro/lib/temporal`, types from `astryx-astro/lib/types`.
- `interface Props`: optional props the stories vary, named after the meta component's props they
  are forwarded to (JSDoc `Forwarded to <Name>.`); story-only knobs are allowed (`panels` in
  LayoutStory) and documented.
- In the story file:

  ```ts
  import DialogStory from './DialogStory.astro';
  import dialogSource from './DialogStory.astro?raw';

  const options = {controls: ['isOpen', 'variant', 'purpose', 'width'], source: dialogSource};
  export const Modal = composed(DialogStory, {play: async (…) => {…}}, options);
  export const Required = composed(DialogStory, {args: {purpose: 'required'}}, options);
  ```

  `composed(Wrapper, story, {controls, source})` passes the story's args **named in `controls`**
  (and only those) to the wrapper as props, keeps those Controls in dev (all others are hidden),
  and shows `source` in the Code panel. Without `controls` the wrapper gets no props and the story
  no Controls.
- `composed()` also forwards the **meta's** args named in `controls`: a wrapper prop named like a
  meta arg receives the meta's value unless the story sets its own. Set such args in every
  wrapper story (`label`), and don't name a story-only knob like a meta arg.
- A conditional child in a named slot still counts as content: with
  `{cond && <X slot="end" />}`, `Astro.slots.has('end')` is true even when `cond` is false, so the
  component renders an empty region. Branch whole elements in the wrapper instead.
- A component that appears only inside a `<template>` (for a play to insert later) has its
  `<script>` there too: Astro writes it after the first instance, and template content never
  runs. Render one hidden instance before the template (`<div hidden><Spinner … /></div>`).
- Ids: `uid()` restarts with every render, so generated ids repeat between stories on one docs
  page. Give ids that must be unique on the page with `layerId()`, or render the story in its
  own frame (`docs.story.inline: false`).
- A wrapper `<script>` runs again every time a story using it renders (switching stories, the
  test runner). Wire document-level listeners once, behind a guard:
  `if (!document[Symbol.for('astryx-storybook:<name>')]) { … }`. Use a wrapper script only where
  a control would otherwise look interactive and do nothing (a Toast button, an async source).
- Deterministic data only: generate large data sets with a fixed seed (TableDataHeavy).
- Give layers that tests need stable hooks only through public props (`id`, `data-testid`
  where the component supports it); otherwise query by role.
- After adding a wrapper run `pnpm -F storybook stories` (the static build bundles component
  scripts through the generated script registry, which lists every wrapper).

## 8. Interaction tests (`play`)

Every interactive component (anything with a custom element, a behaviour script or native
interactive behaviour worth guarding) gets `play` tests for its main interactions: keyboard,
pointer, focus movement and return, the `astryx-*` events it dispatches, and the ARIA state that
changes. `play` runs in three places and must pass in all of them: `storybook dev`, the static
build (on page load) and `pnpm -F storybook test`.

```ts
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';

export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');                    // the element's script has run
    const selected = recordEvents(canvasElement, 'astryx-select');
    const trigger = canvas.getByRole('button', {name: 'Actions'});
    await step('Enter opens the menu on the first row', async () => {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(canvasElement.querySelector('[popover]'))).toBe(true));
    });
    …
  },
};
```

- The story counts as rendered once its component scripts have loaded (preview.browser.ts waits
  for them), but behaviour can start later: wait for what you need first. `upgraded(root,
  'ax-…')` for a custom element; `waitFor(() => expect(el).toHaveAttribute(…))` for a behaviour
  that sets an attribute when it attaches (Text's truncation tooltip sets `data-ax-tooltip` once a
  ResizeObserver fires).
- Query by role and accessible name (`canvas.getByRole('button', {name: 'Save'})`); fall back to
  the component's `data-*` hooks or `ax-*` tags. Layers are in the story DOM (no portals), so
  `canvasElement.querySelector('[popover]')` finds them.
- Events: `recordEvents(canvasElement, 'astryx-change')` before acting, then assert
  `event.detail`. Payloads are Astryx's (ISO strings for dates).
- Use `step('what the user does', …)` for multi-part tests; name steps as behaviour.
- `userEvent` (storybook/test) dispatches synthetic events. What that means:
  - `userEvent.tab()` moves focus with its own algorithm: check *containment* (a modal: focus an
    element outside and assert it did not take focus; Tab from the last control and assert focus
    is still inside) rather than an exact Tab order across inert content.
  - Escape closes the **topmost** layer only. A focused button with a tooltip has the tooltip on
    top: the first Escape closes the tooltip (correct behaviour). Move focus somewhere without a
    tooltip, or wait for the tooltip to close, before testing Escape on a dialog or menu.
- No fixed sleeps except to prove that something does *not* happen (then 300–400 ms).
- Assertions describe behaviour a user or assistive technology sees; don't assert class names or
  inline styles.
- Never leave a story in a state another story depends on; each story renders fresh.
- Every story after the first in a preview is **inserted into a live page** whose elements are
  already defined (switching stories, the test runner). That is real coverage of markup a client
  router or `innerHTML` inserts: if a component only works on the first story, it is a component
  bug (late-insert.test.mjs guards the known ones). Don't re-attach or re-create elements to make
  a play pass.
- Wait for what a step's keys act on: after opening a list, wait for `aria-expanded="true"` (or
  the layer showing) before arrowing through it; an editor that moves focus a frame after it
  opens gets `waitFor(() => expect(field).toHaveFocus())` before Escape or Enter.
- `userEvent` details:
  - Direct calls share no pointer state (`hover` then `pointer` sends no `mouseleave`): use
    `const user = userEvent.setup()` for multi-step pointer sequences and drags.
  - `userEvent.click` refuses an element with `pointer-events: none` (disabled rows): prove
    nothing happens with `el.click()` or focus + Space.
  - It cannot trigger CSS `:hover`, the native light dismiss of `popover="auto"`, or native
    keyboard scrolling. Leave those steps to `tools/tests` and say so in a comment.
- Timing and geometry: measure inside `waitFor` (entry motion scales and fades layers, so
  `toBeVisible` and rects change for a moment). The test viewport is small and layers flip:
  placement plays accept the requested side or, when it does not fit, the opposite one.
- Live regions clear about 2 s after an announcement: assert soon after the action, and assert a
  re-announcement after repeating it. Button carries a hidden `role="status"` region, so
  `getByRole('status')` may match two elements; query the component instead.
- Plays run on page load in the published Storybook, as the viewer's own session: stub
  `navigator.clipboard.writeText` (restore it in `finally`) rather than overwrite their clipboard.
- Toast auto-hide pauses while the document has no focus, which is always true in the test
  frame: `window.focus()`, or dispatch a window `focus` event, before testing it.
- Storybook inserts every story after load, so "silent at page load" behaviour (a Spinner
  present on load is not announced) cannot be asserted; `tools/tests` covers it. The reverse
  needs care in the static build, whose plays run while the page may still be loading: a play
  about content inserted *after* load starts with `await pageLoaded()` (`_lib/play.ts`).
- A description may include a value tooltip's text: match it with `expect.stringContaining`.
- Links: the preview logs navigations instead of following them in every story root, the test
  runner's included, so plays click links freely (no local guard).

## 9. Overlays, popovers, modals

astryx-astro has no portals: popovers, menus, tooltips, dialogs and sheets render next to their
trigger and are promoted to the top layer natively (`popover`, `<dialog>.showModal()`).

- A story that only shows a trigger needs nothing special. Open it in `play` and check
  `isShowing(layer)`, focus placement, Escape / outside press closing it, and focus returning to
  the trigger.
- A story rendered **open** (`isOpen`, `isMenuOpen`, `isDefaultOpen`, a dialog `isOpen`) puts a
  layer in the top layer as soon as it renders. On the docs page that layer would float over the
  page (a modal would block it), so render the story in its own frame:

  ```ts
  parameters: {docs: {story: {inline: false, height: '360px'}}},
  ```

- Modals: open them from a trigger (attachDialog in a wrapper, as DialogStory does) in a `play`
  test; assert `dialog.matches(':modal')`, the accessible name, that focus moved inside, that an
  element outside cannot take focus, that Escape closes (unless `purpose="required"`) and focus
  returns to the trigger.
- Placement and alignment stories: `parameters: {layout: 'centered'}` so the layer has room on
  every side.
- `isInline` / preview modes that draw a layer in flow are plain args stories.

## 10. Dates and Temporal

- Fixed dates only, in every story and wrapper. A pre-rendered "today" is the build day, so set
  `value`, `defaultValue` or `focusDate` on every date component (Calendar shows today's month
  when none is set).
- ISO strings (`'2026-11-08'`, `{start, end}`) are plain args. **Temporal values are not**: build
  them in a wrapper's frontmatter from `astryx-astro/lib/temporal`
  (`Temporal.PlainDate.from('2026-11-08')`), as `DateInputTemporal.astro` and
  `CalendarTemporalRange.astro` do. On the server that is the polyfill; in the browser the
  component uses native Temporal where it exists. Never import `lib/temporal` in a `.stories.ts`
  file.
- `Date` values, `dateConstraints` and `format` functions: wrapper.
- Non-Gregorian calendars are args: `{calendar: 'persian', locale: 'fa-IR', value: '2026-03-21'}`
  (add `dir: 'rtl'` for Hebrew and Arabic). Values and events stay Gregorian ISO. Avoid asserting
  Chinese or Dangi month boundaries: native Temporal and the polyfill differ by a day in some
  months (repository README).
- Date components' scripts wait for Temporal (top-level await in lib/temporal.ts): use
  `upgraded()` before interacting. `pnpm -F storybook verify` runs every story of a date
  component a second time with `Temporal` deleted, so the polyfill chunk must load too.

## 11. Server-only props, locals, locale

- Props that are functions, Astro components, class instances (`Date`, Temporal, `URL`), or
  results of server helpers (Table plugins, `attachDialog()`, `attachTooltip()`) belong in a
  wrapper's frontmatter.
- Locals: every render gets `astryxTheme: 'neutral'` and `astryxLocale: 'en'`
  (`lib/containerLocals.mjs`). Don't set locals anywhere else.
- Another language: the component's `locale` prop as an arg (`{locale: 'de-DE'}`) where it has
  one; otherwise a wrapper with `<InternationalizationProvider locale="…">` around the component
  (one render, so the provider reaches it).
- Router links (`as`, LinkProvider): a wrapper. Link clicks in stories never navigate; the Actions
  panel logs them (`navigate`).

## 12. Theme and mode

- Never set `data-astryx-theme` / `data-theme` or import theme CSS in a story or wrapper. The
  toolbar applies them on the preview `<html>` the way `themeRootAttributes()` does, in dev and in
  the static build.
- To pin one story to a mode or theme (a dark-only screenshot, say), use story globals:
  `globals: {astryxMode: 'dark'}` or `globals: {astryxTheme: 'gothic'}`.
- Icons are server-rendered from `astryxTheme: 'neutral'`. All seven shipped themes map the same
  Lucide set (no indicator overrides either), so the browser-side theme switch is exact. If a
  theme ever ships its own icons, its stories must be pre-rendered per theme instead (a wrapper
  with `<Theme name="…">`).

## 13. Accessibility

- addon-a11y runs axe on every story in `pnpm -F storybook test` and in the Accessibility panel.
  `parameters.a11y.test` is `'error'`: a violation fails the story's test.
  `pnpm -F storybook a11y` prints the summary of the last test run.
- A violation is fixed where it comes from:
  - **Story content** (a missing label, two instances in a wrapper with the same landmark name,
    a scroller you made focusable or not): fix the story.
  - **A component** whose markup is invalid or keeps information from assistive tech: fix the
    component as a documented deviation from Astryx (`packages/astryx-astro/docs/accessibility.md`,
    and the component's header comment), with a `tools/tests` check.
- A finding is **kept** only for what docs/accessibility.md lists as kept: Astryx's colours (theme
  palettes, syntax themes, `color="disabled"` options), dimmed text in a control that already
  carries `aria-disabled` (WCAG 1.4.3 exempts it), naming patterns axe misreads (tree items,
  avatar initials, Stepper), and docs demos that show several page-level landmarks. Record it on
  the stories it affects with `knownA11y({rule: reason})` from `_lib/story.ts`, on the story, in
  the Overview's third argument, or file-wide through `astryx(name, knownA11y(…))`; add it to
  docs/accessibility.md if it is a new kind. Never use it for something a component or story
  could fix, and never turn a rule off in the preview.
- Baseline (1307 stories, neutral theme, light): no violations; the kept findings are listed in
  docs/accessibility.md.

## 14. Docs page

Generated for every component (`tags: ['autodocs']` in preview.ts) by `.storybook/DocsPage.ts`:
title, the manifest description, the Overview story, the props table (from the component's
`interface Props` and its JSDoc; slots listed), every other story with its JSDoc, and the
component's header JSDoc ("Component notes": events, element API, port notes).

- Don't restate prop descriptions, types or defaults in `argTypes`: fix the component's JSDoc
  instead (that is out of scope here: report it). Use `argTypes` only to change presentation, for
  example `{control: 'select', options: [...]}` for a prop typed as `string`.
- Story JSDoc (`/** … */` above the export) is the story's description: one or two sentences.

## 15. Don'ts

- No `component` on a story, no `render` function, no `loaders` that fetch.
- No `Date.now()`, `Temporal.Now`, `Math.random()`, network URLs or external images (use inline
  SVG or data from the demos).
- No `document` / `window` access at a story module's top level (the static build loads story
  files on the server).
- No CSS files or `<style>` in wrappers beyond small inline layout styles; no theme CSS.
- No edits to `packages/astryx-astro`, `apps/docs`, generated files, `.storybook/*` or
  `stories/_lib/*` while writing stories. Need a new shared helper? Describe it in your report.
- No `localStorage`, no timers left running, no global listeners in `play`.

## 16. Checklist before finishing

Run from the repository root:

1. `pnpm -F storybook stories` (registry and catalog current; never hand-edit them).
2. `pnpm -F storybook check`: titles, imports, Overview first, no story `component`, no Temporal
   in story files, and `tsc` over `.storybook/` and `stories/`.
3. `pnpm -F storybook test stories/<Name>/`: every story of the component passes (the path
   argument limits the run to that folder).
4. `pnpm -F storybook test` passes, axe included: no violation, and any kept finding recorded with `knownA11y()` (section 13).
5. `pnpm -F storybook build && pnpm -F storybook verify <story-id-prefix>` (e.g.
   `verify action-button`): renders, play passes, custom elements upgrade, no page error or failed
   request under `/astryx-astro/storybook/`; date components also pass on the Temporal polyfill.
6. `pnpm -F storybook dev`, open the component: each story looks right in two themes and both
   modes; the docs page reads well; open-on-load stories use `docs.story.inline: false`.
7. Every value of every theme-hook prop (`theming.visualProps`) appears in some story or matrix;
   every interactive behaviour in the component's JSDoc has a `play` step.

## 17. Commands

| Command (from the repo root) | What |
|---|---|
| `pnpm storybook` or `pnpm -F storybook dev` | dev server on :6006, live Controls |
| `pnpm -F storybook build` | static build into `apps/storybook/storybook-static/` (+ `scripts/postbuild.mjs`) |
| `pnpm -F storybook serve` | serve the build at http://localhost:6007/astryx-astro/storybook/ |
| `pnpm -F storybook verify [id-prefix …]` | check the build in Chrome under the sub-path (`CHROME_PATH` or `--browser=`) |
| `pnpm -F storybook test [path …]` | every story as a Vitest browser test (play + axe), Chrome at `CHROME_PATH` (default `/usr/bin/google-chrome`) |
| `pnpm -F storybook a11y` | axe summary of the last test run |
| `pnpm -F storybook stories` | regenerate the catalog and script registry, scaffold missing story files |
| `pnpm -F storybook check` | conventions check + type check |

## 18. Framework notes (why some plumbing exists)

- `lib/containerLocals.mjs`: the Container API takes `locals` per render but the framework never
  passes them; this Vite plugin (loaded through `astro.config.mjs`) gives every render the docs
  middleware's locals.
- `.storybook/script-registry/`: the static build bundles a component `<script>` only when it
  can reach the component through relative `.astro` imports from a story's `meta.component`; demos
  and wrappers are never reached that way. The generated registry imports every `.astro` file and
  is the component of a hidden story that only `storybook build` loads.
- `.storybook/preview.browser.ts`: the renderer re-inserts a story's scripts as async module
  scripts; they are made ordered again (as on an Astro page) and the story waits for them before
  `play` and axe run. `astryx-*` events are logged to the Actions panel; link and form
  navigations are logged instead of leaving the preview.
  `renderToCanvas` marks the element it renders into as a story root, which covers the Vitest
  runner's canvas; its page has `<base target="_parent">`, so a `#id` link that would leave the
  frame is logged too.
- Memory: Chrome renderers, Vitest and a dev server together need a few GB. On a small machine
  run a few folders at a time; "Browser connection was closed" or "Target crashed" before any
  test ran is the machine, not the story.
- `scripts/postbuild.mjs`: the framework inlines every stylesheet a story's components import
  into each pre-rendered story (shared CSS repeats per story). The post-build step writes each
  stylesheet once to `_astro/story-css/` and leaves an `@import` in the story, which keeps the
  renderer's de-duplication and ordering intact; it also makes asset URLs relative.
- Astro's dev source annotations (`data-astro-source-file`, absolute paths) are turned off for
  the pre-render by an integration in `astro.config.mjs`.
