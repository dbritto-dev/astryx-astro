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

Followers (`lib/cascade.ts` header): content an owner renders in its own layer takes the owner's
stamped value in the same pass — `data-ax-inherit-from="<owner id>"` on the follower (inside the
layer root), optional `data-ax-inherit-map="lg=md"` and `data-ax-inherit-deep`. Astryx's
equivalent is the owner passing `useSize(sizeProp)` down as a prop. Used by Selector /
MultiSelector option rows (and the MultiSelector row checkboxes) while the box's size is inherited.

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
- **Global-singleton rule.** A page can evaluate a client module twice (under `astro dev` Vite
  pre-bundles a consumer's `import {toast} from 'astryx-astro/elements/toast'` beside the
  components' raw `<script>` imports). Every module-level mutable value in `src/elements/**`
  (queues, stacks, registries, "listening" flags, observers, id counters, shared resources)
  lives in `globalSingleton('<name>', create)` from `runtime/global.ts`
  (`globalThis[Symbol.for('astryx-astro/<name>/v1')]`); listener functions a module adds and
  later removes are stored there too. Classes other modules look up with `instanceof` or extend
  across files get `brandClass(Cls, '<name>')` (done: PopoverElement, MenuElement,
  ComboboxLayerElement, ModalHostElement, ToastElement, ToastViewportElement). Only pure caches
  of derived values (a feature test) stay module-local. A new element follows the same rule;
  `tools/tests/runtime-singletons.test.mjs` loads a second copy and checks toast, Escape stack,
  hotkeys and behaviours.

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

- Button keeps a caller's `data-ax-tooltip` when it has no `tooltip` of its own (external
  tooltip): spread `{...tip.trigger}` on `<Button>` and render the `<Tooltip {...tip.layer}>`
  yourself when you drive its text or `isEnabled` (Pagination nav buttons, the CodeBlock /
  Timestamp copy buttons). The caller composes `aria-describedby`; `isDisabled` stays native.
- `<Tooltip anchor="<id>">` (layer `data-ax-anchor` while a trigger carries `data-ax-tooltip`):
  position against another element than the trigger (Astryx `positionRef`). CheckboxInput /
  Switch reasons: the row triggers (hover, any focus inside), the input anchors (above, centred).
  With no trigger in the markup `data-ax-anchor` is still `for`'s wiring (`data-ax-for` names
  the trigger when both are given).

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
  on the start/end slots. Edge items are counted as ButtonGroup counts them
  (`:nth-child(1 of :not([popover]):not(template):not(dialog):not(script))` and the
  `nth-last-child` form): a Button's tooltip layer is its next sibling. Banner's end area too. Keyboard hint: `elements/runtime/keyboardHint.ts`
  (`data-ax-keyboard-hint="<ax-layer id>"` on any roving container; `behaviors/keyboardHint.ts`
  is gone); its `.ax-keyboard-hint*` rules live in `src/styles/shared.css` (one copy for
  Toolbar, SegmentedControl, TabList).
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
  `formatInstant`, `formatRelativeTime`, `formatTooltipLines`, Timestamp helpers; on Temporal
  from `lib/temporal.ts` (see "Dates and Temporal" below).
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
| `astryxLayerProvider` | `<LayerProvider>` | a nested LayerProvider (renders no second toast viewport) |

