import Typeahead from 'astryx-astro/components/Typeahead/Typeahead.astro';
import Demo from 'astryx-astro/components/Typeahead/Typeahead.demo.astro';
import demoSource from 'astryx-astro/components/Typeahead/Typeahead.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import TypeaheadForm from './TypeaheadForm.astro';
import formSource from './TypeaheadForm.astro?raw';
import TypeaheadMatrix from './TypeaheadMatrix.astro';
import matrixSource from './TypeaheadMatrix.astro?raw';
import TypeaheadPeople from './TypeaheadPeople.astro';
import peopleSource from './TypeaheadPeople.astro?raw';
import TypeaheadStory from './TypeaheadStory.astro';
import storySource from './TypeaheadStory.astro?raw';

const meta = {
  title: 'Form Controls/Typeahead',
  component: Typeahead,
  ...astryx('Typeahead'),
  // Every story renders through a wrapper: the static search source holds functions.
  args: {label: 'Fruit', placeholder: 'Search fruit…'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Typeahead.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Item = {id: string; label: string};
type Host = HTMLElement & {value: Item | null};

const options = {
  controls: [
    'label', 'description', 'placeholder', 'value', 'size', 'status', 'hasClear', 'hasEntriesOnFocus', 'maxMenuItems',
    'minQueryLength', 'emptySearchText', 'debounceMs', 'startIcon', 'hasMatchHighlight', 'isDisabled', 'disabledMessage',
    'isRequired', 'isLabelHidden',
  ],
  source: storySource,
};
/** A story of the fruit Typeahead wrapper with these args. */
const fruitStory = (story: Story = {}) => composed(TypeaheadStory, story, options);

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-typeahead')!;
  const input = host.querySelector<HTMLInputElement>('input[data-ax-typeahead-input]')!;
  const layer = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-layer')}`)!;
  return {
    host,
    input,
    layer,
    token: host.querySelector<HTMLElement>('[data-ax-typeahead-token]')!,
    emptyRow: layer.querySelector<HTMLElement>('[data-ax-empty]')!,
    visible: () => [...layer.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-empty])')].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id),
    active: () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '')?.dataset.id ?? null,
  };
};

const announced = (text: string) =>
  waitFor(() => expect([...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' ')).toContain(text));

/**
 * Typing filters the server-rendered items (substring) and opens the list; focus stays in
 * the input (`aria-activedescendant`). Arrows wrap, Home/End jump, Enter picks: the value shows
 * as a token. Pressing the token edits it (Escape restores it); the clear button empties it.
 */
export const Default = fruitStory({
  args: {hasMatchHighlight: true},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input, layer, token, visible, active} = parts(canvasElement);
    const changes = recordEvents<{value: Item | null}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('combobox', {name: 'Fruit'})).toBe(input);
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');

    await step('Focus alone opens nothing; typing filters and opens the list', async () => {
      await userEvent.click(input);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await expect(isShowing(layer)).toBe(false);
      await userEvent.keyboard('ap');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(visible()).toEqual(['apple', 'apricot', 'grape', 'papaya', 'pineapple']));
      await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
      await waitFor(() => expect(active()).toBe('apple'));
      await expect(input).toHaveFocus();
      await announced('5 results');
    });

    await step('Arrows wrap; Home and End jump', async () => {
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(active()).toBe('pineapple'));
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(active()).toBe('apple'));
      await userEvent.keyboard('{End}');
      await waitFor(() => expect(active()).toBe('pineapple'));
      await userEvent.keyboard('{Home}{ArrowDown}');
      await waitFor(() => expect(active()).toBe('apricot'));
    });

    await step('Enter picks: the value shows as a token, which takes focus', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.at(-1)?.detail.value).toEqual({id: 'apricot', label: 'Apricot'});
      await expect(token).toHaveTextContent('Apricot');
      await expect(token.hidden).toBe(false);
      await waitFor(() => expect(token.contains(document.activeElement)).toBe(true));
    });

    await step('Pressing the token edits it; Escape closes the list, then restores the token', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(input).toHaveValue('Apricot'));
      await expect(input).toHaveFocus();
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(token.hidden).toBe(false));
      await expect(host.value).toEqual({id: 'apricot', label: 'Apricot'});
    });

    await step('The clear button empties the value and focuses the input', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Clear selection'}));
      await expect(changes.at(-1)?.detail.value).toBeNull();
      await expect(token.hidden).toBe(true);
      await expect(input).toHaveFocus();
    });
  },
});

/** A query that matches nothing shows (and announces) the empty message as a disabled row. */
export const NoResults = fruitStory({
  args: {emptySearchText: 'No fruit by that name'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {input, layer, emptyRow} = parts(canvasElement);
    const changes = recordEvents(canvasElement, 'astryx-change');
    await userEvent.click(input);
    await userEvent.keyboard('zzz');
    await waitFor(() => expect(emptyRow.hidden).toBe(false));
    await expect(emptyRow).toHaveTextContent('No fruit by that name');
    await expect(emptyRow).toHaveAttribute('aria-disabled', 'true');
    await expect(input).not.toHaveAttribute('aria-activedescendant');
    await announced('No fruit by that name');
    await userEvent.keyboard('{Enter}');
    await expect(changes).toHaveLength(0);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
});

/** A selected value: the token sits over the input; a click on the field edits it. */
export const WithValue = fruitStory({
  args: {value: {id: 'cherry', label: 'Cherry'}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input, token} = parts(canvasElement);
    await expect(token).toHaveTextContent('Cherry');
    await expect(input).toHaveAttribute('tabindex', '-1');
    await userEvent.click(host);
    await waitFor(() => expect(input).toHaveValue('Cherry'));
    await expect(input).toHaveFocus();
    await userEvent.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(token.hidden).toBe(false));
  },
});

