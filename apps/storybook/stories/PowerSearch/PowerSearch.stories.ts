import PowerSearch from 'astryx-astro/components/PowerSearch/PowerSearch.astro';
import Demo from 'astryx-astro/components/PowerSearch/PowerSearch.demo.astro';
import demoSource from 'astryx-astro/components/PowerSearch/PowerSearch.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story, knownA11y} from '../_lib/story';
import PowerSearchParts from './PowerSearchParts.astro';
import partsSource from './PowerSearchParts.astro?raw';
import PowerSearchStory from './PowerSearchStory.astro';
import storySource from './PowerSearchStory.astro?raw';

const meta = {
  title: 'Form Controls/Power Search',
  component: PowerSearch,
  ...astryx('PowerSearch'),
  // Every story renders through a wrapper: the config holds a search source (functions).
  args: {filters: []},
} satisfies Meta;
export default meta;

/** Every example from the docs page (PowerSearch.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "color-contrast": "Dimmed text in a disabled control: WCAG 1.4.3 exempts inactive components, and the control itself carries aria-disabled, which axe cannot tie this text to."
})});

type Filter = {field: string; operator: string; value: Record<string, unknown>; isReadOnly?: boolean};
type Change = {filters: Filter[]; changeType: 'add' | 'edit' | 'remove'; index: number};

const options = {
  controls: [
    'filters', 'label', 'isLabelHidden', 'placeholder', 'size', 'resultCount', 'hasClear', 'isReadOnly', 'isDisabled', 'disabledMessage',
    'status', 'startIcon', 'tokenOverflowBehavior', 'maxTokenLength', 'popoverSaveButtonLabel', 'timezoneID', 'hasEndBadge',
  ],
  source: storySource,
};
/** A story of the issue-search wrapper with these args. */
const issueStory = (story: Story = {}) => composed(PowerSearchStory, story, options);

const initial: Filter[] = [
  {field: 'status', operator: 'is', value: {type: 'enum', value: 'open'}},
  {field: 'labels', operator: 'is_any_of', value: {type: 'enum_list', value: ['bug', 'ui']}},
  {field: 'team', operator: 'is', value: {type: 'enum', value: 'core'}, isReadOnly: true},
];
// 9 March 2026 to 15 March 2026, midnight UTC (the wrapper's timezoneID).
const createdBetween: Filter = {
  field: 'created',
  operator: 'between',
  value: {type: 'date_range', value: {start: {type: 'ABSOLUTE', unixSeconds: 1773014400}, end: {type: 'ABSOLUTE', unixSeconds: 1773532800}}},
};

const parts = (canvasElement: HTMLElement) => {
  const root = canvasElement.querySelector<HTMLElement & {filters: Filter[]; resultCount: number | string | null}>('ax-power-search')!;
  const input = root.querySelector<HTMLInputElement>('ax-tokenizer input[role="combobox"]')!;
  const list = canvasElement.querySelector<HTMLElement>(`#${root.querySelector('ax-tokenizer')!.getAttribute('data-ax-layer')}`)!;
  const editor = canvasElement.querySelector<HTMLElement>(`#${root.getAttribute('data-ax-layer')}`)!;
  return {
    root,
    input,
    list,
    editor,
    rows: () => [...list.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-empty])')].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id),
    tokens: () => [...root.querySelectorAll('[data-ax-token-item]')].map((t) => {
      const label = t.querySelector('.ax-token-label')?.textContent ?? '';
      const value = t.querySelector('.ax-power-search-token-value')?.textContent;
      return value ? `${label} ${value}` : label;
    }),
    token: (index: number) => root.querySelector<HTMLElement>(`[data-ax-token-item^="filter-${index}-"]`)!,
    selectors: () => [...editor.querySelectorAll<HTMLElement & {value: string | null}>('ax-selector')],
    valueCell: () => editor.querySelector<HTMLElement>('[data-ax-value-cell]')!,
  };
};

/** Type a field name into the filter input and pick it with Enter. */
const pickField = async (input: HTMLInputElement, name: string) => {
  input.focus();
  // Backspace in an empty input removes the last filter: only clear leftover text.
  if (input.value) await userEvent.keyboard('{Control>}a{/Control}{Backspace}');
  await userEvent.keyboard(name);
  await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
  await userEvent.keyboard('{Enter}');
};

const announced = (text: string) =>
  waitFor(() => expect([...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' ')).toContain(text));

/**
 * Filters as tokens ("Field: operator" + the value), one of them read-only. Focus lists every
 * field (grouped; aliases match); typed text offers a content search and "field operator value"
 * suggestions. Backspace, a token's ✕ and Clear all remove filters, never the read-only one.
 */
