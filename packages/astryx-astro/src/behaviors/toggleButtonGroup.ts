/**
 * data-ax-toggle-button-group — ToggleButtonGroup selection by `value`
 * (@astryxdesign/core ToggleButton/ToggleButtonGroup.tsx `toggle`, contract #23).
 *
 * Members are the ToggleButtons with a value (`data-ax-value`) whose nearest group, inside
 * the same layer, is this one. The server stamps the initial selection; afterwards the
 * group owns it. Activating an enabled member computes the next value exactly as Astryx:
 *   single (`data-ax-type="single"`): the member's value, or null when it was selected;
 *   multiple: the value list with the member's value toggled (order of selection kept).
 * The group dispatches `astryx-change` (bubbles, composed, cancelable) with
 * `detail: {value}` — Astryx onChange(value) — and reflects the new selection on its
 * members unless the event is cancelled.
 *
 * Imperative API on the group element: `value` (get / set; setting does not dispatch).
 * single → string | null, multiple → string[].
 */
import {defineBehavior} from '../elements/behavior';
import {ownerGroup, setPressed} from './toggleButton';

export type ToggleGroupValue = string | null | string[];

const members = (group: HTMLElement) =>
  [...group.querySelectorAll<HTMLElement>('.astryx-toggle-button[data-ax-value]')].filter((m) => ownerGroup(m) === group);

const isMultiple = (group: HTMLElement) => group.getAttribute('data-ax-type') === 'multiple';

function readValue(group: HTMLElement): ToggleGroupValue {
  let order: string[] = [];
  try { order = JSON.parse(group.getAttribute('data-ax-value-order') ?? '[]'); } catch { order = []; }
  const pressed = members(group).filter((m) => m.getAttribute('aria-pressed') === 'true').map((m) => m.getAttribute('data-ax-value')!);
  if (!isMultiple(group)) return pressed[0] ?? null;
  // Keep the caller's order (Astryx appends a newly selected value), then any others.
  return [...order.filter((v) => pressed.includes(v)), ...pressed.filter((v) => !order.includes(v))];
}

function writeValue(group: HTMLElement, value: ToggleGroupValue) {
  const selected = new Set(Array.isArray(value) ? value : value != null ? [value] : []);
  for (const m of members(group)) setPressed(m, selected.has(m.getAttribute('data-ax-value')!));
  if (Array.isArray(value)) group.setAttribute('data-ax-value-order', JSON.stringify(value));
}

defineBehavior('toggle-button-group', (group) => {
  const onClick = (event: MouseEvent) => {
    const member = (event.target as Element | null)?.closest<HTMLElement>('.astryx-toggle-button[data-ax-value]');
    if (!member || ownerGroup(member) !== group) return;
    if (member.matches(':disabled') || member.getAttribute('aria-disabled') === 'true') return;
    // Astryx runs a caller onClick first; the group toggle itself is never cancelled by it.
    event.preventDefault();
    const itemValue = member.getAttribute('data-ax-value')!;
    const current = readValue(group);
    let next: ToggleGroupValue;
    if (Array.isArray(current)) next = current.includes(itemValue) ? current.filter((v) => v !== itemValue) : [...current, itemValue];
    else next = current === itemValue ? null : itemValue;
    const change = new CustomEvent<{value: ToggleGroupValue}>('astryx-change', {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail: {value: next},
    });
    if (group.dispatchEvent(change)) writeValue(group, next);
  };
  group.addEventListener('click', onClick);
  Object.defineProperty(group, 'value', {
    configurable: true,
    get: () => readValue(group),
    set: (value: ToggleGroupValue) => writeValue(group, value),
  });
  return () => {
    group.removeEventListener('click', onClick);
    delete (group as unknown as Record<string, unknown>).value;
  };
});
