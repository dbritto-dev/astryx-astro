# Cross-batch contracts

Contracts established by finished ports that later ports must use. Append when a batch
introduces a provider/consumer key, slot convention or runtime API.

## Cascade keys (`lib/cascade.ts`)

| Key | Consumer opts in | Provider stamps | Established by |
|---|---|---|---|
| `icon-size` | Icon without explicit `size` (renders `data-size="md"`) | owner sets `data-size` (Button: sm for sm/md, md for lg) | Icon |
| `form-direction`, `form-optionality`, `form-required` | Field-composed inputs | FormLayout (see header of `FormLayout.astro`) | FormLayout |
| Layout region settings | LayoutHeader/Content/Panel/Footer | Layout | Layout |
| `size`, `button-icon-size` | Button (inherited size), its default-sized slot Icons; ButtonGroup root without `size` | ButtonGroup (explicit size), Toolbar — `buttonSizeStampers()` | Button |
| `button-group` | every Button root | ButtonGroup (`groupMemberStamper`) | ButtonGroup |

## Icons

- `Icon` props: `icon` (name, namespaced key, SVG string, Astro component, or `<svg>` in the
  default slot), `size`, `color` (default inherit), `variant`, `label`, `theme`.
- Precedence follows Astryx `selectIconEntry`: active theme set → `registerIcons()` →
  defaults. Override a theme's icons with `registerIconTheme()`.
- Active theme server-side: `theme` prop → `Astro.locals.astryxTheme` → defaults.
- Component slot icons: `resolveComponentIcon(slot, state, fallback, Astro)` from
  `components/Icon/iconRegistry.ts`.
- RTL mirroring happens at the call site: add `class="ax-mirror-rtl"` where Astryx mirrors.

## Slots and events conventions seen so far

- Render-prop / renderer props become named slots (OverflowList `overflow` slot with a
  `[data-overflow-count]` element).
- Callbacks become bubbling `astryx-<event>` CustomEvents (`astryx-size-change`,
  `astryx-collapse-change`, `astryx-overflow-change`).
- `ref`-style props that point at other elements become CSS selectors (Resizable
  `containerRef` → selector).
- Resizable: ResizeHandle owns the region; pass the same `resizable` options object to the
  handle and to LayoutPanel so SSR renders the right size.

## Shared classes

- `.ax-layout-root-reset` (Layout.css) — for AppShell's root.

## Client runtime (`src/elements/runtime/`, see its README.md)

- `modality.ts` (`<html data-astryx-modality>`, `focusForLastInput`, `returnFocusForLastInput`),
  `announce.ts` (`announce(text, {politeness, from})` → withdraw fn; routes into open
  `dialog:modal`; `announceText`, `createAnnouncer`), `layerStack.ts`
  (`registerLayer({element, escape, outsidePress, isInside, isPresent, dismiss})`),
  `anchor.ts` (`anchorLayer` before show, `settleLayer` after, `releaseLayer` after exit),
  `layer.ts` (`LayerElement` base class, `<ax-layer>`, `show/hide/open/close/toggle`,
  `astryx-open-change`), `tooltip.ts` (`<ax-tooltip>`, `<ax-hover-card>`), `popover.ts`
  (`<ax-popover>`), `roving.ts` (`data-astryx-roving*`, manages tabindex, click moves the
  stop; nested lists sync inner first and every enclosing list re-syncs; `onRovingKeyDown`),
  `keyboardHint.ts` (useKeyboardHint), `typeahead.ts`, `disabledInteraction.ts`.
- Build new layered widgets (menus, comboboxes, dialogs, sheets) on `LayerElement` +
  `registerLayer`; never add another document Escape/outside listener.

## Attaching a tooltip / hover card / popover to a trigger you render

```astro
---
import Tooltip from '../Tooltip/Tooltip.astro';
import {attachTooltip} from '../Tooltip/attach';
const tip = tooltip ? attachTooltip({describedBy: rest['aria-describedby']}) : null;
---
<button {...rest} {...tip?.trigger}>…</button>
{tip && <Tooltip {...tip.layer} content={tooltip} />}
```
A disabled control that shows a tooltip uses `aria-disabled`, not `disabled`.
`attachHoverCard` / `attachPopover` (Popover/attach.ts) work the same way.

## Stand-ins to replace when their owner lands

None open: Popover's fallback close is a real secondary `<Button>` (size md, the layer's reset
SizeContext), closing through `popovertarget` + `popovertargetaction="hide"`.

