import MultiSelector from 'astryx-astro/components/MultiSelector/MultiSelector.astro';
import Demo from 'astryx-astro/components/MultiSelector/MultiSelector.demo.astro';
import demoSource from 'astryx-astro/components/MultiSelector/MultiSelector.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import MultiSelectorForm from './MultiSelectorForm.astro';
import formSource from './MultiSelectorForm.astro?raw';
import MultiSelectorMatrix from './MultiSelectorMatrix.astro';
import matrixSource from './MultiSelectorMatrix.astro?raw';

const columns = ['Name', 'Email', 'Role', 'Team', 'Location', 'Status'];
const tags = ['Bug', 'Feature', 'Docs', 'Performance', 'Security', 'Accessibility', 'Design', 'Infra', 'Testing', 'Refactor', 'Research', 'Support'];

const meta = {
  title: 'Form Controls/Multi Selector',
  component: MultiSelector,
  ...astryx('MultiSelector'),
  args: {label: 'Columns', options: columns, value: ['Name', 'Email']},
} satisfies Meta;
export default meta;

/** Every example from the docs page (MultiSelector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Host = HTMLElement & {values: string[]};
type Change = {values: string[]; change?: {type: string; query: string}};

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-multi-selector')!;
  const trigger = host.querySelector<HTMLButtonElement>('.ax-multi-selector-trigger')!;
  const layer = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-layer')}`);
  return {
    host,
    trigger,
    layer,
    summary: () => host.querySelector('.ax-multi-selector-text')?.textContent?.trim(),
    option: (value: string) => layer!.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!,
    order: () => [...layer!.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-fixed])')].map((o) => o.dataset.value),
    active: (owner: Element = trigger) => document.getElementById(owner.getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-value') ?? null,
  };
};

const announced = (text: string) =>
  waitFor(() => expect([...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' ')).toContain(text));

/**
 * Click or keys open the list; a click, Enter or Space toggles an option and keeps the list
 * open. Selected options move first when the list opens; each change is announced. A letter
 * opens the list on the match; Escape and Tab close.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, summary, option, order, active} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(canvas.getByRole('listbox', {hidden: true})).toHaveAttribute('aria-multiselectable', 'true');
    await expect(summary()).toBe('2 selected');

    await step('A click opens with the selected options first; a click toggles and keeps it open', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await waitFor(() => expect(order().slice(0, 2)).toEqual(['Name', 'Email']));
      await userEvent.click(option('Role'));
      await expect(isShowing(layer)).toBe(true);
      await expect(changes.at(-1)?.detail).toEqual({values: ['Name', 'Email', 'Role']});
      await expect(option('Role')).toHaveAttribute('aria-selected', 'true');
      await announced('3 of 6 selected');
    });

    await step('Enter toggles off and Space toggles on, the list stays open', async () => {
      await userEvent.keyboard('{Home}{ArrowDown}');
      await waitFor(() => expect(active()).toBe('Email'));
      await userEvent.keyboard('{Enter}');
      await expect(host.values).toEqual(['Name', 'Role']);
      await userEvent.keyboard('[Space]');
      await expect(host.values).toEqual(['Name', 'Role', 'Email']);
      await expect(isShowing(layer)).toBe(true);
    });

    await step('Escape closes and keeps focus on the trigger', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(summary()).toBe('3 selected');
    });

    await step('A letter opens the list on the match; Space toggles it; Tab closes', async () => {
      await userEvent.keyboard('t');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(active()).toBe('Team'));
      await userEvent.keyboard('[Space]');
      await expect(host.values).toContain('Team');
      await userEvent.tab();
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });
  },
};

/** A tri-state "Select all" first row: partially selected is spoken through its name. */
export const WithSelectAll: Story = {
  args: {hasSelectAll: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, active} = parts(canvasElement);
    const selectAll = layer!.querySelector<HTMLElement>('[data-ax-select-all-row]')!;
    await expect(selectAll).toHaveAccessibleName('Select all, partially selected');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(active()).toBe('__xds_select_all__'));
    await userEvent.keyboard('{Enter}');
    await expect(host.values).toEqual(columns);
    await expect(selectAll).toHaveAttribute('aria-selected', 'true');
    await expect(selectAll).not.toHaveAttribute('aria-label');
    await announced('All selected');
    await userEvent.keyboard('{Enter}');
    await expect(host.values).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** `hasClear`: the ✕ button (or Delete on the closed trigger) empties the selection. */
