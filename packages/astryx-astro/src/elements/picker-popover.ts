/**
 * `<ax-picker-popover>` — the layer of a text-entry picker (DateInput's calendar,
 * DateTimeInput's time list), a `<ax-popover>` that a text input owns.
 *
 * Port of the usePopover + Layer/outsidePress.ts wiring in @astryxdesign/core
 * DateInput/DateInput.tsx and DateTimeInput/DateTimeInput.tsx: a text input cannot be an
 * invoker and the browser's light dismiss would count a press in it as outside, so the layer
 * is `popover="manual"` and joins the shared stack as an outside-press layer
 * (runtime/layerStack: a press that starts AND ends outside dismisses it). A press inside the
 * owning field (`data-ax-owner="<field box id>"`, Astryx `isPressInsideOwnedLayer`) or on a
 * label of its input (`data-ax-label-for="<input id>"`: a press there focuses the input, which
 * would otherwise close the layer and reopen it on the same press) is inside. With
 * `popover="auto"` (DateTimeInput's calendar) the browser light-dismisses as usual.
 *
 * Escape goes through the stack (`data-ax-escape` as for `<ax-popover>`); focus returns to
 * the opener when focus was inside and would be lost (LayerElement).
 *
 * API: `showPicker({autoFocus, source})` — `autoFocus: false` is usePopover's
 * `show({skipAutoFocus: true})` (focus stays in the input); plus everything
 * `<ax-popover>` has (`show`, `hide`, `isOpen`, `astryx-open-change`).
 */
import {PopoverElement} from './runtime/popover';
import {defineElement} from './runtime/layer';
import type {LayerOutsidePress} from './runtime/layerStack';

function isLabelFor(target: EventTarget, inputId: string | null): boolean {
  const node = target as Partial<HTMLLabelElement>;
  return inputId != null && node.nodeType === 1 && node.localName === 'label' && (node.control as HTMLElement | null | undefined)?.id === inputId;
}

export class PickerPopoverElement extends PopoverElement {
  /** The field box that owns this layer (presses inside it are inside the layer). */
  get owner(): HTMLElement | null {
    const id = this.getAttribute('data-ax-owner');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  protected outsidePressMode(): LayerOutsidePress {
    // A sheet covers the viewport: its own press beside the panel dismisses it.
    if (this.isSheetSurface) return 'ignore';
    return this.getAttribute('popover') === 'auto' ? 'native' : 'dismiss';
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    if (super.isInsidePress(path)) return true;
    const owner = this.owner;
    if (owner && path.includes(owner)) return true;
    const inputId = this.getAttribute('data-ax-label-for');
    return path.some((target) => isLabelFor(target, inputId));
  }

  /** Open; `autoFocus: false` keeps focus where it is (the input). */
  showPicker({autoFocus = true, source = null}: {autoFocus?: boolean; source?: HTMLElement | null} = {}): boolean {
    if (autoFocus) this.removeAttribute('data-ax-autofocus');
    else this.setAttribute('data-ax-autofocus', 'false');
    return this.show({source, reason: 'toggle'});
  }
}

defineElement('ax-picker-popover', PickerPopoverElement);

declare global {
  interface HTMLElementTagNameMap { 'ax-picker-popover': PickerPopoverElement }
}