**Layer-scoped keys** (Astryx `createLayerScopedContext` + `LayerContentBoundary`, contract #23):
a context module registers its key with `layerScopedLocal('astryxList')` (returns the key);
every overlay renders its content slot through `renderLayerContent(Astro, render)`, next to its
`seal()`: the registered keys are reset to their request value for everything inside, other keys
(Theme, locale, link component, calendar) pass through. `renderWithLocals` still skips
`undefined`; the reset is its own frame (also correct without AsyncLocalStorage: the request
value before the outermost override is kept, so `requestLocal()` works there too).
Registered: `astryxList`, `astryxCheckboxList`, `astryxRadioList`, `astryxTabList`,
`astryxStepper` (Stepper/stepperContext.ts, now on lib/subtreeLocals.ts — `readStepperContext`).
Not layer-scoped (as in Astryx): `astryxCommandPalette`, `astryxBottomSheetSwitcher` (BottomSheet
still resets it to null in each sheet), `astryxLayerProvider`. Callers: Tooltip, HoverCard,
InfoTip, Popover, Layer, DropdownMenu rows (`_MenuStamp`, so ContextMenu and BreadcrumbItem's
`menu` too) + header/footer + SubMenu flyouts, Dialog (AlertDialog, CommandPalette slots), Drawer,
BottomSheet, MobileNav (header + content), ComplexSelector, the date pickers (`_PickerLayer`), the
nav menus (`_NavMenuLayer`; TopNavHeading / SideNavHeading `menu`, TopNavMegaMenu `items` /
`featured` outside the drawer, SideNavItem's rail flyout), the empty-state slots of Selector,
MultiSelector, Typeahead and Tokenizer (+ Tokenizer's `endContent` in `unfocusedLayer` mode;
PowerSearch forwards its `endContent` slot instead of pre-rendering it). A new overlay with a
content slot must do the same — and so must a caller that renders a slot to HTML before handing
it to a layer (`<Fragment set:html>` inside the layer is already rendered: the layer's own
`renderLayerContent` cannot reset it). Overlays that render only data / function props need
nothing: TabMenu, Lightbox, ToastViewport, the Chat trigger menu, the Table context-menu rows.

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
  `ButtonGroup/groupCascade.ts` `stampOutsideLayers()` is `stamp()` with `(attrs, node)` appliers.
- Never generate ids with `Math.random()`; use `uid(Astro, prefix)` so output is deterministic.

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

## Dialogs, drawers, toasts

- `attachDialog({id?, triggerId?})` (Dialog/attach.ts) → `{trigger, close, layer}`; open/close
  work without JS via invoker commands (`commandfor`/`command="show-modal"`; Baseline, no
  fallback). `attachDrawer({id?, hasScrim})` the same (`toggle-popover` without scrim).
- Hosts `<ax-dialog>`, `<ax-alert-dialog>`, `<ax-drawer>`: `show({source?})`, `hide()`, `open()`,
  `close()`, `toggle()`, `isOpen`, `data-ax-open`, `astryx-open-change` {isOpen, reason};
  AlertDialog adds `astryx-action` and `actionLoading`.
- Every modal surface calls `supplyModalOutlet(dialog)` after `showModal()` (runtime/modalOutlet.ts).
- `toast({...})` / `createToastQueue()` / `getToastContext()` are client-only:
  `import {toast} from 'astryx-astro/elements/toast'`.
- LayerProvider (the root one) renders the page's `<ToastViewport>` after its content from its
  `toast` config (`position`, `maxVisible`, `inset`) and its `inset` (Astryx ToastHostOutlet);
  nested providers render none. The `data-astryx-toast-*` stand-in attributes are gone; the
  fallback viewport (no viewport on the page) uses the defaults.
- A visible tooltip inside a dialog consumes the first Escape (Astryx useTooltip); tests that
  press Escape on a focused control with a tooltip must expect two presses.
- `astryx-open-change` from a tooltip bubbles through its container; listeners on a container
  that has its own `astryx-open-change` must check `event.target`.

## Item (List and menus build on it)

- Props: `as`, `label`/`description` (prop or slot), slots `marker`/`startContent`/`endContent`,
  `align`, `density`, `labelLines`, `descriptionLines`, `layout`, `href`/`target`/`rel`,
  `isHighlighted`, `isSelected`, `isDisabled`, `role`, `swipeActions`, `swipeBehavior`;
  `interactiveRole="button"` replaces onClick, `interactiveRef="<selector>"` the ref; internal
  `__listRow`, `__markerColumns` for List.
- Selection: `aria-selected` on roles that allow it, else `aria-current="true"`.
- Key `item-description`: a slotted control with `data-ax-inherit="item-description"` gets the
  description id in `aria-describedby`.
- `behaviors/clickable.ts`: `data-ax-clickable="button|link|proxy|delegate"`, action marked
  `[data-ax-clickable-action]` — whole-surface activation, nested controls keep their clicks.

## Calendar (date inputs build on it)

- `<ax-calendar>`: `value` (ISO, `{start, end}` or null), `focusDate`, `rangeSelectionStart`,
  `navigateTo(iso)`, `focusDay(iso?)`, `cancelRangeSelection()`, `dateConstraints` (functions),
  `configure({min, max, minRangeSpan, maxRangeSpan, numberOfMonths, hasOutsideDays,
  hasWeekNumbers, hasVariableRowCount, weekStartsOn})`.
- Events: `astryx-change` (cancelable) {value, valueAsDate} / {value: {start, end}};
  `astryx-focus-date-change` {focusDate}. Escape cancels a range in progress and stops
  propagation so a surrounding popover stays open.
- Server and client markup come from one function (`calendarModel.ts`).
- `Astro.locals.astryxCalendar` is the request/subtree calendar system (also read by Timestamp).
  Every calendar renders on the server (no Gregorian fallback any more; see "Dates and Temporal").

## Cleanup backlog (lead)

- Token's behavior could use behaviors/clickable.ts.

## Table

- `data` + `columns` (`{key, header, width: proportional()/pixel(), align, sortable, resizable,
  renderCell, accessor, format}`; the callbacks use method syntax so `TableColumn<Row>[]` is
  assignable to the `columns` prop under `strictFunctionTypes`); `renderCell` runs on the server (text, `comp(Badge, {...})`,
  element or trusted HTML). `useTable*` plugin functions keep Astryx names and go in
  `plugins={{...}}`; callbacks became events (`astryx-sort-change`, `astryx-column-resize`,
  `astryx-expanded-change`, `astryx-toggle-group`, `astryx-expanded-ids-change`; preventDefault
  keeps state).
- Cascade key `table-density`. Client behaviours register with `registerTableBehavior(name, …)`;
  the scroller is `<ax-table>` (on `<ax-scrollable-area>`).
- Deferred plugin hook points (selection + TableSelectionToolbar, filtering, pagination,
  context menus, column settings) are documented in `Table/README.md`.

## Function slots (all components)

- Astro passes arguments to slot functions only through `<template slot="name">{(arg) => …}</template>`;
  `<Fragment slot>` silently drops them. Use `<template slot>` for every render-prop-style slot.
- Give grid/flex children `min-width: 0` around wide content (tables, code) or the track widens.

## Checkbox, radio, switch, slider

- Events: CheckboxInput/Switch `astryx-change` {isChecked, event}; RadioList `astryx-change`
  {value}; Slider `astryx-change` {value} (number or [start, end], on change) and
  `astryx-change-end` {value} (drag end / each handled key).
- CheckboxInput puts a caller's `aria-labelledby` on its input as given (routeFieldProps
  consumes it for Field's label, which a checkbox has none of); CheckboxListItem passes its rich
  label's id that way, `_CheckboxSlot` only stamps the form `value`.
- RadioList passes context to items via the subtree locals key `astryxRadioList`.
- Indicator state on the client: `CheckboxInput/_IndicatorStates.astro` + `elements/indicator-state.ts`
  (built-ins updated in place; theme replacements rendered per state into `<template>`s and
  swapped). Reuse for CheckboxList and menu checkbox items.

## Date and time inputs

- Astryx 0.7.9 DateInput/TimeInput are free-form text entry (`role="combobox"`), not segmented.
- Events (cancelable; preventDefault keeps the old value): DateInput/DateTimeInput
  `astryx-change` {value: ISO|undefined}; TimeInput {value: ISOTime|undefined}; DateRangeInput
  {value: {start, end}|null}. Calendar's own change stays inside the component.
- Element API: `value`, `open()`/`close()`/`isOpen`, `clear()`, `focus()`, `dateConstraints`;
  DateInput `formatValue`; TimeInput `stepUp()`/`stepDown()`. Forms: `name` submits ISO via
  hidden inputs (DateRangeInput `<name>-start`/`<name>-end`).
- Reusable `<ax-picker-popover>` (elements/picker-popover.ts): a popover owned by a text field
  (`popover="manual"`, outside-press dismissal, `data-ax-owner`, `data-ax-label-for`,
  `showPicker({autoFocus})`); internal `DateInput/_PickerLayer.astro`.
- `presentation` (DateInput): `bottom-sheet` / `adaptive-bottom-sheet` (coarse pointer) restyle
  the calendar layer as a sheet (presentation contract; focus on the calendar's focus day);
  `native` / `adaptive-native` (default, `nativePicker` maps onto them) keep the popover — the OS
  picker is deferred — except in a non-Gregorian calendar (→ `adaptive-bottom-sheet`, Astryx
  calendarPickerPresentation). `_PickerLayer` takes `presentation`; DateTimeInput, DateRangeInput
  and TimeInput can pass it the same way. TouchDateField's wheels / swipe paging stay deferred.
- Flaky under heavy load (animation timing): lightbox, segmented-control tests — the runner
  retries once and reports FLAKY.

## Menus (`runtime/menu.ts`)

- `<ax-menu data-ax-menu-kind="dropdown|submenu|context">` is the layer; `createMenuLevel(menu, …)`
  runs one level's keys/typeahead/activation/hover focus; `createMenuHover` ports useMenuHover
  (delays, click guard, reopen suppression, safe triangle); `moveRegionsTab`,
  `MENU_ITEM_SELECTOR` and role constants. Markup contract in the file header and runtime README.
- Events: `astryx-open-change` on each `<ax-menu>`; `astryx-select` {event} on the row;
  `astryx-change` on checkbox rows {value: boolean} and radio groups {value: string}, cancelable.
- Cascade keys: `dropdown-menu-size`, `dropdown-menu-control-size`, `dropdown-menu-flyout`,
  `dropdown-menu-radio-group`.
- Dropdown options on `<ax-menu>`: `data-ax-open-focus="first"` (a pointer open lands on the first
  row too) and `data-ax-trigger-arrows="false"` (↑/↓ on the closed trigger stay with the page).
  TabMenu uses both (its `tab-list.ts` overrides are gone).
- `presentation="bottom-sheet|adaptive"` (data `items` only, as in Astryx) restyles the menu layer
  as a sheet: heading + rows (`[data-presentation]` on the root menu follows the surface). The
  sheet's action-list rows and drill-in sub-menus (MenuBottomSheet) are deferred.
- Item makes a link root only when `as` is a component (as in Astryx); menus use `_MenuLink.astro`.

## Slot gotchas (all components)

- Astro passes a named-slot assignment to a component as a `slot` prop. Destructure it out
  (`slot: _slot, ...rest`) before spreading `rest` onto your root. Conformance now fails on any
  leaked `slot` attribute.
- `{cond && <X slot="a" />}` registers slot `a` even when `cond` is false, so
  `Astro.slots.has('a')` is true with empty content. Check the rendered HTML (or trim it) before
  preferring a slot over a prop.
## Selectors and comboboxes (Selector, MultiSelector, ComplexSelector, Typeahead)

- Listbox comboboxes build on `elements/runtime/combobox.ts` (README section): `createCombobox`
  (options, `data-ax-highlighted` / `data-ax-keyboard`, aria-activedescendant, hover hold,
  focus kept in the field) + `handleComboboxKey` (`kind: 'select' | 'editable'`) + the
  `<ax-combobox-layer>` root (`popover="auto"` for a button invoker, `"manual"` +
  `data-ax-outside-press="dismiss"` for a text input) + `keepLayerOpenFor` (`data-ax-keep-open`).
  Tokenizer, PowerSearch, CommandPalette and the DateInput/TimeInput lists should reuse it.
- Option model: `components/Selector/options.ts` (strings, `{value,label,description,disabled,icon}`,
  `{type:'divider'}`, `{type:'section',title,options}`); search row: `Selector/_PanelSearchInput.astro`.
- Render props stay server-side functions with Astryx names: Selector `renderOption` /
  `renderValue`, MultiSelector `renderOption`, Typeahead `renderItem` (named slots cannot carry
  render functions in Astro); client rows use `el.renderItem`.
- Events: Selector `astryx-change` {value|null}; MultiSelector `astryx-change` {values, change?}
  (`change = {type:'create', query}`); ComplexSelector `astryx-change` {value}; Typeahead
  `astryx-change` {value: item|null}, `astryx-change-query` {query}, `astryx-query` (async
  source: claim with `preventDefault()`, answer `respond(items)`, `update(items)` partial,
  `signal`, `reject()`). `astryx-open-change` comes from each layer.
- ComplexSelector content commits with `data-ax-commit` (+ `data-ax-commit-label`,
  `data-ax-close`), an `astryx-commit` event, or `el.commit(value, {label, close})`; a
  `trigger` slot replaces Astryx `renderTrigger`.
- Typeahead sources: `searchSource={createStaticSource(items, {keywords})}` (server-rendered,
  `components/Typeahead/createStaticSource.ts`) → `el.searchSource` (client SearchSource) →
  `astryx-query`.
- MultiSelector rows render Astryx's inert CheckboxInput (`<div inert>` + `label=""
  isLabelHidden`, lg → md); `<ax-multi-selector>` sets its `value` in place (`setMark`). The
  element restamps only `[role="option"]` rows with the box size (marks keep theirs). Deferred:
  MultiSelector option `action` grid rows and `renderTrigger`, touch press models.
- `presentation="bottom-sheet|adaptive"` (Selector, MultiSelector; SelectorBottomSheet): the
  `<ax-combobox-layer>` is restyled as a sheet (heading = label); `layer.isSheet` while latched —
  the owner then moves focus to the search row, else the listbox (tabindex 0, the trigger's
  keys, `aria-activedescendant`). Markup: `data-ax-presentation`, `data-ax-surface-class` (the
  anchored theme classes to swap), `ax-sheet-layer` / `ax-sheet-surface`.
## Bottom sheets and the `presentation` contract

- `<ax-bottom-sheet>` (elements/bottom-sheet.ts) extends `ModalHostElement`: same API and
  `astryx-open-change` as `<ax-dialog>` (reason adds `swipe`, `host`). `attachBottomSheet({id,
  hasScrim})` (BottomSheet/attach.ts) gives the invoker trigger. `id` names the `<dialog>`;
  `class` / `style` / DOM props go on the panel (`.astryx-bottom-sheet`). `finalFocus` is a
  selector (finalFocusRef). Content controls with `data-ax-dialog-close` close it.
- Framework-free core in `elements/sheet/`: `createSheetGestures()` (drag-to-snap, flick
  projection, rubber band, peek, layout split), `snapOffsets.ts` (verbatim), `motion.ts`
  (`rubberBand`, `waitForTransition`), `stack.ts` (open order, recede depth, one scrim, the
  replace handoff, `focusSheetPanel`, `closeDialogKeepingFocus`), `presentation.ts`.
- Replacing: close the top sheet and open another in the same task from inside it (or a
  switcher step change) → handoff. `forceReplaceThisTask()` pairs regardless of the actor.
- BottomSheetSwitcher: `<ax-bottom-sheet-switcher>`, `activeSheet` property,
  `data-ax-switch-to="<sheetId>"` controls, `astryx-active-sheet-change` `{activeSheet}`;
  locals key `astryxBottomSheetSwitcher` (BottomSheet/switcherContext.ts), reset to null
  inside each sheet's content.
- `presentation` (`popover | bottom-sheet | adaptive`, Astryx useAdaptivePresentation): read
  the header of `elements/sheet/presentation.ts`. One compact-touch query
  (`COMPACT_TOUCH_QUERY`); the surface is latched in `data-ax-surface` as the layer opens;
  the same layer is restyled (`astryx-bottom-sheet` class swap, full-viewport layer with
  `::backdrop`, gestures on the surface, a grab handle element rendered only for
  sheet-capable presentations). Shared implementation: `createSheetSurface()`
  (`elements/sheet/surface.ts`: latch, gestures, backdrop press, scroll lock, adaptive trigger
  sync) and `components/BottomSheet/presentation.css` (`.ax-sheet-layer`, `.ax-sheet-surface`,
  `.ax-sheet-handle`, `.ax-sheet-heading`; content inset vars `--_ax-sheet-pbs/-pi/-pbe`).
  Adopted by Popover, DropdownMenu, Selector, MultiSelector, DateInput; ContextMenu, Tokenizer,
  PowerSearch can adopt it the same way.

## Comboboxes (`runtime/combobox.ts`)

- `createCombobox({listbox, fields, isOpen, onActivate})` (highlight `data-ax-highlighted`,
  `data-ax-keyboard` ring, `aria-activedescendant`, scroll into view, type-to-select, focus stays
  in the field); `handleComboboxKey(combo, e, {kind: 'select'|'editable', …})`;
  `<ax-combobox-layer>` (`popover="auto"` for buttons, `"manual"` + `data-ax-outside-press="dismiss"`
  for text inputs); `keepLayerOpenFor`. Options are `[role=option][id][data-value]`.
- Typeahead async: `astryx-query` {query, kind, signal, respond, update, reject} — claim with
  preventDefault(); or `el.searchSource`; or `createStaticSource(items)` (exported).
- Events: Selector `astryx-change` {value}; MultiSelector {values, change?}; ComplexSelector
  {value}; Typeahead {value} + `astryx-change-query`, `astryx-query`.
- `renderOption` / `renderValue` / `renderItem` are server-side function props.

## Bottom sheets and adaptive presentation

- `<ax-bottom-sheet>` (on the Dialog family's `ModalHostElement`), stacking, switcher
  (`activeSheet`, `data-ax-switch-to`, `astryx-active-sheet-change`), `attachBottomSheet` (exported).
- `presentation` contract (`elements/sheet/presentation.ts`): one compact-touch query (plus
  `COARSE_POINTER_QUERY` for the pickers' `adaptive-bottom-sheet`; `canPresentSheet`,
  `adaptiveQuery`, `watchQuery`); surface chosen at open and kept in `data-ax-surface` until close;
  the same element is restyled (class → `astryx-bottom-sheet`, full-viewport with `::backdrop`,
  gestures on the surface); `'popover'` never reads the query. Adopters: see above.
- Scroll lock matches `[data-ax-scroll-lock][data-ax-open="true"]` (values are "true"/"false").

## Lists

- Context via subtree locals: `astryxList` (density, dividers, edge, listStyle, marker),
  `astryxCheckboxList` — both layer-scoped (an overlay inside a list renders without them). Keys on the item checkbox: `checkbox-list-item` (item), and
  `checkbox-list-reason`, `checkbox-list-state`, `checkbox-list-required` (list).
- ListItem: `interactiveRole="button"`, `interactiveRef`, `href`, slots `label`/`description`/
  `startContent`/`endContent`/`marker`. Markdown uses `listStyle` + `List/_ListMarkerScope.astro`
  for square/letter/roman/task markers.
- CheckboxList `astryx-change` {values} (collection mode); standalone rows `astryx-check` {isChecked}; `el.value`.
- Table selection: `useTableSelection`, `useTableSelectionState` (exported); events
  `astryx-select-item` {key, isSelected}, `astryx-select-all` {isAllSelected} (cancelable), then
  `astryx-selection-change` {selectedKeys, selectedCount, hasSelection}; `table.selectedKeys`,
  `table.clearSelection()`; TableSelectionToolbar `for=<table id>` + `selectionLabel` function slot;
  plugin context `rowKey(item, index)`.

## Final integration backlog (lead)

- Presentation contract still to adopt: ContextMenu, Tokenizer, PowerSearch, DateTimeInput /
  DateRangeInput pickers; DropdownMenu sheet action-list rows + drill-in sub-menus.

## TabList and Pagination

- TabList follows 0.7.9: `overflow` is `auto|scroll|visible` (scrolling strip with edge fades,
  hover-only scroll buttons, selected tab kept in view); TabMenu is caller-added; per-tab
  indicators fade (no sliding indicator); panels are not managed (`panelId` → `aria-controls`).
  `astryx-change` {value} (cancelable), `el.value`, subtree local `astryxTabList`, root enrols `size`.
- Pagination: `astryx-change` {page} (cancelable); `astryx-page-size-change` {pageSize}
  (cancelable) then `astryx-change` {page: 1}; silent setters `page`, `pageSize`, `totalItems`,
  `totalPages`, `hasMore`; `pageCount`, `goTo(page)`; links mode `href={(p) => url}` (extension).
  Paging helpers incl. `generatePageRange` (exported) in `Pagination/pageRange.ts`.

## Tokenizer, PowerSearch, CommandPalette

- `<ax-tokenizer>`: `astryx-change` {values, change: {item, type: add|create|remove}} (cancelable),
  plus `astryx-change-query`/`astryx-query` (Typeahead contract); `value`, `searchSource`,
  `renderItem`, `renderToken`, `isItemRemovable`, `focus/blur/open/close/clear`.
- `<ax-power-search>`: `astryx-change` {filters, changeType, index} (cancelable); `filters`,
  `resultCount`. Model in `PowerSearch/powerSearchModel.ts` (`createPowerSearchConfig`, exported,
  with `applyFilters`). Editor `<ax-power-search-editor>`: `astryx-save` {filter|null}, `astryx-cancel`.
- `<ax-command-palette>`: `astryx-select` {value, item}; `hotkey="mod+k"`,
  `isHotkeyAllowedInInputs`; `show/hide/toggle/isOpen/value/searchSource`. One shared window
  keydown listener for opt-in hotkeys: `registerHotkey()` in `elements/hotkeys.ts` (client-only,
  `astryx-astro/elements/hotkeys`).

## App shell and navigation

- `<ax-app-shell>` sets `data-astryx-shell-mobile="true|false"` on `.astryx-app-shell` (before
  first paint, then on breakpoint change) and fires `astryx-mobile-change` {isMobile}; TopNav
  bars it controls get `data-mode="mobile-bar"`. Main content keeps its element across breakpoints.
- Rows inside a drawer carry `data-ax-navigate`; MobileNav turns their activation into a bubbling
  `astryx-navigate` {href, event} and closes on any that reaches it. `attachMobileNav` (exported).
- Server-side shell state: locals keys in `AppShell/appShellContext.ts`.
- `<ax-nav-menu>`: hover menu on PopoverElement + `createMenuHover`. `<ax-side-nav>`:
  `collapse`/`expand`/`toggle`/`isCollapsed`, cancelable `astryx-collapse-change`, localStorage.
- Cascade key `nav-heading-menu-size`.

## Markdown

- Overrides: `components={{code, inlineCode, math, citation, link, heading, paragraph, image,
  blockquote, hr}}` (Astryx props) — an Astro component (content in its default slot, server
  only), a function `(props) => html | null | {component, props, children}`, or a tag name.
  Plugin renderers and `inlinePlugins` return the same shapes.
- One render function (`markdownPipeline.ts` + `markdownRender.ts`) for server and browser.
  Astryx renders its own `<hN>`, `<div role="paragraph">`, `<hr>`, `<a>` (not Heading/Text/Divider/Link).
- Streaming: `<Markdown isStreaming>` renders `<ax-markdown-stream>` with the current text and a
  kit `<template>`; for client-created messages render `_MarkdownKit.astro` once (`id="…"`) and
  create elements with `data-ax-kit="<id>"`. API: `append(chunk)`, `text`, `finish()`, `config`,
  `components`/`plugins` (function overrides), `astryx-markdown-render` after each render.
  Finished output equals a one-shot render (tested).
- `hasLinkClickEvent` + cancelable `astryx-link-click` replace `onLinkClick`.

## Chat

- Keys: `chat-density` (ChatMessageList), `chat-message` (ChatMessage: sender, explicit density);
  subtree local `astryxChatComposer`.
- ChatComposer: `astryx-submit` {value, tokens}, `astryx-stop`, `astryx-change` {value}; `value`,
  `isDisabled`, `isStopShown`, `canSend`, `status`, `submit()`, `focusInput()`, `inputControl`.
- ChatComposerInput: `astryx-change`, `astryx-files`, `astryx-paste`/`astryx-keydown` (cancelable),
  `astryx-submit` standalone, `astryx-query` {query, kind, trigger, signal, respond, update,
  reject}; `insertToken`, `insertText`, `expandToken`, `getTokens`, `triggers`, `pasteAsToken`.
- ChatSendButton `astryx-send`/`astryx-stop`; ChatMessageList `astryx-scroll-to-top` {waitUntil},
  `isStreaming`; ChatToolCalls `astryx-expanded-change`; ChatComposerDrawer
  `astryx-collapsed-change`; ChatDictationButton `astryx-dictation-start/end/result/error`,
  `astryx-transcript`.
- Markdown in chat: put `<Markdown>` (or an `<ax-markdown-stream>` from a `_MarkdownKit`) in a
  ghost ChatMessageBubble's default slot; set `list.isStreaming = true` while a reply streams.

## Table plugins (complete)

- Filtering (popover/inline/inline-compact): `astryx-filter-change` {columnKey, value, filters}
  (cancelable); `table.filters`, `table.clearFilters()`; `hasClientFiltering`.
- Pagination plugin: Pagination's own events; `table.paging`; `hasClientPaging`; page links.
- Column settings: `astryx-columns-change` {activeColumnKeys} (cancelable);
  `table.activeColumnKeys`; `TableColumnSettings` picker (MultiSelector).
- Context menus: `astryx-context-action` {id, columnKey, rowKey, kind} (cancelable);
  `table.registerContextAction(id, {state, select})`; sort and expand/collapse actions built in.
  Children mode: TableCell / TableHeaderCell `contextMenuActions` wrap the content in a
  `<ContextMenu items>` (`Table/contextMenuOptions.ts`); rows dispatch `astryx-select`, `data-id`
  = the action id.
- `<ax-table>` helpers `setRowPager()`, `matchCount`. All `useTable*` plugin functions exported.
- Filter popover initial focus: the popover takes the first genuine content control (usePopover
  focusInitialTarget), and DateInput's calendar toggle precedes its text field (as in Astryx),
  so `_FilterControl` (`isInPopover`) names the date field with `data-autofocus`, the
  caller-preferred target the popover runtime takes first.

## Dates and Temporal (`lib/temporal.ts`)

- `import {Temporal} from '../lib/temporal'` is the only way to Temporal: the native
  `globalThis.Temporal` (Chrome/Edge 144+, Firefox 139+), else `temporal-polyfill/full`
  (pinned 1.0.6, all calendars) loaded by a dynamic import behind top-level await (Safari, Node
  on the server). Never installed globally. `isNativeTemporal`, `isTemporal(v, kind)`.
- Importing it makes the importing script wait for Temporal, so only date code imports it:
  lib/date, the date components and elements, Timer. Code every page of a kind ships (Table
  plugins and `elements/table-features/*`, PowerSearch's row matcher `powerSearchFilters.ts`)
  reads Temporal values by brand with `lib/temporalKind.ts` (`temporalKind`,
  `exactTimeMilliseconds`, `compareTemporal`, `plainDateUtcMilliseconds`) instead.
  `tools/tests/temporal-loading.test.mjs` fails if a page without date elements reaches the
  lib/temporal chunk, or if Chrome ever requests the polyfill.
- Never pass a Temporal object to `Intl.DateTimeFormat` / `toLocaleString`: native V8 and the
  polyfill both choose other patterns for Temporal objects than for an instant (ja-JP
  `{month: 'long'}` → "2026/3/21"). Format `epochMilliseconds` with the native formatter, as
  lib/date does (byte-identical in both modes).
- `Date` only at Astryx boundaries: `dateConstraints` callbacks and Calendar's `valueAsDate`
  get a local-midnight `Date`; Timestamp's `parseValue` returns one; rows/cells may be `Date`s;
  free-form text fallbacks (`parseDateInput`, `parseInstant`, the Table date filter string)
  use `Date`'s parser; `powerSearchFilters.ts` reads the clock with `Date.now()` to stay
  Temporal-free. Comment each new one.
- Props take Temporal values too (port addition, `lib/date/values.ts`): `Temporal.PlainDate`
  for Calendar / DateInput / DateRangeInput values and bounds, `PlainTime` for TimeInput,
  `PlainDateTime` / `ZonedDateTime` (wall clock) for DateTimeInput, `Instant` /
  `ZonedDateTime` for Timestamp `value` and Timer `startTime`; element `value` setters too.
  Event `detail`s stay Astryx's ISO strings.
- Tests: `AX_TEMPORAL=polyfill` (or `setup({temporal: 'polyfill'})`, or `#no-temporal` in a
  URL) runs a harness test with Chrome's Temporal deleted; `temporal-polyfill-mode.test.mjs`
  runs every date test that way; `lib-date-browser.test.mjs` runs the lib/date cases in Chrome.
- Known engine difference: native V8 Temporal (ICU4X) and the polyfill (which reads Intl, ICU4C)
  place a few Chinese / Dangi month starts a day apart (Chinese New Year 2027: Feb 6 native,
  Feb 7 polyfill; Chinese months starting around 1999-01-17, 2012-08-17, 2018-11-07 and
  2030-02-02 too, among dates sampled 1985–2045). The server renders with the
  polyfill, so a Chinese calendar showing such a month re-renders differently in Chrome after
  navigation; Astryx's `withTemporalDay` keeps labels on the grid's month either way.
  `calendar.test.mjs` reports these and fails on any other server/browser difference.