export const WithClear: Story = {
  args: {hasClear: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, summary} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    await userEvent.click(canvas.getByRole('button', {name: 'Clear all Columns'}));
    await expect(changes.at(-1)?.detail.values).toEqual([]);
    await expect(summary()).toBe('Select…');
    await expect(isShowing(layer)).toBe(false);
    trigger.focus();
    await userEvent.keyboard('r');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.keyboard('[Space]{Escape}');
    await waitFor(() => expect(host.values).toEqual(['Role']));
    await userEvent.keyboard('{Delete}');
    await waitFor(() => expect(host.values).toEqual([]));
  },
};

/**
 * `hasSearch` and `hasCreate`: the search row takes focus and filters; a query that is not an
 * option's exact label offers `Create "…"`, which Enter takes (`change: {type: 'create'}`).
 */
export const WithSearchAndCreate: Story = {
  args: {label: 'Tags', options: tags, value: [], hasSearch: true, hasCreate: true, triggerDisplay: 'labels', placeholder: 'Add tags'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, option} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const search = canvas.getByRole('combobox', {name: 'Search options', hidden: true});
    const createRow = layer!.querySelector<HTMLElement>('[data-ax-create-row]')!;
    const visible = () => [...layer!.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-fixed])')].filter((o) => !o.hidden).map((o) => o.dataset.value);

    await step('Opening focuses the search row; typing filters', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(search).toHaveFocus());
      await userEvent.keyboard('se');
      await waitFor(() => expect(visible()).toEqual(['Security', 'Research']));
    });

    await step('Create is not offered while an option has the exact label', async () => {
      await userEvent.keyboard('curity');
      await waitFor(() => expect(visible()).toEqual(['Security']));
      await expect(createRow.hidden).toBe(true);
    });

    await step('A query no option matches offers Create; Enter creates it', async () => {
      await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}o');
      await waitFor(() => expect(createRow.hidden).toBe(false));
      await expect(createRow).toHaveTextContent('Create "seo"');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(changes.at(-1)?.detail).toEqual({values: ['seo'], change: {type: 'create', query: 'seo'}}));
      await expect(option('seo')).toHaveAttribute('aria-selected', 'true');
      await expect(search).toHaveValue('');
    });

    await step('Escape closes and returns focus to the trigger', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(host.values).toEqual(['seo']);
    });
  },
};

/** `triggerDisplay="labels"`: the selected labels, comma-separated. */
export const TriggerLabels: Story = {
  args: {triggerDisplay: 'labels', value: ['Name', 'Role', 'Status']},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    await expect(parts(canvasElement).summary()).toBe('Name, Role, Status');
  },
};

/** `triggerDisplay="badges"` with `maxBadges={2}`: two badges, then "+N". */
export const TriggerBadges: Story = {
  args: {triggerDisplay: 'badges', maxBadges: 2, value: ['Name', 'Role', 'Team', 'Status']},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, option} = parts(canvasElement);
    await expect(host.querySelectorAll('.astryx-badge')).toHaveLength(2);
    await expect(host.querySelector('.ax-multi-selector-overflow')).toHaveTextContent('+2');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.click(option('Location'));
    await waitFor(() => expect(host.querySelector('.ax-multi-selector-overflow')).toHaveTextContent('+3'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** Sections, dividers and a disabled option; arrows skip it and select-all keeps it as it is. */
export const GroupedOptions: Story = {
  args: {
    label: 'Teams',
    hasSelectAll: true,
    value: ['mobile', 'infra'],
    options: [
      {type: 'section', title: 'Engineering', options: [{value: 'web', label: 'Web'}, {value: 'mobile', label: 'Mobile'}, {value: 'infra', label: 'Infrastructure', disabled: true}]},
      {type: 'divider'},
      {type: 'section', title: 'Design', options: [{value: 'product', label: 'Product design'}, {value: 'brand', label: 'Brand'}]},
      {type: 'divider'},
      {value: 'other', label: 'Other'},
    ],
  },
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, option, active} = parts(canvasElement);
    await expect(option('infra')).toHaveAttribute('aria-disabled', 'true');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getByRole('group', {name: 'Engineering'})).toBeInTheDocument();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(active()).toBe('web'));
    await userEvent.keyboard('{Home}{Enter}');
    await expect([...host.values].sort()).toEqual(['brand', 'infra', 'mobile', 'other', 'product', 'web']);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** The row checkbox at the end of each option. */
