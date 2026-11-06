/**
 * `<ax-nav-menu>` — the hover-opened navigation popover of TopNavMenu, TopNavMegaMenu,
 * TopNavHeading / SideNavHeading menus and a collapsed SideNavItem's flyout, plus the key
 * behaviour of NavHeadingMenu (`data-ax-nav-menu-keys`).
 *
 * Ports @astryxdesign/core hooks/useMenuHover.ts as those components use it (through
 * runtime/menu.ts `createMenuHover`: hover intent, the click guard after a hover open, reopen
 * suppression, the safe triangle) on Popover/usePopover.tsx (`<ax-popover>`: `popover="auto"`
 * light dismiss, `aria-expanded` sync, Tab containment for an `aria-modal` surface, focus
 * return, the shared Escape stack), and the Enter/Space activation NavHeadingMenu /
 * TopNavMenu add to useListFocus.
 *
 * Markup contract (server-rendered, ids from uid()):
 *   <button id="T" popovertarget="L" aria-haspopup="true" aria-expanded="false" aria-controls="L">
 *   <ax-nav-menu id="L" popover="auto" class="ax-layer …" data-ax-anchor="<anchor id>"
 *     data-ax-trigger="T" [data-ax-hover-area="<id>"] data-ax-autofocus="false"
 *     [data-ax-show-delay] [data-ax-hide-delay] [data-ax-click-guard] [data-ax-hover="false"]
 *     [data-ax-owns-focus="false"] [data-ax-focus-items="<selector>"]
 *     [data-ax-close-on-select] [data-ax-close-on-click] data-placement data-align>
 *     <div class="astryx-popover …">…content…</div>
 *   </ax-nav-menu>
 * The trigger is the layer's native invoker, so without JS a click still opens it and a press
 * on it is never a light dismissal. With JS the click is taken over (useMenuHover with a
 * `popoverId`): a keyboard activation always opens and lands in the menu, a click opens and
 * focuses it (`data-ax-owns-focus="false"`: the popover's own initial focus, the first content
 * control), and a click within `data-ax-click-guard` ms (default 500) of a hover open pins the
 * menu instead of closing it. `mouseenter` on the trigger (or the hover area: a whole heading)
 * opens after `data-ax-show-delay` (150) under a hovering pointer, a hover-opened menu closes
 * `data-ax-hide-delay` (200) after the pointer leaves both (the safe triangle keeps it while
 * the pointer heads for it). A click on the hover area outside its links opens it too
 * (TopNavHeading's whole-heading trigger).
 *
 * A `[data-ax-nav-menu-close]` control inside (the heading copy atop a heading menu) closes it
 * and refocuses the trigger.
 * Selection: `data-ax-close-on-select` closes after an enabled `[role="menuitem"]` acts
 * (NavHeadingCloseContext); `data-ax-close-on-click` after any click inside (the rail flyout).
 * Escape (shared stack) closes it; focus returns to the trigger when it was inside.
 * Events: `astryx-open-change` `{isOpen, reason}` (reason `hover` for hover opens/closes).
 *
 * `data-ax-nav-menu-keys` on a `[data-astryx-roving]` menu: Enter / Space on a focused
 * `[role="menuitem"]` clicks it (a `<div>` row has no native activation; a link row navigates).
 *
 * Deferred (touch extras): press-drag-release (useMenuPress) and the touch-action switch.
 */
import {defineBehavior} from './behavior';
import {FOCUSABLE_SELECTOR, isImeKeyEvent} from './runtime/dom';
import {defineElement, type OpenChangeReason} from './runtime/layer';
import {createMenuHover, type MenuHover} from './runtime/menu';
import {focusForLastInput} from './runtime/modality';
import {PopoverElement} from './runtime/popover';
import {onRovingKeyDown} from './runtime/roving';

const DEFAULT_FOCUS_ITEMS = '[role="menuitem"]:not([aria-disabled="true"])';

