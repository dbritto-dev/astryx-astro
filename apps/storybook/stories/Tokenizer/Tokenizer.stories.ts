import Tokenizer from 'astryx-astro/components/Tokenizer/Tokenizer.astro';
import Demo from 'astryx-astro/components/Tokenizer/Tokenizer.demo.astro';
import demoSource from 'astryx-astro/components/Tokenizer/Tokenizer.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story, knownA11y} from '../_lib/story';
import TokenizerForm from './TokenizerForm.astro';
import formSource from './TokenizerForm.astro?raw';
import TokenizerMatrix from './TokenizerMatrix.astro';
import matrixSource from './TokenizerMatrix.astro?raw';
import TokenizerPeople from './TokenizerPeople.astro';
import peopleSource from './TokenizerPeople.astro?raw';
import TokenizerStory from './TokenizerStory.astro';
import storySource from './TokenizerStory.astro?raw';

const meta = {
  title: 'Form Controls/Tokenizer',
  component: Tokenizer,
  ...astryx('Tokenizer'),
  // Every story renders through a wrapper: the static search source holds functions.
  args: {label: 'Tags', placeholder: 'Add tags…'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Tokenizer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "color-contrast": "Dimmed text in a disabled control: WCAG 1.4.3 exempts inactive components, and the control itself carries aria-disabled, which axe cannot tie this text to."
})});

type Item = {id: string; label: string};
type Change = {values: Item[]; change: {item: Item; type: 'add' | 'create' | 'remove'}};
type Host = HTMLElement & {value: Item[]};

const options = {
  controls: [
    'label', 'description', 'placeholder', 'value', 'size', 'status', 'statusVariant', 'hasClear', 'hasCreate', 'hasEntriesOnFocus',
    'maxEntries', 'minQueryLength', 'debounceMs', 'tokenOverflowBehavior', 'width', 'startIcon', 'isLabelHidden', 'isDisabled',
    'disabledMessage', 'hasEndBadge',
  ],
  source: storySource,
};
/** A story of the tags Tokenizer wrapper with these args. */
const tagStory = (story: Story = {}) => composed(TokenizerStory, story, options);
const tag = (label: string) => ({id: label.toLowerCase(), label});

const parts = (canvasElement: HTMLElement) => {
  const host = canvasElement.querySelector<Host>('ax-tokenizer')!;
  const input = host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
  const layer = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-layer')}`)!;
  return {
    host,
    input,
    layer,
    tokens: () => [...host.querySelectorAll<HTMLElement>(':scope > [data-ax-token-item]')].map((t) => t.getAttribute('data-ax-token-item')),
    remove: (id: string) => host.querySelector<HTMLButtonElement>(`[data-ax-token-item="${id}"] [data-ax-token-remove]`)!,
    visible: () => [...layer.querySelectorAll<HTMLElement>('[role="option"]:not([data-ax-empty])')].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.id),
    active: () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '')?.dataset.id ?? null,
  };
};

const announced = (text: string) =>
  waitFor(() => expect([...document.querySelectorAll('[data-astryx-live-region]')].map((r) => r.textContent).join(' ')).toContain(text));

/**
 * People as tokens (`renderItem` adds each role; a story wrapper). Typing searches the
 * unselected people, arrows wrap, Enter adds a token; Backspace in the empty input or a
 * token's ✕ removes one; Clear all removes every token. Changes are announced.
 */