export const Default = issueStory({
  args: {filters: initial, startIcon: 'search'},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {root, input, list, editor, rows, tokens, token} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');

    await step('Tokens read "Field: operator value"; the read-only one has no actions', async () => {
      await expect(tokens()).toEqual(['Status: is Open', 'Labels: is any of Bug, UI', 'Team: is Core']);
      const action = token(0).querySelector('.ax-token-action')!;
      await expect(action).toHaveAccessibleName('Status: is Open');
      await expect(action).toHaveAttribute('aria-haspopup', 'dialog');
      await expect(action).toHaveAttribute('aria-expanded', 'false');
      await expect(token(0).querySelector('[data-ax-token-remove]')).toHaveAccessibleName('Remove Status: is Open');
      await expect(token(2).querySelector('.ax-token-action')).toBeNull();
      await expect(token(2).querySelector('[data-ax-token-remove]')).toBeNull();
    });

    await step('Focus lists every field, ungrouped first, then the groups', async () => {
      await userEvent.click(input);
      await waitFor(() => expect(isShowing(list)).toBe(true));
      await expect(rows()).toHaveLength(10);
      await expect([...list.querySelectorAll('[role="group"]')].map((g) => g.getAttribute('aria-label'))).toEqual(['Dates', 'Flags']);
      await expect(list.querySelector('[role="option"][data-id="status"]')).toHaveTextContent('Where the issue is in its workflow');
    });

    await step('Typed text: a content search first, then matching fields (aliases too)', async () => {
      await userEvent.keyboard('state');
      await waitFor(() => expect(rows().slice(0, 2)).toEqual(['__content_search__:state', 'status']));
      await userEvent.keyboard('{Control>}a{/Control}{Backspace}title contains foo');
      await waitFor(() => expect(rows()).toContain('title:contains:value:foo'));
    });

    await step('Enter on the content search adds "Title contains …" at once', async () => {
      await userEvent.keyboard('{Control>}a{/Control}{Backspace}focus');
      await waitFor(() => expect(rows()[0]).toBe('__content_search__:focus'));
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(changes).toHaveLength(1));
      await expect(changes[0].detail).toMatchObject({changeType: 'add', index: 3});
      await expect(changes[0].detail.filters[3]).toEqual({field: 'title', operator: 'contains', value: {type: 'string', value: 'focus'}});
      await expect(tokens().at(-1)).toBe('Title: contains focus');
      await expect(isShowing(editor)).toBe(false);
    });

    await step('Backspace in the empty input removes the last filter', async () => {
      await userEvent.keyboard('{Escape}');
      input.focus();
      await userEvent.keyboard('{Backspace}');
      await waitFor(() => expect(tokens()).toHaveLength(3));
      await expect(changes.at(-1)?.detail).toMatchObject({changeType: 'remove', index: 3});
    });

    await step('A token’s ✕ removes that filter', async () => {
      await userEvent.click(token(1).querySelector('[data-ax-token-remove]')!);
      await waitFor(() => expect(tokens()).toEqual(['Status: is Open', 'Team: is Core']));
      await expect(changes.at(-1)?.detail).toMatchObject({changeType: 'remove', index: 1});
    });

    await step('Clear all and Backspace keep the read-only filter', async () => {
      await userEvent.click(root.querySelector('[data-ax-input-clear]')!);
      await waitFor(() => expect(tokens()).toEqual(['Team: is Core']));
      await announced('Editable filters removed');
      input.focus();
      await userEvent.keyboard('{Backspace}');
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(tokens()).toEqual(['Team: is Core']);
      await expect(root.filters).toEqual([initial[2]]);
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(list)).toBe(false));
    });
  },
});

/**
 * Adding through the editor popover: picking a field opens it with the default operator and
 * focus on the value. An enum value saves on pick, an `empty` operator adds at once, a number
 * saves on Enter, and Escape cancels.
 */