## Button family

- Button renders its effective `data-size`; opts into `size` when not explicit. Its icon slot is
  stamped `icon-size` (sm for sm/md, md for lg); while Button's own size is inherited the icons
  stay marked `button-icon-size`. Providers (ButtonGroup, Toolbar, SizeContext …) must stamp
  with `buttonSizeStampers(size)` from `Button/buttonCascade.ts` (both keys in one parse).
- ToggleButton uses its own keys (`toggle-group`, `toggle-group-size`, `toggle-group-icon-size`)
  that only ToggleButtonGroup stamps — ButtonGroup/Toolbar sizes don't reach it (as in Astryx).
- Custom link component: request-wide `Astro.locals.astryxLinkComponent`; `as` overrides it.
- Events: Token `astryx-remove` {event}; ToggleButton `astryx-pressed-change` {isPressed, event};
  ToggleButtonGroup `astryx-change` {value}.
- Group-disabled (ButtonGroup): members get native `disabled` + `data-ax-disabled`
  (`aria-disabled` when they are tooltip triggers); link members become `<button>`; members
  show `data-elevation="none"` and lose the press-scale effect.
- `clickAction` / `pressedChangeAction` (server functions) are not available in Astro.
- Every Button root enrols in cascade key `button-group` (`BUTTON_GROUP_KEY`), so its
  `data-ax-inherit` is `button-group` (plus `size` while inherited). Only ButtonGroup stamps it:
  `data-ax-group="horizontal|vertical"` → member geometry in Button.css (outer-only radius,
  dividers, on-accent divider for primary/destructive, trailing cap
  `:nth-last-child(1 of :not([popover]):not(template):not(dialog):not(script))` — `script`
  added because Astro renders a component's `<script>` in place), no press scale,
  `data-elevation="none"`, and the group-disabled state above.
- Button `tooltip` renders the Tooltip layer as the button's next sibling (`data-ax-tooltip` =
  layer id; aria-describedby composed unless the tooltip repeats the name). Link, StatusDot,
  Avatar (custom string describes, name tooltip does not), Thumbnail (label) and ProgressBar
  marks (`focusTrigger="always"`) use the same attachment.
- Group providers (ButtonGroup, Toolbar) stamp with `stampOutsideLayers()`
  (`ButtonGroup/groupCascade.ts`): `stamp()` that never enters `[data-astryx-layer-root]`, so
  a Button a layer renders itself (Popover's close) is not stamped; node appliers may rename
  the tag. `fromAttrStampers(buttonSizeStampers(size))` adapts the size stampers.
- ButtonGroup without `size` enrols its own root in `size` and leaves members' size markers to
  the nearest outer provider (Astryx `useSize(sizeProp, 'md')`). Toolbar always stamps its size
  (default md). Both use the runtime roving: ButtonGroup items `button, a[href], [tabindex]`
  bounded by `[role="group"], [popover]`; Toolbar items `button, input, a[href], [tabindex]`
  bounded by `[role="toolbar"], [popover]` with the caret guard.
- Toolbar slots: `startContent`, `centerContent`, `endContent`; container-side edge compensation
  on the start/end slots. Keyboard hint: `elements/runtime/keyboardHint.ts`
  (`data-ax-keyboard-hint="<ax-layer id>"` on any roving container; `behaviors/keyboardHint.ts`
  is gone).
- Toolbar > ButtonGroup (useListFocus nesting): the group's members are Toolbar items too; the
  composite keeps one Tab stop, on load the group's first member; ←/→/Home/End inside a
  horizontal group stay in the group (wrapping), keys it ignores move through the Toolbar.

## Indicators (form controls build on these)

- `<Indicator name="checkbox|radio|check" state size="sm|md" isDisabled>`; busy content (Spinner)
  in the default slot. Resolves the active theme's replacement (`theme` prop →
  `Astro.locals.astryxTheme`) then the default; themes swap with
  `registerIndicatorTheme(theme, {check: RadioIndicator})`.
- Owner hooks (Indicator.css): `ax-indicator-scope` on the row (enabled only) for hover tint;
  `ax-indicator-ring-host` on the element holding the input + `ax-indicator-ring` around the
  indicator paints the focus ring on the indicator.
- Theme attrs: `data-size`, `data-checked` (`checked`/`indeterminate`), `data-disabled`.