export const Default = composed(TokenizerPeople, {
  args: {label: 'Reviewers'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {host, input, layer, tokens, remove, visible, active} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('group', {name: 'Reviewers'})).toBe(host);
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(tokens()).toEqual(['ada', 'grace']);

    await step('Typing opens the unselected matches; arrows wrap', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('a');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      const shown = visible();
      await expect(shown).not.toContain('ada');
      await expect(shown).not.toContain('grace');
      await waitFor(() => expect(active()).toBe(shown[0]));
      await userEvent.keyboard('{ArrowUp}');
      await waitFor(() => expect(active()).toBe(shown.at(-1)));
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(active()).toBe(shown[0]));
    });

    await step('Enter adds the active row as a token, keeps focus and closes the list', async () => {
      const picked = active()!;
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(tokens()).toEqual(['ada', 'grace', picked]));
      await expect(changes.at(-1)?.detail.change).toMatchObject({type: 'add', item: {id: picked}});
      await expect(changes.at(-1)?.detail.values.map((v) => v.id)).toEqual(['ada', 'grace', picked]);
      await expect(input).toHaveValue('');
      await expect(input).toHaveFocus();
      await expect(isShowing(layer)).toBe(false);
      await announced('Added ');
    });

    await step('Backspace in the empty input removes the last token', async () => {
      await userEvent.keyboard('{Backspace}');
      await waitFor(() => expect(tokens()).toEqual(['ada', 'grace']));
      await expect(changes.at(-1)?.detail.change.type).toBe('remove');
      await announced('Removed ');
    });

    await step('A token’s ✕ removes it and focus returns to the input', async () => {
      await userEvent.click(remove('ada'));
      await waitFor(() => expect(tokens()).toEqual(['grace']));
      await expect(input).toHaveFocus();
    });

    await step('Shift+Tab from the input reaches the last token’s remove button', async () => {
      await userEvent.tab({shift: true});
      await expect(remove('grace')).toHaveFocus();
    });

    await step('Escape closes the list and keeps the query; ArrowDown reopens', async () => {
      input.focus();
      await userEvent.keyboard('mar');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(input).toHaveValue('mar');
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.keyboard('{Escape}{Control>}a{/Control}{Backspace}');
    });

    await step('Clear all removes every token', async () => {
      const clear = canvas.getByRole('button', {name: 'Clear all'});
      await userEvent.click(clear);
      await waitFor(() => expect(tokens()).toEqual([]));
      await announced('All items removed');
      await expect(clear.hidden).toBe(true);
    });
  },
}, {controls: ['label', 'size', 'hasClear'], source: peopleSource});

/** `hasCreate`: typed text that matches no tag offers `Create "…"`; Enter creates the token. */
export const WithCreate = tagStory({
  args: {hasCreate: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {input, layer, tokens, visible} = parts(canvasElement);
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    await userEvent.click(input);
    await userEvent.keyboard('Ops');
    await waitFor(() => expect(visible()).toEqual(['__xds_create__Ops']));
    await expect(layer.querySelector('[data-id="__xds_create__Ops"]')).toHaveTextContent('Create "Ops"');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(tokens()).toEqual(['Ops']));
    await expect(changes.at(-1)?.detail.change).toEqual({type: 'create', item: {id: 'Ops', label: 'Ops'}});
    await userEvent.keyboard('design');
    await waitFor(() => expect(visible()).toEqual(['design']));
  },
});

/** `maxEntries={3}` with entries on focus: at the limit the input collapses and nothing more is offered. */
export const MaxEntries = tagStory({
  args: {label: 'Up to three', value: [tag('Design'), tag('Engineering')], maxEntries: 3, hasEntriesOnFocus: true, description: 'Pick up to three tags'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {input, layer, tokens, visible} = parts(canvasElement);
    await userEvent.click(input);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(visible()).not.toContain('design');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(tokens()).toHaveLength(3));
    await expect(input).toHaveAttribute('data-ax-at-max');
    await expect(isShowing(layer)).toBe(false);
    await userEvent.keyboard('{ArrowDown}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(isShowing(layer)).toBe(false);
    await userEvent.keyboard('{Backspace}');
    await waitFor(() => expect(input).not.toHaveAttribute('data-ax-at-max'));
  },
});

