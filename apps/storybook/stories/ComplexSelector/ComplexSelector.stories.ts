import ComplexSelector from 'astryx-astro/components/ComplexSelector/ComplexSelector.astro';
import Demo from 'astryx-astro/components/ComplexSelector/ComplexSelector.demo.astro';
import demoSource from 'astryx-astro/components/ComplexSelector/ComplexSelector.demo.astro?raw';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

// The content is the caller's own markup (raw HTML in the default slot). Elements with
// `data-ax-commit` commit their value on click, `data-ax-commit-label` sets the trigger text and
// `data-ax-close` closes the popup.
const colours = [
  ['red', 'Red', '#d33'],
  ['orange', 'Orange', '#e80'],
  ['green', 'Green', '#2a6'],
  ['teal', 'Teal', '#198'],
  ['blue', 'Blue', '#36c'],
  ['purple', 'Purple', '#84c'],
] as const;
const swatch = (css: string) => `display:inline-block;width:0.875rem;height:0.875rem;border-radius:50%;background:${css}`;
const option = 'display:flex;align-items:center;gap:var(--spacing-2);width:100%;padding:var(--spacing-1) var(--spacing-2);border:0;border-radius:var(--radius-element);background:transparent;color:var(--color-text-primary);font:inherit;text-align:start;cursor:pointer';
const colourList = (selected: string, groupLabel: string) =>
  `<div role="radiogroup" aria-label="${groupLabel}" style="display:grid;gap:var(--spacing-1);min-width:180px">`
  + colours.map(([id, label, css]) => `<button type="button" role="radio" aria-checked="${id === selected}" data-ax-commit="${id}" data-ax-commit-label="${label}" data-ax-close style="${option}"><span aria-hidden="true" style="${swatch(css)}"></span>${label}</button>`).join('')
  + '</div>';

const fruits = ['Apple', 'Banana', 'Mango'];
const ripeness = ['Green', 'Ripe', 'Overripe'];
const cell = 'padding:var(--spacing-1) var(--spacing-2);border:var(--border-width) solid var(--color-border);border-radius:var(--radius-element);background:var(--color-background-surface);color:var(--color-text-primary);font:inherit;cursor:pointer';
const matrix = '<table aria-label="Fruit by ripeness" style="border-collapse:separate;border-spacing:var(--spacing-1);font-size:var(--text-label-size)">'
  + `<thead><tr><th scope="col">Fruit</th>${ripeness.map((r) => `<th scope="col">${r}</th>`).join('')}</tr></thead><tbody>`
  + fruits.map((f) => `<tr><th scope="row">${f}</th>${ripeness.map((r) => `<td><button type="button" aria-pressed="${f === 'Mango' && r === 'Ripe'}" aria-label="${f}, ${r}" data-ax-commit='${JSON.stringify({fruit: f, ripeness: r})}' data-ax-commit-label="${f} · ${r}" style="${cell}">${r.slice(0, 1)}</button></td>`).join('')}</tr>`).join('')
  + '</tbody></table>'
  + `<div style="display:flex;justify-content:flex-end;margin-top:var(--spacing-3)"><button type="button" data-ax-close style="${cell}">Done</button></div>`;

const meta = {
  title: 'Form Controls/Complex Selector',
  component: ComplexSelector,
  ...astryx('ComplexSelector'),
  args: {label: 'Accent colour', value: 'teal', triggerLabel: 'Teal', slots: {default: colourList('teal', 'Accent colour')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ComplexSelector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type SelectorHost = HTMLElement & {value: unknown; isOpen: boolean};
const popup = (root: HTMLElement) => root.querySelector<HTMLElement>('[popover]');

/**
 * A click on the trigger (a combobox opening a dialog) opens the popup and moves focus into it;
 * a `data-ax-commit` option commits its value (`astryx-change`), updates the trigger text and,
 * with `data-ax-close`, closes the popup and returns focus. ArrowDown opens it too; Escape closes.
 */
export const Default: Story = {
  args: {description: 'Choose from the brand palette'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<SelectorHost>(canvasElement, 'ax-complex-selector');
    const changes = recordEvents<{value: unknown}>(canvasElement, 'astryx-change');
    const trigger = canvas.getByRole('combobox', {name: /^Accent colour/});
    const layer = popup(canvasElement);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await step('A click opens the dialog with focus inside', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      const dialog = within(canvasElement).getByRole('dialog', {name: 'Accent colour'});
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await waitFor(() => expect(layer!.contains(document.activeElement)).toBe(true));
    });
    await step('An option commits, updates the trigger, closes and returns focus', async () => {
      await userEvent.click(canvas.getByRole('radio', {name: 'Purple'}));
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.map((e) => e.detail.value)).toEqual(['purple']);
      await expect(trigger).toHaveTextContent('Purple');
      await expect(trigger).toHaveFocus();
      await expect(canvas.getByRole('radio', {name: 'Purple', hidden: true})).toHaveAttribute('aria-checked', 'true');
      await expect(canvas.getByRole('radio', {name: 'Teal', hidden: true})).toHaveAttribute('aria-checked', 'false');
      await expect(host.value).toBe('purple');
    });
    await step('ArrowDown opens; Escape closes and returns focus', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });
  },
};

