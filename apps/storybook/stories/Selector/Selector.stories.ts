import Selector from 'astryx-astro/components/Selector/Selector.astro';
import Demo from 'astryx-astro/components/Selector/Selector.demo.astro';
import demoSource from 'astryx-astro/components/Selector/Selector.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import SelectorCustomRender from './SelectorCustomRender.astro';
import customRenderSource from './SelectorCustomRender.astro?raw';
import SelectorForm from './SelectorForm.astro';
import formSource from './SelectorForm.astro?raw';
import SelectorMatrix from './SelectorMatrix.astro';
import matrixSource from './SelectorMatrix.astro?raw';

const fruit = ['Apple', 'Banana', 'Cherry', 'Durian', 'Elderberry', 'Fig', 'Grape'];
const countries = [
  'Argentina', 'Australia', 'Austria', 'Belgium', 'Bolivia', 'Brazil', 'Canada', 'Chile', 'China', 'Colombia', 'Costa Rica',
  'Denmark', 'Ecuador', 'Finland', 'France', 'Germany', 'India', 'Ireland', 'Italy', 'Japan', 'Mexico', 'Peru', 'Portugal',
  'Spain', 'Sweden', 'Uruguay',
];

const meta = {
  title: 'Form Controls/Selector',
  component: Selector,
  ...astryx('Selector'),
  args: {label: 'Fruit', options: fruit, value: 'Cherry'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Selector.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Host = HTMLElement & {value: string | null};

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-selector')!;
  const trigger = host.querySelector<HTMLButtonElement>('.ax-selector-trigger')!;
  const layer = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-layer')}`);
  return {
    host,
    trigger,
    layer,
    label: () => host.querySelector('.ax-selector-label')?.textContent?.trim(),
    option: (value: string) => layer!.querySelector<HTMLElement>(`[role="option"][data-value="${value}"]`)!,
    /** The value of the option named by `aria-activedescendant` on `owner` (the trigger by default). */
    active: (owner: Element = trigger) => document.getElementById(owner.getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-value') ?? null,
  };
};

/**
 * A click toggles the list (focus stays on the trigger). Keyboard: ↓ opens on the first option,
 * ↑ on the last, Enter on the selection; arrows move (clamped), Home/End jump, Enter or Space
 * picks and closes, Escape closes. A letter on the closed trigger selects the match.
 */
export const Default: Story = {
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer, label, option, active} = parts(canvasElement);
    const changes = recordEvents<{value: string | null}>(canvasElement, 'astryx-change');
    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await step('A click opens on the selection, focus stays on the trigger; a second click closes', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await waitFor(() => expect(active()).toBe('Cherry'));
      await expect(option('Cherry')).toHaveAttribute('aria-selected', 'true');
      await expect(trigger).toHaveFocus();
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await expect(trigger).not.toHaveAttribute('aria-activedescendant');
    });

    await step('ArrowDown opens on the first option; arrows, Home and End move; Enter picks', async () => {
      trigger.focus();
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(active()).toBe('Apple'));
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      await waitFor(() => expect(active()).toBe('Cherry'));
      await userEvent.keyboard('{End}{ArrowDown}');
      await waitFor(() => expect(active()).toBe('Grape'));
      await userEvent.keyboard('{Home}{ArrowUp}');
      await waitFor(() => expect(active()).toBe('Apple'));
      await userEvent.keyboard('{End}{ArrowUp}{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.map((e) => e.detail.value)).toEqual(['Fig']);
      await expect(label()).toBe('Fig');
      await expect(option('Fig')).toHaveAttribute('aria-selected', 'true');
      await expect(trigger).toHaveFocus();
    });

    await step('ArrowUp opens on the last option; Escape closes and keeps focus', async () => {
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(active()).toBe('Grape'));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
    });

    await step('Enter opens on the selection; Space picks', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(active()).toBe('Fig'));
      await userEvent.keyboard('{ArrowUp}[Space]');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(host.value).toBe('Elderberry');
    });

    await step('A letter on the closed trigger selects the match', async () => {
      await userEvent.keyboard('b');
      await waitFor(() => expect(label()).toBe('Banana'));
      await expect(isShowing(layer)).toBe(false);
      await expect(changes.at(-1)?.detail.value).toBe('Banana');
    });
  },
};

