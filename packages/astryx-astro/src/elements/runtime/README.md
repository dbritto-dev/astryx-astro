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
| `typeahead.ts` | utils/typeaheadMatch.ts, hooks/useTypeahead.ts |
| `disabledInteraction.ts` | utils/disabledInteraction.ts (AST-085) |
| `dom.ts` | utils/ime.ts, hooks/focusableSelector.ts, utils/isFocusDetached.ts |

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
syncTabStops}`; `rovingFor(container)`; `syncRovingTabStops(root)`.

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

## `modalOutlet.ts` — top-layer outlets for content that must paint above modals

`supplyModalOutlet(dialog)` after `showModal()`, `withdrawModalOutlet(dialog)` on close,
`getActiveModalOutlet()`, `subscribeModalOutlets(listener)`, `notifyTopLayerEntry()`.
ToastViewport moves into the latest outlet so toasts paint above an open modal. Every modal
surface (Dialog, AlertDialog, Drawer, BottomSheet, Lightbox, MobileNav, CommandPalette) must
supply its `<dialog>` as an outlet while open.

Client-only APIs (import from the element modules in the browser, not from the package index):
`toast()`, `createToastQueue()`, `getToastContext()` (`src/elements/toast.ts`).