## Content batch (stand-ins replaced)

- `behaviors/liveAnnounce.ts` → runtime `announce.ts`.
- Tooltips on Avatar, Thumbnail labels, ProgressBar marks → tooltip attachment contract.
- AvatarGroup renders `data-astryx-roving="horizontal"` (items `[data-avatar-item]`) → wire runtime roving.
- Thumbnail remove button native stand-in → IconButton.
- Inline handler-string `onClick`/`onRemove` props on Avatar/Thumbnail → events per AGENTS.md.

## Collapsible

- Keys: `collapsible-group` (item root with `data-value`; nearest group writes open state onto
  the item's trigger + content), `collapsible-density` (root, trigger, content),
  `collapsible-divided` (root), `collapsible-chevron-position` (trigger, only when the item
  sets none). Each Collapsible resets the presentation keys around its own content.
- Events: `astryx-open-change` {isOpen} (standalone items), `astryx-change` {value} (group); user
  input only. Closed content uses `hidden="until-found"` (find-in-page opens it).

## Shared libraries (`src/lib/`, each folder has a README)

- `uid(Astro, prefix)` (`lib/uid.ts`) — per-request id counter, the useId stand-in. Use it for
  every generated id.
- `lib/date/` — PlainDate, calendar systems, date/time parsing + formatting, Unicode digits,
  `formatInstant`, `formatRelativeTime`, `formatTooltipLines`, Timestamp helpers.
- `lib/codeblock/` — tokenizer, grammars (incl. 9 opt-in languages), `highlightRanges`, token
  mapping (`TOKEN_TYPES`, `highlightName`, `tokenClassName`, `SYNTAX_TOKEN_DEFAULTS`,
  `highlightRuleCss()`). The CodeBlock porter writes the `::highlight(astryx-*)` and
  `.astryx-token-*` rules in `astryx-base`.
- `lib/markdown/` — parser, AST, URL policy, heading projection, streaming, plugins, remark
  adapter, `parseOutlineFromMarkdown`. Its README lists what the renderer must provide.
- `lib/characters.ts`, `lib/accessibleName.ts`, `lib/groupItems.ts`, `lib/devWarning.ts`,
  `lib/searchableItem.ts`.
- Lib tests run as plain node scripts; `tools/tests/lib-loader.mjs` resolves extensionless TS imports.

## Subtree-scoped `Astro.locals` (`lib/subtreeLocals.ts`) — Theme, i18n, LinkProvider

Request-wide contexts are plain `Astro.locals` keys. A provider renders its slot with
`renderWithLocals(Astro, {key: value}, () => Astro.slots.render('default'))`: everything
inside reads the provider's value, siblings keep the request value (AsyncLocalStorage; Astro
renders sibling expressions concurrently, so set-and-restore around an await leaks — verified).
Middleware may still assign the keys (`ctx.locals.astryxTheme = 'neutral'`).

| Key | Provider | Consumers |
|---|---|---|
| `astryxTheme`, `astryxThemeMode` | `<Theme>` (theme/) | Icon, `resolveComponentIcon` |
| `astryxLocale`, `astryxDirection`, `astryxCalendar`, `astryxMessages`, `astryxOverrides` | `<InternationalizationProvider>` (i18n/) | `translator(Astro)` (locale, then overrides → messages → shipped → English) |
| `astryxLinkComponent` | `<LinkProvider>` (LinkProvider/) | Link, Button `href`, Token … — `resolveLinkComponent(Astro, as)` + `linkDestination(href, to)` in `LinkProvider/linkComponent.ts` |

Root theme: spread `themeRootAttributes(name, mode)` (theme/themeRoot.ts) on `<html>` and set
`astryxTheme` in middleware; a `<Theme>` with neither above it syncs `<html>` with an inline script.

## SegmentedControl

- Cascade key `segmented-control` (items opt in; the control stamps value/size/disabled/reason).
  Items also keep `size` when the control's own size is not explicit, so a size provider above
  the control (ButtonGroup/Toolbar, cascade key `size`) sizes the root and its segments.
- Keyboard hint (useKeyboardHint): `<Layer class="ax-keyboard-hint" placement="below"
  alignment="start" offset="var(--spacing-2)" data-ax-keyboard-hint>` inside the composite,
  driven by the element through the runtime (`createKeyboardHint(this, {layer, isEnabled})` in
  `elements/runtime/keyboardHint.ts`). TabList: use the same module (attribute or imperative).