/** `hasClear`: the ✕ button (or Delete on the closed trigger) empties the value. */
export const WithClear: Story = {
  args: {hasClear: true},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer, label} = parts(canvasElement);
    const changes = recordEvents<{value: string | null}>(canvasElement, 'astryx-change');
    const clear = canvas.getByRole('button', {name: 'Clear Fruit'});

    await step('The clear button empties the value without opening the list', async () => {
      await userEvent.click(clear);
      await expect(changes.at(-1)?.detail.value).toBeNull();
      await expect(host.value).toBeNull();
      await expect(label()).toBe('Select…');
      await expect(clear.hidden).toBe(true);
      await expect(isShowing(layer)).toBe(false);
    });

    await step('Delete clears a closed clearable selector', async () => {
      trigger.focus();
      await userEvent.keyboard('a');
      await waitFor(() => expect(host.value).toBe('Apple'));
      await userEvent.keyboard('{Delete}');
      await waitFor(() => expect(host.value).toBeNull());
    });
  },
};

/**
 * `hasSearch`: typing on the trigger opens the list, moves focus to the search row and seeds
 * the query; the list filters as you type, shows its empty state on no match, and Escape
 * closes, resets the query and returns focus to the trigger.
 */
export const WithSearch: Story = {
  args: {label: 'Country', options: countries, value: null, hasSearch: true, placeholder: 'Select a country'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer, active} = parts(canvasElement);
    const search = canvas.getByRole('combobox', {name: 'Search options', hidden: true}) as HTMLInputElement;
    const visible = () => [...layer!.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => !o.hidden).map((o) => o.dataset.value);
    await expect(trigger).not.toHaveAttribute('role');

    await step('A key on the trigger opens the list and seeds the search', async () => {
      trigger.focus();
      await userEvent.keyboard('p');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(search).toHaveFocus());
      await expect(search).toHaveValue('p');
      await waitFor(() => expect(search).toHaveAttribute('aria-expanded', 'true'));
    });

    await step('Typing filters; ArrowDown highlights a result', async () => {
      await userEvent.keyboard('er');
      await waitFor(() => expect(visible()).toEqual(['Peru']));
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(active(search)).toBe('Peru'));
    });

    await step('No match shows the empty state', async () => {
      await userEvent.keyboard('zz');
      await waitFor(() => expect(layer!.querySelector<HTMLElement>('[data-ax-empty="search"]')!.hidden).toBe(false));
      await expect(layer!.querySelector('[data-ax-empty="search"]')).toHaveTextContent('No results found');
      await expect(search).not.toHaveAttribute('aria-activedescendant');
    });

    await step('Escape closes, resets the query and returns focus', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(search).toHaveValue('');
    });

    await step('A pointer pick from the filtered list selects and returns focus', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(search).toHaveFocus());
      await userEvent.keyboard('chi');
      await waitFor(() => expect(visible()).toEqual(['Chile', 'China']));
      await userEvent.click(parts(canvasElement).option('Chile'));
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(host.value).toBe('Chile');
      await expect(trigger).toHaveFocus();
    });
  },
};

/** Sections (named groups with a visual heading), dividers and a disabled option the arrows skip. */
export const GroupedOptions: Story = {
  args: {
    label: 'Grouped',
    value: 'lime',
    options: [
      {type: 'section', title: 'Citrus', options: [{value: 'lemon', label: 'Lemon'}, {value: 'lime', label: 'Lime'}, {value: 'orange', label: 'Orange'}]},
      {type: 'divider'},
      {type: 'section', title: 'Berries', options: [{value: 'blueberry', label: 'Blueberry'}, {value: 'raspberry', label: 'Raspberry', disabled: true}, {value: 'strawberry', label: 'Strawberry'}]},
      {type: 'divider'},
      {value: 'other', label: 'Something else'},
    ],
  },
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {trigger, layer, active} = parts(canvasElement);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getByRole('group', {name: 'Citrus'})).toBeInTheDocument();
    await expect(canvas.getByRole('group', {name: 'Berries'})).toBeInTheDocument();
    await waitFor(() => expect(active()).toBe('lime'));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(active()).toBe('strawberry'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** Disabled options (`aria-disabled`, a click does nothing), the selection mark at the start. */
export const DisabledOptions: Story = {
  args: {
    label: 'Plan',
    value: 'free',
    indicatorPosition: 'start',
    options: [
      {value: 'free', label: 'Free'},
      {value: 'pro', label: 'Pro', disabled: true, description: 'Contact sales'},
      {value: 'team', label: 'Team'},
      {value: 'enterprise', label: 'Enterprise', disabled: true},
    ],
  },
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer, option} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(option('pro')).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(option('pro'), {pointerEventsCheck: 0});
    await expect(isShowing(layer)).toBe(true);
    await expect(host.value).toBe('free');
    await userEvent.click(option('team'));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(host.value).toBe('team');
  },
};

/** `secondary`: a neutral fill (navs); its status message is detached. */
export const Secondary: Story = {args: {variant: 'secondary'}};

/** `ghost`: borderless. */
export const Ghost: Story = {args: {variant: 'ghost', value: null, placeholder: 'Choose…'}};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