export const AddingFilters = issueStory({
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {input, editor, selectors, valueCell, tokens} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');

    await step('Picking a field opens the editor on the value, Apply disabled', async () => {
      await pickField(input, 'Status');
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      await expect(editor.querySelector('[data-ax-surface]')).not.toHaveAttribute('role');
      await waitFor(() => expect(selectors().map((s) => s.value)).toEqual(['status', 'is', null]));
      await waitFor(() => expect(valueCell().contains(document.activeElement)).toBe(true));
      await expect(editor.querySelector('[data-ax-apply]')).toBeDisabled();
    });

    await step('Picking an enum value saves the filter and closes the editor', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      await waitFor(() => expect(changes).toHaveLength(1));
      await expect(changes[0].detail.filters.at(-1)).toEqual({field: 'status', operator: 'is', value: {type: 'enum', value: 'closed'}});
      await waitFor(() => expect(isShowing(editor)).toBe(false));
      await waitFor(() => expect(input).toHaveFocus());
    });

    await step('An `empty` operator (Archived is true) adds without the editor', async () => {
      await userEvent.keyboard('{Escape}');
      await pickField(input, 'Archived');
      await waitFor(() => expect(changes).toHaveLength(2));
      await expect(changes[1].detail.filters.at(-1)).toMatchObject({field: 'archived', operator: 'is_true'});
      await expect(isShowing(editor)).toBe(false);
    });

    await step('Escape in the editor cancels: nothing added', async () => {
      await userEvent.keyboard('{Escape}');
      await pickField(input, 'Estimate');
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      await waitFor(() => expect(editor.querySelector('ax-number-input')).not.toBeNull());
      // The editor moves focus to its value a frame after it opens: Escape goes there.
      await waitFor(() => expect(valueCell().querySelector('input')).toHaveFocus());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(editor)).toBe(false));
      await expect(changes).toHaveLength(2);
    });

    await step('A number saves on Enter', async () => {
      await userEvent.keyboard('{Escape}');
      await pickField(input, 'Estimate');
      await waitFor(() => expect(valueCell().querySelector('input')).toHaveFocus());
      await userEvent.keyboard('4.5{Enter}');
      await waitFor(() => expect(changes).toHaveLength(3));
      await expect(changes[2].detail.filters.at(-1)).toEqual({field: 'estimate', operator: 'equals', value: {type: 'float', value: 4.5}});
      await expect(tokens()).toEqual(['Status: is Closed', 'Archived: is true', 'Estimate: is 4.5']);
    });
  },
});

/**
 * Pressing a token opens its editor as a non-modal dialog named by the token, with the value
 * loaded: Enter saves an edit, switching to an operator of the same type keeps the value, and
 * Delete removes the filter.
 */
export const EditingFilters = issueStory({
  args: {filters: [initial[0], {field: 'title', operator: 'contains', value: {type: 'string', value: 'focus'}}]},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {editor, selectors, token, tokens} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const action = () => token(1).querySelector<HTMLElement>('.ax-token-action')!;
    const text = () => editor.querySelector<HTMLInputElement>('ax-text-input input')!;

    await step('A token opens its editor as a dialog named by the token', async () => {
      await userEvent.click(action());
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      const surface = editor.querySelector('[data-ax-surface]')!;
      await expect(surface).toHaveAttribute('role', 'dialog');
      await expect(surface).toHaveAccessibleName('Title: contains focus');
      await expect(action()).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(text()).toHaveValue('focus'));
      await expect(editor.querySelector<HTMLElement>('[data-ax-delete-slot]')!.hidden).toBe(false);
    });

    await step('Enter in the value saves the edit', async () => {
      await userEvent.tripleClick(text());
      await userEvent.keyboard('{Control>}a{/Control}focus ring{Enter}');
      await waitFor(() => expect(changes).toHaveLength(1));
      await expect(changes[0].detail).toMatchObject({changeType: 'edit', index: 1});
      await expect(changes[0].detail.filters[1].value).toEqual({type: 'string', value: 'focus ring'});
      await waitFor(() => expect(tokens()[1]).toBe('Title: contains focus ring'));
    });

    await step('Another operator of the same type keeps the value', async () => {
      await userEvent.click(action());
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      // The editor moves focus to its value a frame after it opens: let it land first, or it
      // takes focus from the operator list opened below.
      await waitFor(() => expect(text()).toHaveFocus());
      const operator = editor.querySelector<HTMLElement>('[data-ax-operator-cell] ax-selector button[role="combobox"]')!;
      await userEvent.click(operator);
      // Each key acts on the highlight: wait for it to land before the next one.
      const active = () => document.getElementById(operator.getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-value');
      await waitFor(() => expect(active()).toBe('contains'));
      await expect(operator).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(active()).toBe('not_contains'));
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(selectors()[1].value).toBe('not_contains'));
      await expect(text()).toHaveValue('focus ring');
    });

    await step('Delete removes the filter', async () => {
      await userEvent.click(editor.querySelector<HTMLElement>('[data-ax-delete]')!);
      await waitFor(() => expect(changes).toHaveLength(2));
      await expect(changes[1].detail).toMatchObject({changeType: 'remove', index: 1});
      await waitFor(() => expect(isShowing(editor)).toBe(false));
      await expect(tokens()).toEqual(['Status: is Open']);
    });
  },
});

