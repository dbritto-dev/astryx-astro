/**
 * Keep a server-rendered indicator (CheckboxInput, RadioListItem) in step with its native
 * input. The slot is `[data-ax-indicator-slot]` (see components/CheckboxInput/_IndicatorStates.astro):
 *
 *  - `checkbox` / `radio`: the built-in indicator. Its state is `data-checked` on the root
 *    (`checked` | `indeterminate`, absent when unchecked) and, for the radio, the dot it draws
 *    only while selected. Morphed in place so the root keeps its transitions.
 *  - `templates`: a theme replacement, rendered per state into sibling
 *    `<template data-ax-indicator-state="…">`s. The live element takes the template's
 *    attributes and children (or is replaced when the tag differs); a state that draws
 *    nothing empties the slot.
 */
export type IndicatorStateName = 'unchecked' | 'checked' | 'indeterminate';

function morph(current: Element, next: Element): void {
  for (const attr of [...current.attributes]) if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  for (const attr of [...next.attributes]) if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  if (current.innerHTML !== next.innerHTML) current.replaceChildren(...next.childNodes);
}

export function setIndicatorState(slot: HTMLElement | null, state: IndicatorStateName): void {
  if (!slot) return;
  const mode = slot.getAttribute('data-ax-indicator-slot');
  if (mode === 'templates') {
    const template = slot.parentElement?.querySelector<HTMLTemplateElement>(`:scope > template[data-ax-indicator-state="${state}"]`);
    if (!template) return;
    const next = template.content.firstElementChild?.cloneNode(true) as Element | undefined;
    const current = slot.firstElementChild;
    if (!next) { slot.replaceChildren(); return; }
    if (!current) { slot.append(next); return; }
    if (current.tagName !== next.tagName) { current.replaceWith(next); return; }
    morph(current, next);
    return;
  }
  const root = slot.firstElementChild as HTMLElement | null;
  if (!root) return;
  const isChecked = state !== 'unchecked';
  if (mode === 'checkbox') {
    if (isChecked) root.setAttribute('data-checked', state);
    else root.removeAttribute('data-checked');
    return;
  }
  if (mode === 'radio') {
    if (isChecked) root.setAttribute('data-checked', 'checked');
    else root.removeAttribute('data-checked');
    const dot = root.querySelector(':scope > .astryx-radio-indicator-dot');
    // RadioIndicator draws the dot only while selected (and only without replacement content).
    const hasContent = root.children.length > 0 && !dot;
    if (isChecked && !dot && !hasContent) {
      const el = root.ownerDocument.createElement('span');
      el.className = 'astryx-radio-indicator-dot';
      const size = root.getAttribute('data-size');
      if (size) el.setAttribute('data-size', size);
      root.append(el);
    } else if (!isChecked && dot) dot.remove();
  }
}