- The element places its own stop (`data-astryx-roving-tabindex="false"`) and then calls
  `syncRovingTabStops(this)`, so a Toolbar that sweeps the segments into its items keeps one stop.

## Syntax tokens

`src/styles/syntax.css` (generated: `node scripts/build-syntax.mjs`) holds the `:root`
`--color-syntax-*` defaults and the 12 presets as `[data-astryx-syntax-theme="<name>"]`.
CodeBlock should import it and read the tokens; `<SyntaxTheme theme="dracula">` switches them.

- Announcements go through the runtime only (`elements/runtime/announce.ts`); the
  `behaviors/liveAnnounce.ts` stand-in is gone. `behaviors/announceRenderedText.ts`
  (`data-ax-announce-rendered-text`, optional `data-ax-announce-fallback`,
  `data-ax-announce-politeness`) wraps the runtime's `createRenderedTextAnnouncer()`; a
  standalone Spinner uses it (silent at load, spoken when inserted later; aria-hidden or a
  non-progressbar role silences it).
- One disabled-interaction listener: `elements/runtime/disabledInteraction.ts` (the behaviour
  copy is deleted). Controls = native controls, `[tabindex]`, widget roles and
  `[data-ax-disabled-interaction]`; an aria-disabled `role="group"`/toolbar no longer swallows
  its content's clicks.
- Icon and Badge drop Astro's forwarded `slot` prop; `cleanSlotHtml` is gone.
- Callback props → booleans + events (dispatched with `detail: {event}`, bubbling, composed):
  Avatar `isClickable` (button; also on a link avatar) and AvatarGroupOverflow `isClickable` →
  `astryx-click` (`behaviors/clickEvent.ts`, `data-ax-click-event`); Thumbnail `isClickable` →
  `astryx-click`, `isRemovable` → `astryx-remove`, both on the thumbnail root
  (`behaviors/thumbnail.ts`; Remove stops propagation). `onClick` / `onRemove` handler strings
  no longer exist.
- AvatarGroup roves over `[data-avatar-item]` (runtime roving, horizontal, managed tab stop).
- Thumbnail's Remove is `<Button variant="secondary" size="sm" isIconOnly class="ax-thumbnail-remove">`.

## Lead notes (integration pass)

- `stamp()` now never enters `[data-astryx-layer-root]`; appliers get `(attrs, tag, node)`.
  `ButtonGroup/groupCascade.ts` `stampOutsideLayers()` remains for node-level appliers.
- Never generate ids with `Math.random()`; use `uid(Astro, prefix)` so output is deterministic.
- Known runtime bug (open): nested roving containers (a Toolbar containing a ButtonGroup that
  isn't first) produce two Tab stops; outer containers must sync after inner ones and every
  enclosing container must sync on focus.

## Form fields (Field-composed inputs)

- `routeFieldProps(component, props, {groupable?, isReadOnly?, labelIcon?, consumed?})` in
  `Field/fieldProps.ts` (exported from the index): returns `field` (spread on `<Field>`;
  `containerClass/Style`), `control` (`controlClass/Style` for the bordered box), `native`
  (base props for the native control), `id`/`ids`, `describedBy(...)`, `labelledBy`,
  `required`, `statusMessageId`, InputGroup attributes. Also `statusIconPlan()`,
  `textEntryTraitAttributes()`, `joinAriaIDs()`, `fieldId()`. `Field/clientMessages.ts` builds
  server-translated templates for strings elements fill in at runtime.
- Keys: Field root `form-direction`, `field-layout` (FormLayout stamps
  `data-layout="horizontal-labels"`), `input-group`; label `form-optionality`; native control
  `form-required`; control box `size`. Explicit InputGroup `size` stamps via `buttonSizeStampers`.
- Events: `astryx-change` — `{value, event}` (TextInput/TextArea), `{value: number|null}`
  (NumberInput), `{value: File|File[]|null}` (FileInput); `astryx-enter` on TextInput/NumberInput.
- InputGroup follows 0.7.9 code: members keep borders, overlap by one border width and square
  inner corners; the group paints no border.
- Fixed: nested roving containers (a Toolbar containing a ButtonGroup that isn't first) produced
  two Tab stops. Containers now sync inner first and every enclosing container re-syncs on
  focus, keyboard moves and DOM changes (`tools/tests/roving-nested.test.mjs`).