/**
 * Date filters, read and written in UTC (`timezoneID`): a typed date (Created after), a
 * relative date (Updated within, saved on pick), a date and time (Due at), and editing a
 * date range (Created between) in its calendar. Values are Unix seconds, as in Astryx.
 */
export const DateFilters = issueStory({
  args: {filters: [createdBetween]},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {input, editor, valueCell, token, tokens} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    await expect(tokens()).toEqual(['Created: is between date range']);

    await step('Created after: a typed date, then Enter, saves', async () => {
      await pickField(input, 'Created');
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      const date = await waitFor(() => {
        const field = valueCell().querySelector<HTMLInputElement>('ax-date-input input[role="combobox"]');
        expect(field).not.toBeNull();
        return field!;
      });
      await waitFor(() => expect(valueCell().contains(document.activeElement)).toBe(true));
      date.focus();
      await userEvent.keyboard('March 1, 2026');
      await waitFor(() => expect(date).toHaveValue('March 1, 2026'));
      await waitFor(() => expect(editor.querySelector('[data-ax-apply]')).toBeEnabled());
      // As in Astryx, the editor focuses its first control, the DateInput's calendar toggle (it
      // comes before the field), so the story focuses the text field. Enter with typed text
      // commits the date and is held back from the editor; the next Enter saves.
      await userEvent.keyboard('{Enter}{Enter}');
      await waitFor(() => expect(changes).toHaveLength(1));
      await expect(changes[0].detail.filters.at(-1)).toEqual({field: 'created', operator: 'after', value: {type: 'date_absolute', unixSeconds: 1772323200}});
      await waitFor(() => expect(isShowing(editor)).toBe(false));
      await expect(tokens().at(-1)).toBe('Created: is after Mar 1, 2026');
    });

    await step('Updated within: a relative date saves on pick', async () => {
      await userEvent.keyboard('{Escape}');
      await pickField(input, 'Updated');
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      await waitFor(() => expect(valueCell().contains(document.activeElement)).toBe(true));
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
      await waitFor(() => expect(changes).toHaveLength(2));
      await expect(changes[1].detail.filters.at(-1)).toEqual({field: 'updated', operator: 'within', value: {type: 'date_relative', value: '7d_ago'}});
    });

    await step('Due at: a date and a time make one instant', async () => {
      await userEvent.keyboard('{Escape}');
      await pickField(input, 'Due');
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      const date = await waitFor(() => {
        const field = valueCell().querySelector<HTMLInputElement>('ax-date-input input[role="combobox"]');
        expect(field).not.toBeNull();
        return field!;
      });
      await waitFor(() => expect(valueCell().contains(document.activeElement)).toBe(true));
      date.focus();
      await userEvent.keyboard('March 20, 2026');
      const time = valueCell().querySelector<HTMLInputElement>('ax-time-input input.ax-input-native')!;
      await userEvent.click(time);
      await userEvent.keyboard('9:30 AM');
      await waitFor(() => expect(editor.querySelector('[data-ax-apply]')).toBeEnabled());
      await userEvent.click(editor.querySelector<HTMLElement>('[data-ax-apply]')!);
      await waitFor(() => expect(changes).toHaveLength(3));
      await expect(changes[2].detail.filters.at(-1)).toEqual({field: 'due', operator: 'at', value: {type: 'date_absolute', unixSeconds: 1773999000}});
    });

    await step('Created between: the editor loads the range; new days and Apply save the edit', async () => {
      await userEvent.click(token(0).querySelector<HTMLElement>('.ax-token-action')!);
      await waitFor(() => expect(isShowing(editor)).toBe(true));
      const range = valueCell().querySelector<HTMLElement & {value: unknown}>('ax-date-range-input')!;
      await waitFor(() => expect(range.value).toEqual({start: '2026-03-09', end: '2026-03-15'}));
      await userEvent.click(range.querySelector<HTMLElement>('[data-ax-range-trigger]')!);
      const picker = canvasElement.querySelector<HTMLElement>(`#${range.getAttribute('data-ax-popover')}`)!;
      await waitFor(() => expect(isShowing(picker)).toBe(true));
      const day = (iso: string) => picker.querySelector<HTMLElement>(`button[data-date="${iso}"]:not([data-ax-outside])`)!;
      await userEvent.click(day('2026-03-10'));
      await userEvent.click(day('2026-03-20'));
      await waitFor(() => expect(isShowing(picker)).toBe(false));
      await userEvent.click(editor.querySelector<HTMLElement>('[data-ax-apply]')!);
      await waitFor(() => expect(changes).toHaveLength(4));
      await expect(changes[3].detail).toMatchObject({changeType: 'edit', index: 0});
      await expect(changes[3].detail.filters[0].value).toEqual({
        type: 'date_range',
        value: {start: {type: 'ABSOLUTE', unixSeconds: 1773100800}, end: {type: 'ABSOLUTE', unixSeconds: 1773964800}},
      });
    });
  },
});

