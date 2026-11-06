/**
 * Disabled-but-focusable controls stay inert (AST-085, contract #2).
 *
 * Port of @astryxdesign/core utils/disabledInteraction.ts as ONE capture-phase document
 * listener instead of props on every control: a click on (or inside) an
 * `aria-disabled="true"` control is cancelled and stopped before any handler runs — native
 * `disabled` dispatches no click at all — and Enter/Space keydowns are cancelled so they
 * never synthesize one (that click would reach a wrapping invoker such as a popover trigger,
 * and `popovertarget` activation is cancelled with it). Other keys still reach the control.
 *
 * Applies to controls only (`button, a, input, select, textarea, summary, [role],
 * [tabindex]`), so an `aria-disabled` landmark or group does not swallow its content's
 * clicks. Import once from any component that renders `aria-disabled` controls; it is
 * idempotent and SSR-safe.
 */
const CONTROL = 'button, a, input, select, textarea, summary, [role], [tabindex]';
const LISTENING = Symbol.for('astryx-astro/disabled-interaction/v1');

/** The aria-disabled control `target` is in, if any. */
export function disabledControlOf(target: EventTarget | null): HTMLElement | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('[aria-disabled="true"]') : null;
  return el && el.matches(CONTROL) ? el : null;
}

function onClick(event: MouseEvent) {
  if (!disabledControlOf(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (!disabledControlOf(event.target)) return;
  event.preventDefault();
}

/** Install the listeners on a document (the page's own document is installed on import). */
export function installDisabledInteraction(doc: Document = document): void {
  const holder = doc as Document & {[LISTENING]?: true};
  if (holder[LISTENING]) return;
  Object.defineProperty(holder, LISTENING, {value: true});
  doc.addEventListener('click', onClick, true);
  doc.addEventListener('keydown', onKeyDown, true);
}

if (typeof document !== 'undefined') installDisabledInteraction(document);
