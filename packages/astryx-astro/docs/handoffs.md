# Cross-batch contracts

Contracts established by finished ports that later ports must use. Append when a batch
introduces a provider/consumer key, slot convention or runtime API.

## Cascade keys (`lib/cascade.ts`)

| Key | Consumer opts in | Provider stamps | Established by |
|---|---|---|---|
| `icon-size` | Icon without explicit `size` (renders `data-size="md"`) | owner sets `data-size` (Button: sm for sm/md, md for lg) | Icon |
| `form-direction`, `form-optionality`, `form-required` | Field-composed inputs | FormLayout (see header of `FormLayout.astro`) | FormLayout |
| Layout region settings | LayoutHeader/Content/Panel/Footer | Layout | Layout |

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

- Popover's hidden close button is a styled stand-in → Button/IconButton.
