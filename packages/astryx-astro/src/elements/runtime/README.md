# Client runtime (`src/elements/runtime/`)

Framework-free singletons every interactive port builds on. Each module is SSR-safe to
import (nothing touches the DOM on the server), installs its document listeners once per
document however many components import it, and is loaded from a component with
`<script>import '../../elements/runtime/<module>';</script>` (Astro bundles and dedupes).

**Never add a second document-level Escape, outside-press, modality or disabled-click
listener.** Register with these modules instead.

| Module | Ports (Astryx 0.7.9) |
|---|---|
| `modality.ts` | utils/interactionModality.ts, utils/focusReturn.ts |
| `announce.ts` | hooks/useAnnounce.ts, hooks/modalAnnounce.ts, hooks/useAnnounceRenderedText.ts |
| `layerStack.ts` | Layer/layerStack.ts, useLayerDismissal.ts, outsidePress.ts, gestureCounter.ts |
| `anchor.ts` | Layer/useLayer.tsx (anchoring, FR4/FR5/FR8), anchorName.ts, settledBox.ts |
| `layer.ts` | Layer/useLayer.tsx lifecycle + hooks/useFocusTrap.ts focus return |
| `tooltip.ts` | Tooltip/useTooltip.tsx, HoverCard/useHoverCard.tsx, InfoTip, utils/triggerFocus.ts |
| `popover.ts` | Popover/usePopover.tsx, Popover/Popover.tsx, useFocusTrap containment |
| `roving.ts` | hooks/useListFocus.ts, hooks/isRtlElement.ts |
| `keyboardHint.ts` | hooks/useKeyboardHint.tsx |
| `typeahead.ts` | utils/typeaheadMatch.ts, hooks/useTypeahead.ts |
| `disabledInteraction.ts` | utils/disabledInteraction.ts (AST-085) |
| `dom.ts` | utils/ime.ts, hooks/focusableSelector.ts, utils/isFocusDetached.ts |
| `menu.ts` | DropdownMenu/menuItemRoles.ts, menuItemHover.ts, menuRegionStops.ts, useMenuOverflow.ts, hooks/useMenuHover.ts, hooks/useLongPress.ts; the menu paths of DropdownMenu.tsx, DropdownMenuSubMenu.tsx, ContextMenu.tsx |

---

## modality.ts

Writes `<html data-astryx-modality="keyboard|pointer|virtual">` (default `keyboard`; a
modifier chord never counts; `virtual` is a trusted click with `detail 0` that no key or
pointer started — a screen reader). Contract #19: programmatic focus shows a ring only after
keyboard input.

| Export | |
|---|---|
| `getModality(target?)` | last modality in the target's document |
| `getLastPointerType()` | `mouse` / `pen` / `touch` of the last pointerdown |
| `isTouchInteraction()` | last input was a touch press |
| `onModalityChange(fn)` | subscribe; returns unsubscribe |
| `focusForLastInput(el, opts?)` | focus with `focusVisible: false` after pointer/virtual input (text fields always plain) |
| `returnFocusForLastInput(el)` | the same with `preventScroll: true` — every overlay's focus return |
| `trackModality(doc)` | track a second document (iframe) |

CSS may read the attribute, e.g. `:root[data-astryx-modality="keyboard"] .x:focus { … }`.

## announce.ts

Persistent visually hidden live regions (`[data-astryx-live-region="polite|assertive"]` on
`body`, created empty on first use). Messages in one frame join; an identical repeat is
kept once; regions clear 2s later. Inside an open `dialog:modal` (the one around `from`, else
the topmost presented) the message goes to that dialog's own direct-child region
`[data-astryx-modal-live-region]` (AST-086 FR14).

| Export | |
|---|---|
| `announce(text, {politeness?, from?} \| politeness)` | returns `withdraw()` (takes it back while not yet exposed); empty text clears |
| `createAnnouncer({hasReplace})` | one instance that states one value (each message withdraws its previous one) |
| `announceText(el, {politeness?, fallbackText?})` | speak an element's rendered text |
| `renderedText(el)` | text as AT reads it (hidden parts skipped, blocks apart) |
| `blockText(el)` | each child as its own block (useAnnounceRenderedText `skipFirstRender`) |
| `createRenderedTextAnnouncer(el, {skipFirstRender?, politeness?, fallbackText?})` | `{sync(isShown?, occasion?)}`: useAnnounceRenderedText for a DOM element — speaks once per occasion, silent while the page loads (skipFirstRender), inside a live container, or hidden; `behaviors/announceRenderedText.ts` drives it with a MutationObserver |
| `clearAnnouncements(politeness)`, `topmostModal()`, `enclosingModal(el)`, `isExposedModal(d)` | |