function numberAttr(el: Element, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isDisabled(el: Element | null): boolean {
  return el == null || el.matches(':disabled, [aria-disabled="true"]');
}

export class NavMenuElement extends PopoverElement {
  #hover: MenuHover | null = null;
  #wired: Array<() => void> = [];
  #skipAutoFocus = false;

  get trigger(): HTMLElement | null {
    const id = this.getAttribute('data-ax-trigger');
    return id ? this.ownerDocument.getElementById(id) : null;
  }

  get hoverArea(): HTMLElement | null {
    const id = this.getAttribute('data-ax-hover-area');
    return (id ? this.ownerDocument.getElementById(id) : null) ?? this.trigger;
  }

  get #ownsFocus(): boolean {
    return this.getAttribute('data-ax-owns-focus') !== 'false';
  }

  connectedCallback(): void {
    super.connectedCallback();
    queueMicrotask(() => { if (this.isConnected) this.#wire(); });
  }

  disconnectedCallback(): void {
    for (const off of this.#wired.splice(0)) off();
    this.#hover?.clear();
    this.#hover = null;
    super.disconnectedCallback();
  }

  /** Focus the first item (`data-ax-focus-items`), else the menu / surface itself. */
  focusMenu(): void {
    const surface = this.surface;
    if (!surface) return;
    const selector = this.getAttribute('data-ax-focus-items') ?? DEFAULT_FOCUS_ITEMS;
    const first = [...surface.querySelectorAll<HTMLElement>(selector)].find((el) => !el.closest('[inert], [hidden]'));
    if (first) {
      focusForLastInput(first);
      return;
    }
    const menu = surface.querySelector<HTMLElement>('[role="menu"]') ?? surface;
    if (!menu.hasAttribute('tabindex')) menu.setAttribute('tabindex', '-1');
    focusForLastInput(menu);
  }

  #focusFirstControl(): void {
    const surface = this.surface;
    if (!surface) return;
    for (const el of surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) {
      if (el.closest('[inert]')) continue;
      focusForLastInput(el);
      if (this.ownerDocument.activeElement === el) return;
    }
    focusForLastInput(surface);
  }

  #open(options: {skipAutoFocus?: boolean} = {}, reason: OpenChangeReason = 'toggle'): void {
    this.#skipAutoFocus = options.skipAutoFocus === true;
    const shown = this.show({source: this.trigger, reason});
    if (shown && !this.#skipAutoFocus && !this.#ownsFocus) this.#focusFirstControl();
    this.#skipAutoFocus = false;
  }

  #wire(): void {
    if (this.#wired.length) return;
    const on = <K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.#wired.push(() => el.removeEventListener(type, fn as EventListener));
    };
    const trigger = this.trigger;
    const area = this.hoverArea;
    const hoverOn = this.getAttribute('data-ax-hover') !== 'false';
    let hoverReason = false;
    const hover = (this.#hover = createMenuHover({
      show: (o) => {
        hoverReason = o?.skipAutoFocus === true && !this.#clicking;
        this.#open(o, hoverReason ? 'hover' : 'toggle');
      },
      hide: () => this.hide(this.#clicking ? 'toggle' : 'hover'),
      isOpen: () => this.isOpen,
      isEnabled: () => hoverOn && !isDisabled(this.trigger),
      showDelay: numberAttr(this, 'data-ax-show-delay', 150),
      hideDelay: numberAttr(this, 'data-ax-hide-delay', 200),
      clickGuardMs: numberAttr(this, 'data-ax-click-guard', 500),
      flyout: () => this.surface,
      focusMenu: this.#ownsFocus ? () => this.focusMenu() : undefined,
      trigger: () => this.trigger,
    }));
    const click = (event: MouseEvent) => {
      if (isDisabled(this.trigger)) return;
      this.#clicking = true;
      try {
        hover.click(event);
      } finally {
        this.#clicking = false;
      }
    };
    if (trigger) {
      // useMenuHover with a popoverId: the invoker's own toggle is replaced by the hook's.
      on(trigger, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        click(event);
      });
    }
    if (area) {
      if (hoverOn) {
        on(area, 'mouseenter', () => hover.triggerEnter());
        on(area, 'mouseleave', (event) => hover.triggerLeave(event));
      }
      if (area !== trigger) {
        // A whole-heading trigger: a press on the heading outside its links toggles the menu.
        on(area, 'click', (event) => {
          const target = event.target as Element | null;
          if (!target || target.closest('a[href], button, [role="button"]') || this.contains(target)) return;
          click(event);
        });
      }
    }
    const surface = this.surface;
    if (surface) {
      if (hoverOn) {
        on(surface, 'mouseenter', () => hover.contentEnter());
        // The panel hiding under a still pointer fires a leave on it: not a real leave (it would
        // clear the reopen suppression and the trigger under the pointer would reopen the menu).
        on(surface, 'mouseleave', (event) => { if (this.isOpen) hover.contentLeave(event); });
      }
      on(surface, 'click', (event) => {
        // The heading copy at the top of a heading menu: a close affordance, not the trigger.
        if ((event.target as Element | null)?.closest('[data-ax-nav-menu-close]')) {
          const hadFocus = this.contains(this.ownerDocument.activeElement);
          this.hide('press');
          const trigger = this.trigger;
          if (hadFocus && trigger) focusForLastInput(trigger);
          return;
        }
        if (this.hasAttribute('data-ax-close-on-click')) {
          this.hide('press');
          return;
        }
        if (!this.hasAttribute('data-ax-close-on-select')) return;
        const row = (event.target as Element | null)?.closest<HTMLElement>('[role="menuitem"]');
        if (!row || !surface.contains(row) || isDisabled(row)) return;
        this.hide('press');
      });
    }
  }

  #clicking = false;

  protected restoreFocusTarget(): HTMLElement | null {
    return this.trigger ?? super.restoreFocusTarget();
  }

  protected isInsidePress(path: ReadonlyArray<EventTarget>): boolean {
    const area = this.hoverArea;
    return super.isInsidePress(path) || (area != null && path.includes(area));
  }

  protected willClose(): void {
    super.willClose();
    this.#hover?.notifyClosed();
  }
}

defineElement('ax-nav-menu', NavMenuElement);

/** NavHeadingMenu / TopNavMenu: Enter and Space activate the focused row (useListFocus + click()). */
defineBehavior('nav-menu-keys', (menu) =>
  onRovingKeyDown(menu, (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (isImeKeyEvent(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = menu.ownerDocument.activeElement as HTMLElement | null;
    if (!focused || focused.getAttribute('role') !== 'menuitem' || !menu.contains(focused)) return;
    event.preventDefault();
    if (event.repeat || isDisabled(focused)) return;
    focused.click();
  }),
);