/** `hasEntriesOnFocus` with `maxMenuItems={5}`: focus shows the first five items. */
export const EntriesOnFocus = fruitStory({
  args: {label: 'Recent', placeholder: 'Focus to see suggestions', hasEntriesOnFocus: true, maxMenuItems: 5},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {input, layer, visible} = parts(canvasElement);
    await userEvent.click(input);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(visible()).toHaveLength(5);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
});

/** `minQueryLength={3}`: shorter queries are not searched. */
export const MinQueryLength = fruitStory({
  args: {label: 'Three characters', placeholder: 'Type 3+ characters', minQueryLength: 3},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {input, layer, visible} = parts(canvasElement);
    await userEvent.click(input);
    await userEvent.keyboard('ap');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
    await userEvent.keyboard('p');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(visible()).toEqual(['apple', 'pineapple']);
    await userEvent.keyboard('{Escape}');
  },
});

/**
 * The default debounce (150 ms) and a listener that claims `astryx-query`: the spinner and
 * `aria-busy` show until the listener calls `respond(items)`.
 */
export const AnsweredByEvent = fruitStory({
  args: {label: 'Country', placeholder: 'Search countries…', debounceMs: 150},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input, layer, visible} = parts(canvasElement);
    const queries: Array<{query: string; respond: (items: Item[]) => void}> = [];
    // Scoped to this story's element and removed before play ends.
    const claim = (event: Event) => {
      event.preventDefault();
      queries.push((event as CustomEvent).detail);
    };
    host.addEventListener('astryx-query', claim);
    try {
      await userEvent.click(input);
      await userEvent.keyboard('per');
      await waitFor(() => expect(queries.map((q) => q.query)).toEqual(['per']));
      await expect(input).toHaveAttribute('aria-busy', 'true');
      await expect(host.querySelector('[data-ax-typeahead-spinner]')).toHaveAccessibleName('Loading');
      queries[0].respond([{id: 'peru', label: 'Peru'}]);
      await waitFor(() => expect(visible()).toEqual(['peru']));
      await expect(input).not.toHaveAttribute('aria-busy');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(host.value).toEqual({id: 'peru', label: 'Peru'}));
      await expect(isShowing(layer)).toBe(false);
    } finally {
      host.removeEventListener('astryx-query', claim);
    }
  },
});

/** Results grouped by `auxiliaryData.group`, keyword matches and a `renderItem` row (a story wrapper). */
export const GroupedResults = composed(TypeaheadPeople, {
  args: {label: 'Assignee'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input, layer, visible} = parts(canvasElement);
    await userEvent.click(host);
    await waitFor(() => expect(input).toHaveValue('Grace Hopper'));
    await userEvent.keyboard('{Control>}a{/Control}admiral');
    await waitFor(() => expect(visible()).toEqual(['grace']));
    await userEvent.keyboard('{Control>}a{/Control}a');
    await waitFor(() => expect(canvas.getByRole('group', {name: 'Research'})).toBeInTheDocument());
    await expect(canvas.getByRole('group', {name: 'Engineering'})).toBeInTheDocument();
    await expect(layer.querySelector('[data-id="ada"]')).toHaveTextContent('Engineering');
    await userEvent.keyboard('{Escape}{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, {controls: ['label', 'size'], source: peopleSource});

export const Small = fruitStory({args: {size: 'sm', value: {id: 'fig', label: 'Fig'}}});

export const Large = fruitStory({args: {size: 'lg', value: {id: 'fig', label: 'Fig'}}});

/** Every size, and every status × size. */
export const Matrix = composed(TypeaheadMatrix, {}, {source: matrixSource});

export const ErrorStatus = fruitStory({
  args: {status: {type: 'error', message: 'Choose a fruit'}},
  play: async ({canvasElement}) => {
    const {input} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(/Choose a fruit/);
  },
});

/** Disabled with a reason (it describes the input): the token takes no press, nothing opens and the value stays. */
export const Disabled = fruitStory({
  args: {value: {id: 'banana', label: 'Banana'}, isDisabled: true, disabledMessage: 'Locked by an administrator'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input, token, layer} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).toHaveAccessibleDescription(/Locked by an administrator/);
    await expect(token).toHaveTextContent('Banana');
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
    await expect(host.value).toEqual({id: 'banana', label: 'Banana'});
  },
});

/** A start icon and a visually hidden label (the label still names the input). */
export const WithStartIcon = fruitStory({
  args: {startIcon: 'search', isLabelHidden: true, placeholder: 'Search…'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('combobox', {name: 'Fruit'})).toBeInTheDocument();
  },
});

/** In a form: `htmlName` submits the selected item's id; Reset restores the server value. */
export const InForm = composed(TypeaheadForm, {
  args: {label: 'Favourite fruit'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-typeahead');
    const {host, input} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    await expect(Object.fromEntries(new FormData(form))).toEqual({fruit: 'apple'});
    await userEvent.click(canvas.getByRole('button', {name: 'Clear selection'}));
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.keyboard('kiw');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(Object.fromEntries(new FormData(form))).toEqual({fruit: 'kiwi'}));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(host.value).toEqual({id: 'apple', label: 'Apple'}));
    await expect(Object.fromEntries(new FormData(form))).toEqual({fruit: 'apple'});
  },
}, {controls: ['label'], source: formSource});