/**
 * Commit targets without `data-ax-close` keep the popup open (here object values, with
 * `aria-pressed` re-synced after each commit); a separate `data-ax-close` button closes it.
 */
export const KeepOpen: Story = {
  args: {label: 'Fruit and ripeness', value: {fruit: 'Mango', ripeness: 'Ripe'}, triggerLabel: 'Mango · Ripe', slots: {default: matrix}},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-complex-selector');
    const changes = recordEvents<{value: unknown}>(canvasElement, 'astryx-change');
    const trigger = canvas.getByRole('combobox', {name: /^Fruit and ripeness/});
    const layer = popup(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    const apple = canvas.getByRole('button', {name: 'Apple, Green'});
    await userEvent.click(apple);
    await expect(changes.at(-1)?.detail.value).toEqual({fruit: 'Apple', ripeness: 'Green'});
    await expect(isShowing(layer)).toBe(true);
    await expect(apple).toHaveAttribute('aria-pressed', 'true');
    await expect(canvas.getByRole('button', {name: 'Mango, Ripe'})).toHaveAttribute('aria-pressed', 'false');
    await expect(trigger).toHaveTextContent('Apple · Green');
    await userEvent.click(canvas.getByRole('button', {name: 'Done'}));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** No trigger label: the placeholder shows. */
export const Placeholder: Story = {args: {value: undefined, triggerLabel: undefined, placeholder: 'Pick a colour…'}};

export const WithStartIcon: Story = {args: {startIcon: 'search'}};

export const Secondary: Story = {args: {variant: 'secondary'}};

export const Ghost: Story = {args: {variant: 'ghost'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** Error status: the trigger is `aria-invalid` and described by the attached message. */
export const ErrorStatus: Story = {
  args: {value: undefined, triggerLabel: undefined, status: {type: 'error', message: 'Pick a colour'}},
  play: async ({canvas}) => {
    const trigger = canvas.getByRole('combobox', {name: /^Accent colour/});
    await expect(trigger).toBeInvalid();
    await expect(trigger).toHaveAccessibleDescription('Pick a colour');
  },
};

export const WarningStatus: Story = {args: {variant: 'secondary', status: {type: 'warning', message: 'Low contrast on dark surfaces'}}};

/** Success status through the status icon's tooltip (`statusVariant="tooltip"`). */
export const SuccessTooltip: Story = {args: {status: {type: 'success', message: 'Matches the brand palette'}, statusVariant: 'tooltip'}};

/** Focusable (`aria-disabled`) but never opens, by click or ArrowDown. */
export const Disabled: Story = {
  args: {isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-complex-selector');
    const trigger = canvas.getByRole('combobox', {name: /^Accent colour/});
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(popup(canvasElement))).toBe(false);
  },
};

/** Busy: a spinner and `aria-busy` on the trigger. */
export const Loading: Story = {
  args: {isLoading: true, triggerLabel: 'Saving…'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('combobox', {name: /^Accent colour/})).toHaveAttribute('aria-busy', 'true');
  },
};

/**
 * The `trigger` slot (Astryx `renderTrigger`): the slot's first button becomes the opener, a
 * combobox named by the label; no field, status or chevron renders.
 */
export const CustomTrigger: Story = {
  args: {
    label: 'Assignee',
    value: undefined,
    triggerLabel: undefined,
    slots: {
      trigger: `<button type="button" style="${cell}">Assign</button>`,
      default: `<div style="display:grid;gap:var(--spacing-1)"><button type="button" data-ax-commit="ada" data-ax-commit-label="Ada Lovelace" data-ax-close style="${option}">Ada Lovelace</button><button type="button" data-ax-commit="grace" data-ax-commit-label="Grace Hopper" data-ax-close style="${option}">Grace Hopper</button></div>`,
    },
  },
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-complex-selector');
    const changes = recordEvents<{value: unknown}>(canvasElement, 'astryx-change');
    const trigger = canvas.getByRole('combobox', {name: 'Assignee'});
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(popup(canvasElement))).toBe(true));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(canvas.getByRole('button', {name: 'Grace Hopper'}));
    await waitFor(() => expect(isShowing(popup(canvasElement))).toBe(false));
    await expect(changes.map((e) => e.detail.value)).toEqual(['grace']);
  },
};

/** `placement="above"`: the popup opens above the trigger. */
export const PlacementAbove: Story = {args: {placement: 'above'}, parameters: {layout: 'centered'}};

/** `placement="end"`, aligned to the trigger's start. */
export const PlacementEnd: Story = {args: {placement: 'end', alignment: 'start'}, parameters: {layout: 'centered'}};

/** Rendered open (`isDefaultOpen`): the docs page shows it in its own frame so the layer cannot cover the page. */
export const DefaultOpen: Story = {
  args: {isDefaultOpen: true},
  parameters: {docs: {story: {inline: false, height: '360px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-complex-selector');
    await waitFor(() => expect(isShowing(popup(canvasElement))).toBe(true));
  },
};
