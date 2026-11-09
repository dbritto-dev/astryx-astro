/**
 * Small helpers for play functions (`storybook/test` has the rest: expect, userEvent, waitFor,
 * within, fn). Play functions run in the browser against the rendered story, in `storybook dev`,
 * in the static build (on load) and in `pnpm -F storybook test`.
 */

/**
 * Resolve once the page has finished loading. Components treat markup that appears before
 * `load` as part of the page (a Spinner or EmptyState present at load stays silent), and the
 * static build runs plays on load, often before it: a play about content inserted *after* load
 * waits for it first.
 */
export async function pageLoaded(): Promise<void> {
  if (document.readyState === 'complete') return;
  await new Promise((resolve) => window.addEventListener('load', resolve, {once: true}));
}

/** Record every `type` event dispatched inside `root` (astryx-* events bubble). */
export function recordEvents<D = unknown>(root: Element, type: string): CustomEvent<D>[] {
  const events: CustomEvent<D>[] = [];
  root.addEventListener(type, (event) => events.push(event as CustomEvent<D>));
  return events;
}

/** Resolve once `selector` inside `root` matches an element whose custom element is defined and upgraded. */
export async function upgraded<T extends Element = Element>(root: ParentNode, selector: string): Promise<T> {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`no ${selector} in the story`);
  await customElements.whenDefined(element.localName);
  return element;
}

/** Is this popover / dialog showing (top layer)? */
export const isShowing = (element: Element | null) =>
  element != null && (element.matches(':popover-open') || (element instanceof HTMLDialogElement && element.open));
