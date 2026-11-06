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
  stop), `typeahead.ts`, `disabledInteraction.ts`.
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
  on the start/end slots. Keyboard hint: `behaviors/keyboardHint.ts`
  (`data-ax-keyboard-hint="<ax-layer id>"` on any roving container).

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