/** A number reads "N results" in the end lane, beside `endContent`; setting `el.resultCount` updates and announces it. */
export const WithResultCount = issueStory({
  args: {filters: initial, resultCount: 3, hasEndBadge: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {root} = parts(canvasElement);
    const count = root.querySelector('[data-ax-result-count-text]')!;
    await expect(count).toHaveTextContent('3 results');
    root.resultCount = 1;
    await waitFor(() => expect(count).toHaveTextContent('1 result'));
    await announced('1 result');
  },
});

export const Small = issueStory({args: {size: 'sm', filters: [{field: 'estimate', operator: 'greater_than', value: {type: 'float', value: 3}}]}});

/** Large, with its label shown. */
export const Large = issueStory({args: {size: 'lg', label: 'Search issues', isLabelHidden: false, placeholder: 'Filter issues…'}});

/** Read-only: tokens are static, with no ✕ and no Clear all. */
export const ReadOnly = issueStory({
  args: {filters: initial, isReadOnly: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const {root} = parts(canvasElement);
    await expect(root.querySelector('.ax-token-action')).toBeNull();
    await expect(root.querySelector('[data-ax-token-remove]')).toBeNull();
    await expect(root.querySelector('[data-ax-input-clear]')).toBeNull();
  },
});

/** Disabled with a reason: the input stays focusable and is described by the reason. */
export const Disabled = issueStory({
  parameters: knownA11y({
    "color-contrast": "Dimmed text in a disabled control: WCAG 1.4.3 exempts inactive components, and the control itself carries aria-disabled, which axe cannot tie this text to."
  }),
  args: {filters: initial.slice(0, 1), isDisabled: true, disabledMessage: 'Sign in to filter'},
  play: async ({canvasElement}) => {
    const {input} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).toHaveAccessibleDescription(/Sign in to filter/);
  },
});

export const ErrorStatus = issueStory({
  args: {status: {type: 'error', message: 'Add at least one filter'}},
  play: async ({canvasElement}) => {
    await expect(parts(canvasElement).input).toHaveAccessibleDescription(/Add at least one filter/);
  },
});

/** `tokenOverflowBehavior="unfocusedInline"`: one row with "+N more" until the field takes focus. */
export const OverflowInline = issueStory({
  args: {filters: initial, tokenOverflowBehavior: 'unfocusedInline', resultCount: 'Many results'},
  decorators: [frame({width: 360})],
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-power-search');
    const field = canvasElement.querySelector('ax-tokenizer')!;
    await waitFor(() => expect(field).toHaveAttribute('data-ax-truncated'));
  },
});

/**
 * PowerSearchToken and a standalone PowerSearchFilterEditor (a story wrapper). The editor loads
 * its filter without taking focus; Apply, Cancel and Delete report `astryx-save` / `astryx-cancel`.
 */
export const Parts = composed(PowerSearchParts, {
  parameters: knownA11y({
    "color-contrast": "Dimmed text in a disabled control: WCAG 1.4.3 exempts inactive components, and the control itself carries aria-disabled, which axe cannot tie this text to."
  }),
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-power-search-editor');
    const editor = canvasElement.querySelector<HTMLElement>('ax-power-search-editor')!;
    const saves = recordEvents<{filter: Filter | null}>(canvasElement, 'astryx-save');
    const cancels = recordEvents(canvasElement, 'astryx-cancel');
    await waitFor(() => expect(editor.querySelector<HTMLElement & {value: unknown}>('ax-number-input')?.value).toBe(2));
    await expect(editor.contains(document.activeElement)).toBe(false);
    await userEvent.click(canvas.getByRole('button', {name: 'Save filter'}));
    await expect(saves.at(-1)?.detail.filter).toEqual({field: 'priority', operator: 'is', value: {type: 'integer', value: 2}});
    await userEvent.click(canvas.getByRole('button', {name: 'Cancel'}));
    await expect(cancels).toHaveLength(1);
    await userEvent.click(canvas.getByRole('button', {name: 'Delete'}));
    await expect(saves.at(-1)?.detail.filter).toBeNull();
  },
}, {controls: ['saveButtonLabel'], source: partsSource});