/** `minQueryLength={2}` with `hasCreate`: below the minimum only the derived Create row shows. */
export const MinQueryLength = tagStory({
  args: {label: 'Two characters', placeholder: 'Type 2+ characters', minQueryLength: 2, hasCreate: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {input, layer, visible} = parts(canvasElement);
    await userEvent.click(input);
    await userEvent.keyboard('R');
    await waitFor(() => expect(visible()).toEqual(['__xds_create__R']));
    await userEvent.keyboard('e');
    await waitFor(() => expect(visible()[0]).toBe('research'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
});

/** `tokenOverflowBehavior="unfocusedInline"`: one row with "+N more" while focus is outside; focus expands it. */
export const OverflowInline = tagStory({
  args: {
    label: 'Folded inline',
    value: ['Design', 'Engineering', 'Research', 'Marketing', 'Sales', 'Support', 'Legal', 'Finance'].map(tag),
    tokenOverflowBehavior: 'unfocusedInline',
    width: 280,
  },
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {host, input} = parts(canvasElement);
    const more = host.querySelector<HTMLElement>(':scope > [data-ax-overflow]')!;
    await waitFor(() => expect(host).toHaveAttribute('data-ax-truncated'));
    await expect(more).toHaveTextContent(/^\+\d+ more$/);
    input.focus();
    await waitFor(() => expect(host).not.toHaveAttribute('data-ax-truncated'));
    await expect(more.hidden).toBe(true);
    input.blur();
    await waitFor(() => expect(host).toHaveAttribute('data-ax-truncated'));
  },
});

/**
 * `tokenOverflowBehavior="unfocusedLayer"`: the folded field stays in place; a press opens the
 * full field in a layer over it, with the input focused.
 */
export const OverflowLayer = tagStory({
  args: {
    label: 'Folded, expands over the page',
    value: ['Design', 'Engineering', 'Research', 'Marketing', 'Sales', 'Support', 'Legal', 'Finance'].map(tag),
    tokenOverflowBehavior: 'unfocusedLayer',
    width: 280,
  },
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const host = canvasElement.querySelector<HTMLElement>('ax-tokenizer[data-ax-overlay]')!;
    const overlay = canvasElement.querySelector<HTMLElement>(`#${host.getAttribute('data-ax-overlay')}`)!;
    await waitFor(() => expect(host).toHaveAttribute('data-ax-truncated'));
    await userEvent.click(host);
    await waitFor(() => expect(isShowing(overlay)).toBe(true));
    await waitFor(() => expect(overlay.querySelector('input[role="combobox"]')).toHaveFocus());
    await expect(overlay.querySelectorAll('[data-ax-token-item]')).toHaveLength(8);
    await userEvent.tab();
    await waitFor(() => expect(isShowing(overlay)).toBe(false));
  },
});

/** `renderToken`: colored Tokens (a story wrapper); their own ✕ still removes them. */
export const CustomTokens = composed(TokenizerPeople, {
  args: {label: 'Colored tokens', hasColoredTokens: true, hasClear: false},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {host, input, tokens, remove} = parts(canvasElement);
    await expect(host.querySelector('[data-ax-token-item="margaret"] .astryx-token')).toHaveAttribute('data-color', 'teal');
    await userEvent.click(input);
    await userEvent.keyboard('ada');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(host.querySelector('[data-ax-token-item="ada"] .astryx-token')).toHaveAttribute('data-color', 'purple'));
    await userEvent.click(remove('ada'));
    await waitFor(() => expect(tokens()).toEqual(['margaret', 'susan']));
  },
}, {controls: ['label', 'size', 'hasClear', 'hasColoredTokens'], source: peopleSource});

export const Small = tagStory({args: {size: 'sm', value: [tag('Design'), tag('Research')]}});

export const Large = tagStory({args: {size: 'lg', value: [tag('Design'), tag('Research')]}});

/** Every size, every status × size, and the detached and tooltip status variants. */
export const Matrix = composed(TokenizerMatrix, {}, {source: matrixSource});

export const ErrorStatus = tagStory({
  args: {status: {type: 'error', message: 'Pick at least one tag'}},
  play: async ({canvasElement}) => {
    const {input} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(/Pick at least one tag/);
  },
});

/** A start icon, a hidden label and a Badge in the `endContent` slot. */
export const StartIconAndEndContent = tagStory({
  args: {label: 'Filter', startIcon: 'search', isLabelHidden: true, placeholder: 'Filter…', value: [tag('Marketing')], hasEndBadge: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('combobox', {name: 'Filter'})).toBeInTheDocument();
  },
});

/** Disabled with a reason: tokens lose their ✕ and Backspace removes nothing. */
export const Disabled = tagStory({
  parameters: knownA11y({
    "color-contrast": "Dimmed text in a disabled control: WCAG 1.4.3 exempts inactive components, and the control itself carries aria-disabled, which axe cannot tie this text to."
  }),
  args: {value: [tag('Design'), tag('Engineering')], isDisabled: true, disabledMessage: 'Locked by an administrator', hasClear: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {host, input, tokens} = parts(canvasElement);
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await expect(input).toHaveAccessibleDescription(/Locked by an administrator/);
    await expect(host.querySelectorAll('[data-ax-token-remove]')).toHaveLength(0);
    input.focus();
    await userEvent.keyboard('{Backspace}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(tokens()).toEqual(['design', 'engineering']);
  },
});

/** In a form: one hidden input per token id under `htmlName`; Reset restores the server value. */
export const InForm = composed(TokenizerForm, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-tokenizer');
    const {host, input, tokens} = parts(canvasElement);
    const form = canvasElement.querySelector('form')!;
    const submitted = () => new FormData(form).getAll('tag');
    await expect(submitted()).toEqual(['design', 'research']);
    await userEvent.click(input);
    await userEvent.keyboard('Sec');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(submitted()).toEqual(['design', 'research', 'security']));
    await userEvent.keyboard('{Backspace}{Backspace}');
    await waitFor(() => expect(submitted()).toEqual(['design']));
    await userEvent.click(canvas.getByRole('button', {name: 'Reset'}));
    await waitFor(() => expect(tokens()).toEqual(['design', 'research']));
    await expect(submitted()).toEqual(['design', 'research']);
    await expect(host.value.map((v) => v.id)).toEqual(['design', 'research']);
  },
}, {controls: ['label'], source: formSource});
