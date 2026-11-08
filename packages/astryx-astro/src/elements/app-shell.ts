/**
 * `<ax-app-shell>` — the responsive state of AppShell. Port of the browser half of
 * @astryxdesign/core AppShell/AppShell.tsx (useMediaQuery on the theme width point, the mobile
 * context, the header-height measurement of `auto`, the skip link, main's keyboard stop while it
 * overflows — observeMainOverflow — and its Tab-only focus ring) and AppShellMobileContext.
 *
 * The attribute contract (other components and consumer CSS read it):
 *   `.astryx-app-shell[data-astryx-shell-mobile="true|false"]` — below `data-ax-breakpoint-px`
 *     (`(width < Npx)`); an inline script sets it before first paint, this element keeps it.
 *   `.astryx-top-nav[data-ax-mobile-bar]` roots get `data-mode="mobile-bar"` while mobile (the
 *     theme hook Astryx's mobile-bar render emits).
 *   `astryx-mobile-change` {isMobile} (bubbling) when it flips.
 *   Leaving mobile closes the shell's drawer (`data-ax-drawer` = its `<dialog>` id), as Astryx
 *   unmounts it; `data-ax-open-drawer` opens it on connect when the shell is mobile.
 *   `--_app-shell-header-height` on the root (height `auto`): the header's height, for the
 *   sticky rail.
 * Main (`role="main"`, tabindex -1) joins the Tab order (tabindex 0) only while `fill` and its
 * content overflows; it draws its focus ring only when a Tab press moved focus onto it
 * (`data-ax-tab-focus`), never for the skip link's programmatic focus.
 *
 * Deferred: the rail's FLIP glide of the content column, scroll-key delegation into main.
 */
import {defineElement} from './runtime/layer';

export interface MobileChangeDetail {
  isMobile: boolean;
}

const Base: typeof HTMLElement = typeof HTMLElement === 'undefined' ? (class {} as typeof HTMLElement) : HTMLElement;

export class AppShellElement extends Base {
  #off: Array<() => void> = [];
  #query: MediaQueryList | null = null;
  #tabAt = 0;

  /** The `.astryx-app-shell` root. */
  get root(): HTMLElement | null {
    return this.querySelector<HTMLElement>(':scope > .astryx-app-shell');
  }

  get main(): HTMLElement | null {
    return this.root?.querySelector<HTMLElement>('.ax-app-shell-main') ?? null;
  }

  get isMobile(): boolean {
    return this.root?.getAttribute('data-astryx-shell-mobile') === 'true';
  }

  /** The shell's mobile drawer host (`<ax-mobile-nav>`). */
  get drawer(): (HTMLElement & {show?: () => boolean; hide?: (r?: string) => void; isOpen?: boolean}) | null {
    const id = this.getAttribute('data-ax-drawer');
    const dialog = id ? this.ownerDocument.getElementById(id) : null;
    return (dialog?.parentElement as HTMLElement | null) ?? null;
  }

  connectedCallback(): void {
    const root = this.root;
    if (!root) return;
    const on = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts);
      this.#off.push(() => target.removeEventListener(type, fn, opts));
    };
    const px = Number(root.getAttribute('data-ax-breakpoint-px'));
    if (px > 0) {
      const query = (this.#query = matchMedia(`(width < ${px}px)`));
      const sync = () => this.#setMobile(query.matches);
      on(query, 'change', sync);
      sync();
    } else {
      this.#setMobile(false);
    }
    // The skip link moves focus explicitly (hash navigation alone does not, everywhere).
    const skip = root.querySelector<HTMLAnchorElement>(':scope > [data-ax-skip-link]');
    if (skip) on(skip, 'click', () => { this.main?.focus(); });
    // Main's focus ring: only for focus a Tab press moved onto it (FR4).
    on(root, 'keydown', ((event: KeyboardEvent) => { if (event.key === 'Tab') this.#tabAt = performance.now(); }) as EventListener, {capture: true});
    on(root, 'pointerdown', () => { this.#tabAt = 0; }, {capture: true});
    const main = this.main;
    if (main) {
      on(main, 'focus', () => {
        const byTab = this.#tabAt > 0 && performance.now() - this.#tabAt < 1000;
        main.toggleAttribute('data-ax-tab-focus', byTab);
      });
      on(main, 'blur', () => main.removeAttribute('data-ax-tab-focus'));
      if (root.getAttribute('data-ax-height') === 'fill') this.#observeOverflow(main);
    }
    if (root.getAttribute('data-ax-height') === 'auto') this.#observeHeader(root);
    if (this.hasAttribute('data-ax-open-drawer') && this.isMobile) {
      queueMicrotask(() => { this.drawer?.show?.(); });
    }
  }

  disconnectedCallback(): void {
    for (const off of this.#off.splice(0)) off();
    this.#query = null;
  }

  #setMobile(isMobile: boolean): void {
    const root = this.root;
    if (!root) return;
    const was = root.getAttribute('data-astryx-shell-mobile') === 'true';
    root.setAttribute('data-astryx-shell-mobile', String(isMobile));
    for (const bar of root.querySelectorAll<HTMLElement>('.astryx-top-nav[data-ax-mobile-bar]')) {
      if (isMobile) bar.setAttribute('data-mode', 'mobile-bar');
      else bar.removeAttribute('data-mode');
    }
    if (!isMobile) {
      const drawer = this.drawer;
      if (drawer?.isOpen) drawer.hide?.('api');
    }
    if (was !== isMobile) {
      this.dispatchEvent(new CustomEvent<MobileChangeDetail>('astryx-mobile-change', {bubbles: true, composed: true, detail: {isMobile}}));
    }
  }

  /** observeMainOverflow: main is a keyboard stop only while its content overflows. */
  #observeOverflow(main: HTMLElement): void {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const overflows = main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1;
      const tabindex = overflows ? '0' : '-1';
      if (main.getAttribute('tabindex') !== tabindex) main.setAttribute('tabindex', tabindex);
      main.toggleAttribute('data-ax-scroll-region-active', overflows);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const ro = new ResizeObserver(schedule);
    ro.observe(main);
    for (const child of main.children) ro.observe(child);
    const mo = new MutationObserver(() => {
      for (const child of main.children) ro.observe(child);
      schedule();
    });
    mo.observe(main, {childList: true, subtree: true, characterData: true});
    schedule();
    this.#off.push(() => { ro.disconnect(); mo.disconnect(); if (frame) cancelAnimationFrame(frame); });
  }

  /** `auto`: the sticky rail sits below the header (`--_app-shell-header-height`). */
  #observeHeader(root: HTMLElement): void {
    const header = root.querySelector<HTMLElement>('[data-ax-app-shell-header]');
    if (!header) return;
    const update = () => root.style.setProperty('--_app-shell-header-height', `${header.getBoundingClientRect().height}px`);
    const ro = new ResizeObserver(update);
    ro.observe(header);
    update();
    this.#off.push(() => ro.disconnect());
  }
}

defineElement('ax-app-shell', AppShellElement);