export const IndicatorEnd: Story = {args: {indicatorPosition: 'end', value: ['Team']}};

export const Secondary: Story = {args: {variant: 'secondary'}};

export const Ghost: Story = {args: {variant: 'ghost', value: [], placeholder: 'Filter…'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** Variants × sizes, every status × size, and the tooltip status. */
export const Matrix = composed(MultiSelectorMatrix, {}, {source: matrixSource});

export const ErrorStatus: Story = {
  args: {value: [], status: {type: 'error', message: 'Choose at least one column'}},
  play: async ({canvasElement}) => {
    const {trigger} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-invalid', 'true');
    await expect(trigger).toHaveAccessibleDescription(/Choose at least one column/);
  },
};

export const WithStartIcon: Story = {args: {startIcon: 'viewColumns'}};

/** Disabled with a reason: focusable, never opens, submits nothing. */
export const Disabled: Story = {
  args: {isDisabled: true, disabledMessage: 'Pick a table first', htmlName: 'columns'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveAccessibleDescription(/Pick a table first/);
    await expect(canvasElement.querySelector('input[name="columns"]')).toBeNull();
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
  },
};

/** Read-only: the values are visible and submitted, with no list to open. */
export const ReadOnly: Story = {
  args: {isReadOnly: true, htmlName: 'columns'},
  play: async ({canvasElement}) => {
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-readonly', 'true');
    await expect(trigger).not.toHaveAttribute('aria-haspopup');
    await expect(layer).toBeNull();
    await expect([...canvasElement.querySelectorAll<HTMLInputElement>('input[name="columns"]')].map((i) => i.value)).toEqual(['Name', 'Email']);
  },
};

export const Loading: Story = {
  args: {options: [], value: [], isLoading: true, placeholder: 'Loading…'},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).trigger).toHaveAttribute('aria-busy', 'true');
  },
};

/** No options: the open list shows its empty state. */
export const EmptyOptions: Story = {
  args: {label: 'Nothing to pick', options: [], value: []},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {trigger, layer} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(layer!.querySelector('.astryx-multi-selector-empty-state:not([hidden])')).toHaveTextContent('No options');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/**
 * Rendered open (`isDefaultOpen`): the list is in the top layer from the start. Docs show it
 * in its own frame so it cannot cover the page.
 */
export const Open: Story = {
  args: {isDefaultOpen: true, hasSelectAll: true, value: ['Role']},
  parameters: {docs: {story: {inline: false, height: '400px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {trigger, layer} = parts(canvasElement);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  },
};

/** `presentation="bottom-sheet"`: the list opens as a modal bottom sheet named by the label. */
export const BottomSheet: Story = {
  args: {presentation: 'bottom-sheet', hasSelectAll: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getByRole('dialog', {name: 'Columns'})).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

/** In a form: one hidden input per value under `htmlName`; Reset restores the server values. */
export const InForm = composed(MultiSelectorForm, {
  args: {label: 'Visible columns'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-multi-selector');
    const {host, trigger, layer, option} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    const submitted = () => new FormData(form).getAll('columns');
    await expect(submitted()).toEqual(['Name', 'Email']);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.click(option('Team'));
    await waitFor(() => expect(submitted()).toEqual(['Name', 'Email', 'Team']));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(host.values).toEqual(['Name', 'Email']));
    await expect(submitted()).toEqual(['Name', 'Email']);
  },
}, {controls: ['label'], source: formSource});