## layerStack.ts — Escape, outside press, gestures

One bubble-phase `keydown` and capture-phase `pointerdown/up/cancel` listener per document,
installed with the first registered layer. Rules (contract #17): one Escape dismisses
exactly one layer, the top-most present one; content that `preventDefault()`s (or stops)
Escape keeps it; IME composition never dismisses; a handled Escape is `preventDefault()`ed,
which also silences the browser's own close watcher. Order: DOM containment, then
registration (open) order. Outside press: the top-most layer that takes outside presses
owns the press and is dismissed only if it started **and** ended outside; layers below never
see it.

```ts
import {registerLayer} from '../../elements/runtime/layerStack';
// when the layer opens (register on open so order = open order):
const unregister = registerLayer({
  element: listEl,                       // containment + document
  escape: 'close',                       // 'close' | 'block' | () => … | null (= not on the Escape stack)
  outsidePress: 'dismiss',               // 'dismiss' (manual layer, e.g. a combobox list) | 'native' (popover=auto) | 'ignore'
  isInside: (path) => path.includes(listEl) || path.includes(inputEl),
  isPresent: () => listEl.matches(':popover-open'),
  dismiss: (reason) => close(reason),    // 'escape' | 'outside'
});
// when it closes: unregister();
```

| Export | |
|---|---|
| `registerLayer(entry)` | returns idempotent unregister |
| `isTopmostLayer(el)`, `topmostLayer(doc?)` | |
| `shouldDismissOnCloseRequest(el)` | for `<dialog>` `cancel` / back gesture: top-most and not composing |
| `dispatchLayerEscapeKeyDown(e)` | route an Escape from a boundary that stops propagation |
| `noteOutsideDismissal(doc)`, `outsideDismissalCount(doc)` | a modal backdrop ignores the press that closed a child layer: compare the count at pointerdown and click |
| `isTextComposing()` | |
| `currentGesture()`, `currentGestureHasClicked()` | the press that dismissed a layer never reopens it |

## anchor.ts — anchoring

Static geometry lives in `components/Layer/Layer.css` (import it from every component that
renders a layer). A layer element:

```html
<ax-… id="L" popover="auto|manual|hint" class="ax-layer [ax-layer-motion]"
      data-placement="above|below|start|end" data-align="start|center|end"
      [data-astryx-keep-clear] style="--_astryx-layer-clearance: var(--spacing-1)">
```

- `position-area` / `position-try-fallbacks` (flips, spans, `@position-try` slides), the
  viewport gutter `max(var(--spacing-4), env(safe-area-inset-*)) + --astryx-layer-inset-<edge>`,
  `max-inline-size`/`max-block-size` caps (`--_ax-max-inline-size`, `--_ax-max-block-size`,
  readable by surfaces inside), and the clearance (kept across flips) come from those attributes.
- `ax-layer-motion`: `@starting-style` entry (spacing-2 travel toward the anchor + 0.95 scale,
  `--duration-fast-max` / `--ease-standard`), fade-out exit (`--duration-exit` / `--ease-exit`,
  `allow-discrete`). Reduce motion (media query or `[data-astryx-reduced-motion]`): no travel —
  instant under a fine pointer, a 200ms cross-fade under a coarse one.
- `data-astryx-keep-clear` (tooltips): a layer that would cover its trigger switches to the
  anchor-clear list (beside, flip, fit-to-room) and scrolls only if its content overflows.

| Export | Writes |
|---|---|
| `anchorLayer(layer, anchor)` — call synchronously before the layer shows | `anchor-name` (composed list, inline) on the anchor; `position-anchor` on the layer; `data-astryx-anchor-hidden` (FR5) |
| `settleLayer(layer)` — once shown (same task as `showPopover()`, or rAF for a native show: runs before that frame paints) | rect mode: `top`/`left`/`margin:0`, `--_ax-anchor-width`, `data-astryx-rect-side`; keep-clear: `data-astryx-clears-anchor`, `data-astryx-layer-scrolls` |
| `releaseLayer(layer)` — after it hid | removes the anchor name when the exit transition ends |
| `supportsAnchorPositioning()`, `anchorNameFor(layer)`, `addAnchorName`/`removeAnchorName`/`readAnchorNames`, `keepAnchorClear`, `positionWithRects`, `anchorOf(layer)` | |

No anchor positioning (or `<html data-astryx-anchor-fallback>`, used by the tests): the layer
gets `data-astryx-rect` and a rect positioner places it (side → opposite side → mirrored
alignment → slide inside the gutters) and follows scroll/resize while open.

## layer.ts — `LayerElement` and `<ax-layer>`

Base class of every layer root (`<ax-layer>`, `<ax-tooltip>`, `<ax-hover-card>`,
`<ax-popover>`). It only listens to the platform's `beforetoggle`/`toggle`, so a
`<button popovertarget>` opens it with zero JS; the runtime adds anchoring, stack
registration, focus return (`preventScroll`, ring per modality, only when focus was inside
and would be lost), the anchor-name lifetime and `wasJustDismissed()`.

| Attribute (read) | |
|---|---|
| `id` | required |
| `popover` | `auto` \| `manual` \| `hint` (default `manual`) |
| `data-ax-anchor="<id>"` | anchor element (default: the `[popovertarget=<id>]` invoker) |
| `data-ax-escape` | `close` \| `block` \| `none` (default `close` for `auto`, else `none`) |
| `data-ax-open` | `"true"` opens on connect; set `"true"`/`"false"` to show/hide; **reflected** |

API: `show({anchor?, source?, reason?})`, `hide(reason?)`, `open()`/`close()` (aliases), `toggle(force?)`, `isOpen`,
`anchor`, `wasJustDismissed()`. Event: `astryx-open-change` (bubbles, composed)
`{isOpen, reason, isRequest?}`. Subclass hooks: `resolveAnchor`, `escapeBehavior`,
`outsidePressMode`, `isInsidePress`, `restoreFocusTarget`, `requestDismiss`,
`willOpen`/`didOpen`/`willClose`/`didClose`. Menus, listboxes and comboboxes should extend
`LayerElement` (or `PopoverElement`) rather than wiring popovers by hand.

## tooltip.ts — `<ax-tooltip>`, `<ax-hover-card>`

One delegated set of `pointerover/out`, `focusin/out`, `pointerdown/up` listeners for every
trigger. **Trigger contract**: `data-ax-tooltip="<layer id>"` (or `data-ax-hover-card`) plus,
for tooltips, `aria-describedby` containing the id, both in the server HTML.

| Layer attribute | Default |
|---|---|
| `data-ax-delay` / `data-ax-hide-delay` | tooltip 200 / 0 (100ms bridge), hover card 300 / 200 |
| `data-ax-focus-trigger` | `auto` (`always`, `never`) |
| `data-ax-touch-trigger` | `auto` (`tap`, `none`) |
| `data-ax-enabled="false"` | enabled |
| `data-ax-controlled` + `data-ax-open` | controlled: hover/focus never change it; Escape emits `astryx-open-change` with `isRequest` |
| `data-ax-anchor="<id>"` | the position anchor (Astryx `positionRef`) when the trigger carries the attributes (a row triggers, its checkbox anchors; `<Tooltip anchor>`); with no trigger in the markup it is wired as the trigger (`<Tooltip for>`; `data-ax-for` names the trigger when both are given) |

API: `show/hide` (LayerElement), `showNow(trigger)`, `hideNow()`, `pin(trigger?)` (Astryx
`useTooltip().show()`: held until `unpin()`, Escape, a press outside or focus leaving; announced
once), `unpin()`, `isPinned`, `isEnabled`. InfoTip buttons carry `data-ax-info-tip="<id>"`: a
click/Enter/Space pins, the next closes, `aria-expanded`/`aria-controls` are synced. Group
handoff: while one tooltip is open (or within 300ms of one closing) another shows without
its delay and replaces it.

## popover.ts — `<ax-popover>`

Extends `LayerElement`. Reads the surface `:scope > .astryx-popover` (`role="dialog"`,
`aria-modal`), `data-ax-autofocus="false"`, `data-ax-escape="none"`. Syncs `aria-expanded`
on every `[aria-controls~=id][aria-expanded]` / `[data-ax-popover-trigger=id]`; initial focus
(`[autofocus]`/`[data-autofocus]`, else the first content control except
`[data-astryx-popover-fallback-close]`, else the dialog surface); Tab/Shift+Tab containment for
`aria-modal="true"`; `data-astryx-overflow` on the surface while its content overflows.
Non-native triggers (`[role="button"]`) carry `data-ax-popover-trigger="<id>"`; one delegated
click/Enter/Space listener toggles them (never reopening on the press that light-dismissed).

## roving.ts — `data-astryx-roving`

```html
<div role="toolbar" data-astryx-roving="horizontal" data-astryx-roving-items="button">…</div>
```

| Attribute on the container | Default |
|---|---|
| `data-astryx-roving` | orientation: `horizontal` \| `vertical` \| `both` (empty = `vertical`) |
| `data-astryx-roving-items` | `[role="menuitem"]` |
| `data-astryx-roving-boundary` | — (nested lists, e.g. `[role="menu"]`) |
| `data-astryx-roving-wrap="false"` | wraps |
| `data-astryx-roving-home-end="false"` | Home/End on |
| `data-astryx-roving-paging` | PageUp/PageDown off |
| `data-astryx-roving-tabindex="false"` | manages one tab stop (`tabindex` 0/-1, repaired on DOM changes) |
| `data-astryx-roving-caret` | caret guard for text fields/editors off |
| `data-astryx-roving-focus="last-input"` | plain `focus()` |
| `data-astryx-roving-typeahead` (+ per item `data-astryx-typeahead-label`) | off |

Skips `aria-disabled="true"`/`disabled` items and items under a `hidden`/`inert` ancestor;
horizontal arrows follow the computed direction (RTL). A component handler that
`preventDefault()`s a key wins. Imperative: `createRovingFocus(container, options)` →
`{getItems, ownsEvent, handleKeyDown, handleFocus, focusItem, focusFirst, focusLast,
syncTabStops}`; `rovingFor(container)`.

| Export | |
|---|---|
| `syncRovingTabStops(root?)` | stamp the stop of every container under `root` **and every container enclosing it**, inner first; call it after placing a stop yourself (SegmentedControl, `data-astryx-roving-tabindex="false"`) |
| `onRovingKeyDown(container, fn)` | run `fn` for keydowns the delegated pass brings to `container`: after nested lists, only while not `defaultPrevented`, before its arrows / typeahead (where a composite's extra key handlers run, e.g. the keyboard hint); `preventDefault()` keeps the container from handling the key; returns unsubscribe |

**Nested lists** (a ButtonGroup inside a Toolbar) follow useListFocus under React's order:

- An outer list sweeps the inner list's items into its own order unless its boundary stops at
  the inner container. A Toolbar (`[role="toolbar"], [popover]`) does not stop at a
  ButtonGroup (`role="group"`), so the group's members are Toolbar items too; a nested
  Toolbar or a layer is its own list.
- Keydown: innermost container first, then each enclosing one while nothing has prevented the
  key. An arrow the group consumes (←/→/Home/End in a horizontal group, wrapping inside it)
  never reaches the Toolbar; one it ignores (↓ in a horizontal group inside a vertical
  Toolbar) moves through the Toolbar's order.
- Tab stops: inner containers sync before the ones enclosing them (a child's layout effect
  runs before its parent's) on load, for DOM changes (an item added, disabled, hidden; a
  group inserted) and after every focus or tab-stop move; an outer sync keeps the first item
  already at `tabindex="0"`, so the whole composite keeps one stop. On load a Toolbar
  containing a ButtonGroup therefore stops on the group's first member, as in Astryx.

## keyboardHint.ts — useKeyboardHint

An ephemeral "← → to navigate" badge for roving composites (Toolbar, SegmentedControl,
TabList). It shows below the focused item on the first keyboard focus (`:focus-visible`) that
enters the composite from outside, follows focus within, and is spent — never shown again for
that composite — by the first arrow key, after 3 s, or when focus leaves. Focus inside one of
the composite's own layers (`[popover]`) neither shows nor spends it. On a roving container
the arrow check runs through `onRovingKeyDown`, so an arrow a nested list consumed (a
ButtonGroup inside a Toolbar) leaves the Toolbar's hint up, re-anchored, as in Astryx.

Markup (render it inside the composite; strings come from the server, the layer is
`aria-hidden` content):

```astro
<div role="toolbar" data-astryx-roving="horizontal" data-ax-keyboard-hint={hintId}>
  …items…
  <Layer id={hintId} class="ax-keyboard-hint" placement="below" alignment="start" offset="var(--spacing-2)">
    <span aria-hidden="true"><span class="ax-keyboard-hint-keys"><Kbd keys="left" /><Kbd keys="right" /></span><span class="ax-keyboard-hint-label">{t('@astryx.keyboardHint.toNavigate')}</span></span>
  </Layer>
</div>
<script>import '../../elements/runtime/keyboardHint';</script>
```

Attribute wiring: `data-ax-keyboard-hint="<layer id>"` on the composite (+ optional
`data-ax-keyboard-hint-ms`); importing the module wires every such element, later ones too.
An empty value is not a composite (SegmentedControl marks its layer that way and drives it).

| Export | |
|---|---|
| `createKeyboardHint(container, {layer, dismissAfterMs = 3000, isEnabled?})` | a controller for a custom element: `layer` is the `<ax-layer>` or a finder; `isEnabled()` is read on every focus entry (SegmentedControl: `!isDisabled`) |
| `hint.attach()` | adds `focusin` / `focusout` / `astryx-open-change` on the container and the keydown (via `onRovingKeyDown`, else a container listener); returns `detach` (removes them, hides the hint). The spent state survives detach/attach (an element that is moved keeps it) |
| `hint.handleFocusIn / handleFocusOut / handleKeyDown(e)` | the handlers, for callers that route events themselves |
| `hint.dismiss()`, `hint.isVisible`, `hint.isDismissed` | |

## typeahead.ts

`createTypeahead({getItemLabels, onMatch, getCurrentIndex?, resetMs = 750, isDisabled?})` →
`{onKeyDown(e): boolean, reset()}` plus the pure `foldForTypeahead`, `nextTypeaheadBuffer`,
`typeaheadPrefixMatch`, `findTypeaheadMatch`.

## disabledInteraction.ts

One capture-phase document listener: a click on (or inside) an `aria-disabled="true"`
control (`button, a, input, select, textarea, summary, [tabindex]`, widget roles such as
`[role="button"]`/`link`/`tab`/`option`, and any `[data-ax-disabled-interaction]` element) is
cancelled and stopped before any handler; Enter/Space keydowns on it are cancelled (so no
synthetic click, and no `popovertarget` activation). An aria-disabled group/landmark role does
not swallow its content's clicks. Import it from any component that renders `aria-disabled`
controls (`disabledControlOf(target)` is exported for custom checks). It is the only
disabled-interaction listener (the former `behaviors/disabledInteraction.ts` is merged here).

---

## The tooltip attachment contract (Button `tooltip`, IconButton label, status icons)

A component that renders its own trigger attaches a tooltip with one helper and the
`<Tooltip>` component in sibling mode (no children):

```astro
---
import Tooltip from '../Tooltip/Tooltip.astro';
import {attachTooltip} from '../Tooltip/attach';
const {tooltip, tooltipPlacement = 'above', ...rest} = Astro.props;
const tip = tooltip ? attachTooltip({describedBy: rest['aria-describedby']}) : null;
---
<button {...rest} {...tip?.trigger} aria-disabled={isDisabled && tip ? 'true' : undefined}>…</button>
{tip && <Tooltip {...tip.layer} content={tooltip} placement={tooltipPlacement} />}
```

- `tip.trigger` = `{'aria-describedby': '<caller ids> <id>', 'data-ax-tooltip': '<id>'}` —
  the description is in the server HTML; the delegated runtime finds the layer by id.
- `tip.layer` = `{id}`; `<Tooltip>` without children renders only the `<ax-tooltip>` layer.
  Render it directly after the trigger, never inside a `<button>`/`<a>`.
- A disabled control that shows a tooltip uses `aria-disabled="true"` (contract #2) so it
  still gets hover/focus; `disabledInteraction` keeps it inert.
- `attachHoverCard({label?})` is the same for HoverCard; `attachPopover({triggerId?})`
  (`components/Popover/attach.ts`) gives a native-invoker trigger + `<Popover for=…>` props.
- An existing element can also be wired by id: `<Tooltip for="some-id" content="…" />`
  (attributes are added at runtime, so the description is not in the server HTML).
- A Button takes `{...tip.trigger}` too (its external tooltip: a caller's `data-ax-tooltip` is
  kept when it has no `tooltip` of its own), for a layer the caller drives (Pagination's nav
  buttons, the copy buttons' flipping text).
- Position against another element than the trigger (Astryx `positionRef`):
  `<Tooltip {...tip.layer} anchor={inputId} />` — CheckboxInput / Switch reasons: the row
  triggers, the control anchors.

## `modalOutlet.ts` — top-layer outlets for content that must paint above modals

`supplyModalOutlet(dialog)` after `showModal()`, `withdrawModalOutlet(dialog)` on close,
`getActiveModalOutlet()`, `subscribeModalOutlets(listener)`, `notifyTopLayerEntry()`.
ToastViewport moves into the latest outlet so toasts paint above an open modal. Every modal
surface (Dialog, AlertDialog, Drawer, BottomSheet, Lightbox, MobileNav, CommandPalette) must
supply its `<dialog>` as an outlet while open.

Client-only APIs (import from the element modules in the browser, not from the package index):
`toast()`, `createToastQueue()`, `getToastContext()` (`src/elements/toast.ts`).

## menu.ts — `<ax-menu>`, menu levels, hover intent

Everything a `role="menu"` surface needs: the `<ax-menu>` layer (a `LayerElement`: dropdown
root, sub-menu flyout or context menu), one keyboard/pointer controller per menu level, the
useMenuHover port and the header/footer Tab cycle. DropdownMenu, MoreMenu and ContextMenu render
it; TabList's TabMenu, Breadcrumb menus and NavMenu should render `<DropdownMenu>` (its
`trigger` slot = Astryx `renderTrigger`) or this markup; TopNav / SideNav reuse
`createMenuHover`; Selector-like lists can reuse `createMenuLevel` (with their own role
selectors) or just `createTypeahead` + roving. One import wires everything:
`<script>import '../../elements/runtime/menu';</script>`.

**Markup contract** (server-rendered; ids from `uid()`):

```html
<button id="T" popovertarget="L" aria-haspopup="menu" aria-expanded="false" aria-controls="M">Actions</button>
<ax-menu id="L" popover="auto" data-ax-menu-kind="dropdown" data-ax-anchor="T" data-astryx-layer-root
         class="ax-layer ax-layer-motion" data-placement="below" data-align="start">
  <div id="M" role="menu" tabindex="-1" aria-label="Actions" data-ax-overflow-tabbable>
    <div role="menuitem" tabindex="-1">Edit</div>                       <!-- closes on select -->
    <div role="menuitem" tabindex="-1" data-ax-close-on-select="false">Copy link</div>
    <div role="menuitem" aria-disabled="true">Archive</div>             <!-- no tabindex -->
    <div role="menuitemcheckbox" aria-checked="false" tabindex="-1" data-ax-close-on-select="false">Grid</div>
    <div role="group" aria-label="Sort by" data-ax-radio-group>
      <div role="menuitemradio" aria-checked="true" data-value="new" tabindex="-1">Newest</div>
    </div>
    <div role="menuitem" id="R" tabindex="-1" aria-haspopup="menu" aria-expanded="false" data-ax-submenu="F">Move to</div>
    <ax-menu id="F" popover="manual" data-ax-menu-kind="submenu" data-ax-anchor="R"
             class="ax-layer ax-layer-motion" data-placement="end" data-align="start">
      <div id="F-menu" role="menu" tabindex="-1" aria-labelledby="R" data-ax-overflow-tabbable>…rows…</div>
    </ax-menu>
  </div>
</ax-menu>
```

- `data-ax-menu-kind`: `dropdown` (`popover="auto"`, native light dismiss, trigger by
  `data-ax-anchor` or the `popovertarget` invoker; a `[role=button]` trigger without the
  invoker gets a click listener), `submenu` (`popover="manual"` inside its parent's
  `role="menu"`, right after its row), `context` (`popover="manual"`, `data-ax-context-target`
  = the trigger area, `data-ax-anchor` = a 1px absolutely positioned cursor anchor inside it;
  the menu may wait in `<template data-ax-menu-content>` until the first open).
- Each layer's own menu is its first `[role="menu"]` whose closest `ax-menu` is the layer;
  rows are `menuitem` / `menuitemcheckbox` / `menuitemradio` scoped to that menu (nested
  levels are excluded). `aria-disabled="true"` rows are skipped by arrows, typeahead and hover.
- Optional: `data-ax-menu-region="header|footer"` beside the menu (the popover is then a
  `role="dialog" aria-modal` surface and Tab walks header → menu → footer), `data-ax-busy-label`
  on a row (announced when its level shows), `data-ax-size-from-trigger` on a dropdown (rows
  and `[data-ax-marker]` indicators follow the trigger's `data-size` at open),
  `data-ax-disabled` on a context menu (native menu), `data-ax-open="true"` (open on connect, no
  focus move). Dropdown options: `data-ax-open-focus="first"` (a pointer open lands on the
  first row too — TabMenu's focus-on-open) and `data-ax-trigger-arrows="false"` (↑/↓ on the
  closed trigger do not open it; they stay with the page, e.g. the TabList strip's roving).

**Behaviour** — open: the invoker click (zero JS), Enter / Space / ↓ on the closed trigger
(first row), ↑ (last row); a pointer open focuses the menu element, a script `show()` the first
row. Keys per level: ↑/↓ wrap, Home/End, PageUp/PageDown, typeahead, Enter/Space activate (a
synthesized click with the key's modifiers; repeats ignored), Tab closes the whole menu
(regions: the dialog cycle), → (← RTL) / Enter / Space open a row's flyout on its first row,
← (→ RTL) closes a flyout. Escape and outside presses use `layerStack.ts`: the deepest open
flyout first; dropdown roots are light-dismissed natively, context menus need a press that
starts and ends outside (`requestDismiss` ignores the release of the opening right-click), flyouts
take no outside presses and close with their root. Hover: the row under a mouse takes focus
(one highlight, `:focus` paint); a flyout opens 150ms after hover, a hover-opened one closes
200ms after leave (safe triangle), a click within 500ms of a hover open pins it. Selection:
checkbox flips `aria-checked` (stays open unless `data-ax-close-on-select="true"`), radio moves
`aria-checked` in its group (closes unless the group says `"false"`), any other row closes
unless it says `"false"`; a modified click on a link row is the browser's. Focus returns to
the trigger / the row / the element focused before (context). Context menus open at the
pointer, at the keyboard contextmenu position (0,0 → the area's bottom-start; a Shift+F10 /
Menu key that produces no contextmenu event opens there too), or after a 500ms touch hold
(10px slop); opening one closes any other.

**Events** (bubbling, composed): `astryx-open-change` `{isOpen, reason}` on each `<ax-menu>`
(a flyout's bubbles through its root); `astryx-select` `{event}` on a row that acted;
`astryx-change` `{value: boolean}` on a checkbox row and `{value: string}` on a radio group
(both cancelable: `preventDefault()` keeps the state).

| Export | |
|---|---|
| `MenuElement` (`<ax-menu>`) | `kind`, `menu`, `trigger`, `parentMenu`, `root`, `level`; `show/hide/open/close/toggle` (LayerElement), `focusMenu()`, `focusFirst()`, `focusLast()`, `openAt(clientX, clientY)` (context), `openSubmenu({focusFirst})` / `closeSubmenu({focusTrigger})` (flyout) |
| `createMenuLevel(menuEl, {focusFollowsLastInput?, onCloseKey?, onTab?, onRowKey?, onRowClick?, onRowAuxClick?})` | one level's keys (roving + typeahead + activation), hover focus and row clicks, listeners on that element only → `{menu, roving, getItems, focusFirst, focusLast, focusItem, focusMenu, ownsEvent, rowOf, handleKeyDown, reset, destroy}` |
| `createMenuHover({show, hide, isOpen, isEnabled, showDelay = 150, hideDelay = 200, clickGuardMs = 500, flyout?, focusMenu?, trigger?})` | useMenuHover → `{triggerEnter, triggerLeave(e), contentEnter, contentLeave(e), click(e), confirmHoverOpen, notifyClosed, clear}`; wire the trigger's and the flyout's `mouseenter` / `mouseleave`; call `notifyClosed()` on every close |
| `moveRegionsTab(event, menu, header, footer, isFromFlyout?)`, `tabbablesIn(region)` | the header / menu / footer Tab cycle |
| `MENU_ITEM_ROLES`, `MENU_ITEM_SELECTOR` (enabled rows), `MENU_ROW_SELECTOR`, `MENU_BOUNDARY_SELECTOR` | |
| `isModifiedClick(e)`, `activateMenuItem(row, keyEvent)`, `isDisabledRow(row)`, `focusMenuItemOnHover(pointerEvent, row?)`, `isPointInSafeTriangle(point, origin, rect)`, `flyoutFor(row)` | |

Deferred (touch extras): press-drag-release (useMenuPress: open on press, the row under the
release acts, edge autoscroll), the entrance input hold, drill-in sub-menus, bottom sheets.

---

## combobox.ts — listbox comboboxes

Ports Selector/hooks.ts useCombobox, MultiSelector/hooks.ts useMultiCombobox,
hooks/useHighlightedOptionScroll.ts, hooks/useKeyboardHighlight.ts, Layer/outsidePress.ts (for
manual lists) and Layer/useLayer.tsx useKeepLayerOpenProps.

The shared controller of every combobox whose popup is a listbox: Selector, MultiSelector
and Typeahead now; Tokenizer, PowerSearch, CommandPalette and the DateInput/TimeInput lists
next. DOM focus never leaves the field: the active option is named by
`aria-activedescendant`, a press anywhere in the list keeps focus in the field, and the
owner keeps the value, `aria-selected` and `aria-expanded`.

**Markup contract** (server-rendered; the controller reads it and writes only state):

```html
<button|input role="combobox" aria-controls="L" aria-expanded="false" [aria-autocomplete="list"]>
<ax-combobox-layer id="P" popover="auto|manual" class="ax-layer …" data-ax-anchor="<field box id>"
                   [data-ax-outside-press="dismiss"] [data-ax-inside="<id> …"]>
  <div id="L" role="listbox" [aria-multiselectable="true"]>
    <div role="option" id="L-item-0" data-value="apple" [data-ax-label="Apple"]
         aria-selected="false" [aria-disabled="true"] [hidden]>…</div>
    <div role="group" aria-label="Fruit" [hidden]><div aria-hidden="true">Fruit</div>…options…</div>
    <div role="presentation">No options</div>   <!-- empty state: never an option -->
  </div>
</ax-combobox-layer>
```

- Options are `[role="option"]` (configurable) in DOM order; one that is `[hidden]` or inside
  a `[hidden]` group is not navigable. Each needs an `id`. `aria-disabled="true"` options are
  skipped by keys, pointer and typeahead. Typeahead reads `data-ax-label`, else the text.
- Written state: `data-ax-highlighted` on the active option, `data-ax-keyboard` while that
  highlight came from keyboard input (draw the in-row focus ring — useKeyboardHighlight), and
  `aria-activedescendant` on every field while the list is open. Keyboard moves scroll the
  option into view; pointer moves never do, and after a keyboard scroll the row under a still
  pointer takes the highlight only once the pointer really moves (useHighlightedOptionScroll).
- A button trigger is the layer's native invoker (`popovertarget`), so `popover="auto"` light
  dismiss treats it as inside; a text input cannot be an invoker, so its list is
  `popover="manual"` + `data-ax-outside-press="dismiss"` (the shared stack closes it when a
  press starts **and** ends outside the layer and its anchor). Both close on Escape through
  the stack (`data-ax-escape="none"` opts out) and never take focus.

```ts
import {createCombobox, handleComboboxKey} from '../../elements/runtime/combobox';
const combo = createCombobox({listbox, fields: () => [trigger, searchInput], isOpen: () => layer.isOpen,
  onActivate: (option, event) => commit(option)});
const detach = combo.attach();                       // pointer highlight, focus keeping, click activation
trigger.addEventListener('keydown', (e) => {
  if (typeahead.onKeyDown(e)) return e.preventDefault();   // combo.typeahead({onMatch, getCurrent})
  handleComboboxKey(combo, e, {kind: 'select', open: () => layer.show({source: trigger}),
    close: () => layer.hide(), activate: (o) => commit(o)});
});
```

| `createCombobox(config)` → | |
|---|---|
| `options()`, `enabled()`, `isDisabled(o)` | navigable options (not hidden) / not aria-disabled |
| `highlighted()`, `highlightedIndex()`, `selected()`, `first()`, `last()` | |
| `highlight(option \| null, source?)` | `'keyboard'` (scrolls, may ring), `'pointer'` (never scrolls), `'program'` |
| `move(±1, {wrap?, source?})` | among enabled options; clamps unless `wrap` |
| `sync()` | re-write aria-activedescendant; drop a highlight that was filtered out |
| `typeahead({onMatch, getCurrent})` | `createTypeahead` over `options()` (Selector commits closed, highlights open; MultiSelector opens) |
| `attach()` | listbox listeners; returns detach |

`handleComboboxKey(combo, event, config)` — the keyboard map; returns true when it handled the
key. IME composition is never a command; `defaultPrevented` keys are left alone.

| `config` | |
|---|---|
| `kind: 'select'` | useCombobox / useMultiCombobox: ↓/↑ open (first / last) then move, clamped; Enter/Space open on the selection or activate (`isMultiple`: toggle, list stays open); Home/End/PageUp/PageDown first/last; Escape closes; Tab closes and moves on; Delete/Backspace call `clear` on a closed list without search; printable keys call `seed` (`hasSearch`) |
| `kind: 'editable'` | a text field (getFieldProps, BaseTypeahead): closed ↓ calls `open`; open ↓/↑ wrap, Enter activates (never submits), Escape closes, Tab closes, Home/End first/last; chords other than Escape are the field's |
| `hasSearch` / `isTextField` | a popup search row owns typing: Space, Home/End and characters stay with the text; PageUp/PageDown are the first/last substitutes |
| `open(key)`, `close(reason)`, `activate(option, event)` | the owner's actions |
| `openHighlight(key)` | `'first' \| 'last' \| 'selected' \| 'none'` after a key opened the list |
| `clear`, `hasValue`, `seed`, `isMultiple`, `wrap`, `isDisabled` | |

`<ax-combobox-layer>` (`ComboboxLayerElement extends LayerElement`): the list's layer root —
Escape `close` for both popover kinds, outside press `native` (auto) or `dismiss`
(`data-ax-outside-press`), presses on its anchor and on `data-ax-inside` ids count as inside.
`comboboxLayer(owner, id)` finds one. `keepLayerOpenFor(root, () => layer)`: buttons marked
`data-ax-keep-open` (or inside a marked wrapper — a clear or status button in the trigger box)
become the layer's invoker for the press, so pressing them does not light-dismiss the list
(useKeepLayerOpenProps).