/** Variants × sizes, every status × size, and the tooltip status. */
export const Matrix = composed(SelectorMatrix, {}, {source: matrixSource});

export const ErrorStatus: Story = {
  args: {status: {type: 'error', message: 'Pick a fruit to continue'}},
  play: async ({canvasElement}) => {
    const {trigger} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-invalid', 'true');
    await expect(trigger).toHaveAccessibleDescription(/Pick a fruit to continue/);
  },
};

/** Disabled with a reason: the trigger stays focusable (`aria-disabled`) and never opens. */
export const Disabled: Story = {
  args: {isDisabled: true, disabledMessage: 'You need the Editor role to change this'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveAccessibleDescription(/Editor role/);
    trigger.focus();
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
  },
};

/** Read-only: the value is visible, focusable and submitted, with no list to open. */
export const ReadOnly: Story = {
  args: {isReadOnly: true, htmlName: 'fruit'},
  play: async ({canvasElement}) => {
    const {trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('role', 'combobox');
    await expect(trigger).toHaveAttribute('aria-readonly', 'true');
    await expect(trigger).not.toHaveAttribute('aria-haspopup');
    await expect(layer).toBeNull();
    await expect(canvasElement.querySelector('input[name="fruit"]')).toHaveValue('Cherry');
  },
};

export const Loading: Story = {
  args: {options: [], value: null, isLoading: true, placeholder: 'Loading options…'},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).trigger).toHaveAttribute('aria-busy', 'true');
  },
};

/** No options: the open list shows its empty state. */
export const EmptyOptions: Story = {
  args: {label: 'Nothing yet', options: [], value: null},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {trigger, layer} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(layer!.querySelector('[data-ax-empty="options"]')).toHaveTextContent('No options');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

export const WithStartIcon: Story = {args: {startIcon: 'search', value: 'Grape'}};

/** Option objects with icons and descriptions; the selected option's icon shows in the trigger. */
export const OptionIcons: Story = {
  args: {
    label: 'Owner',
    value: 'ada',
    options: [
      {value: 'ada', label: 'Ada Lovelace', description: 'Engineering', icon: 'info'},
      {value: 'grace', label: 'Grace Hopper', description: 'Compilers', icon: 'wrench'},
      {value: 'alan', label: 'Alan Turing', description: 'Research', icon: 'search'},
    ],
  },
};

/** `renderOption` / `renderValue` with SelectorOption (server-side render functions, a story wrapper). */
export const CustomRender = composed(SelectorCustomRender, {
  args: {label: 'Owner'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer, option} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(option('alan')).toHaveTextContent('Research');
    await userEvent.click(option('alan'));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(host.value).toBe('alan');
    await expect(trigger).toHaveTextContent('Alan Turing');
  },
}, {controls: ['label', 'size'], source: customRenderSource});

/**
 * An explicit placement opens the list above the field when there is room (it flips below
 * otherwise) and opts out of the selected-item overlay.
 */
export const PlacementAbove: Story = {
  args: {value: null, placement: 'above'},
  parameters: {layout: 'centered'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {trigger, layer} = parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(trigger).toHaveFocus();
  },
};

/**
 * Rendered open (`isDefaultOpen`): the list is in the top layer from the start. Docs show it
 * in its own frame so it cannot cover the page.
 */
export const Open: Story = {
  args: {isDefaultOpen: true, placement: 'below'},
  parameters: {docs: {story: {inline: false, height: '360px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {trigger, layer} = parts(canvasElement);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  },
};

/**
 * `presentation="bottom-sheet"`: the list opens as a modal bottom sheet named by the label;
 * the keyboard opens it with focus on the listbox, Enter picks and closes it.
 */
export const BottomSheet: Story = {
  args: {value: null, presentation: 'bottom-sheet'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, layer} = parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getByRole('dialog', {name: 'Fruit'})).toHaveAttribute('aria-modal', 'true');
    const listbox = layer!.querySelector<HTMLElement>('[role="listbox"]')!;
    await waitFor(() => expect(listbox).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(host.value).toBe('Banana');
    await expect(trigger).toHaveFocus();
  },
};

/** In a form: `htmlName` submits the value; Reset restores the server value. */
export const InForm = composed(SelectorForm, {
  args: {label: 'Favourite fruit'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-selector');
    const {host, trigger, label} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    await expect(trigger).toHaveAttribute('aria-required', 'true');
    trigger.focus();
    await userEvent.keyboard('g');
    await waitFor(() => expect(Object.fromEntries(new FormData(form))).toEqual({fruit: 'Grape'}));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(host.value).toBe('Cherry'));
    await expect(label()).toBe('Cherry');
    await expect(Object.fromEntries(new FormData(form))).toEqual({fruit: 'Cherry'});
  },
}, {controls: ['label'], source: formSource});
