/**
 * `data-ax-overlay` — Overlay's small behaviour. Port of the client parts of
 * @astryxdesign/core Overlay/Overlay.tsx (radius sync) and Overlay/useOverlay.tsx (touch
 * toggle through useClickableContainer, controlled visibility).
 *
 * - Copies the first child's border radius onto the wrapper so the scrim clips to it.
 * - Element API on the root: `isOpen` (get/set), `open()`, `close()`, `toggle()`. Setting it
 *   makes the scrim controlled (`data-ax-open` + `inert`), as the `isOpen` prop does.
 * - On a device without hover (`(hover: none)`) a hover-mode scrim is driven by taps
 *   instead (Astryx's touch toggle): hidden until a tap on the surface, a second tap hides
 *   it; taps on nested interactive elements and text selections are ignored.
 */
import {defineBehavior} from '../elements/behavior';

const INTERACTIVE = [
  'button', 'a', 'input', 'select', 'textarea', '[role="button"]', '[role="link"]', '[role="checkbox"]',
  '[role="radio"]', '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="combobox"]', '[role="listbox"]', '[role="slider"]', '[role="spinbutton"]', '[data-pressable-container]',
].join(',');

export interface OverlayElement extends HTMLElement {
  isOpen: boolean;
  open(): void;
  close(): void;
  toggle(force?: boolean): void;
}

function setOpen(scrim: HTMLElement, open: boolean): void {
  scrim.removeAttribute('data-ax-show-on');
  scrim.setAttribute('data-ax-open', String(open));
  scrim.toggleAttribute('inert', !open);
}

defineBehavior('overlay', (root) => {
  const scrim = root.querySelector<HTMLElement>(':scope > .astryx-overlay-scrim');
  if (!scrim) return;
  const first = root.firstElementChild as HTMLElement | null;
  if (first && first !== scrim) {
    const radius = getComputedStyle(first).borderRadius;
    if (radius && radius !== '0px') root.style.borderRadius = radius;
  }

  const el = root as OverlayElement;
  Object.defineProperties(el, {
    isOpen: {
      configurable: true,
      get: () => {
        const state = scrim.getAttribute('data-ax-open');
        if (state != null) return state === 'true';
        return getComputedStyle(scrim).visibility === 'visible';
      },
      set: (value: boolean) => setOpen(scrim, Boolean(value)),
    },
    open: {configurable: true, value: () => setOpen(scrim, true)},
    close: {configurable: true, value: () => setOpen(scrim, false)},
    toggle: {configurable: true, value: (force?: boolean) => setOpen(scrim, force ?? !el.isOpen)},
  });

  // Touch toggle for hover-mode scrims on devices without hover.
  const hoverMode = scrim.getAttribute('data-ax-show-on') === 'hover';
  const noHover = matchMedia('(hover: none)');
  let touchControlled = false;
  const applyTouch = () => {
    if (!hoverMode) return;
    if (noHover.matches && !touchControlled && !scrim.hasAttribute('data-ax-open')) {
      touchControlled = true;
      setOpen(scrim, false);
    } else if (!noHover.matches && touchControlled) {
      touchControlled = false;
      scrim.removeAttribute('data-ax-open');
      scrim.removeAttribute('inert');
      scrim.setAttribute('data-ax-show-on', 'hover');
    }
  };
  const onClick = (e: MouseEvent) => {
    if (!touchControlled) return;
    const selection = document.getSelection();
    if (selection && !selection.isCollapsed && root.contains(selection.anchorNode)) return;
    const target = e.target as Element | null;
    if (!target) return;
    for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
      if (node.matches(INTERACTIVE)) return;
    }
    setOpen(scrim, scrim.getAttribute('data-ax-open') !== 'true');
  };
  applyTouch();
  noHover.addEventListener('change', applyTouch);
  root.addEventListener('click', onClick);
  return () => {
    noHover.removeEventListener('change', applyTouch);
    root.removeEventListener('click', onClick);
  };
});
