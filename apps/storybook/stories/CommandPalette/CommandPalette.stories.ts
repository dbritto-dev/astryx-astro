import CommandPalette from 'astryx-astro/components/CommandPalette/CommandPalette.astro';
import Demo from 'astryx-astro/components/CommandPalette/CommandPalette.demo.astro';
import demoSource from 'astryx-astro/components/CommandPalette/CommandPalette.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import CommandPaletteParts from './CommandPaletteParts.astro';
import partsSource from './CommandPaletteParts.astro?raw';
import CommandPaletteStory from './CommandPaletteStory.astro';
import paletteSource from './CommandPaletteStory.astro?raw';

const meta = {
  title: 'Overlay/Command Palette',
  component: CommandPalette,
  ...astryx('CommandPalette'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (CommandPalette.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['source', 'isOpen', 'isInline', 'label', 'value', 'width', 'maxHeight', 'hotkey', 'emptySearchText'], source: paletteSource};
const parts = (root: HTMLElement) => {
  const dialog = root.querySelector<HTMLElement>('ax-command-palette dialog, ax-command-palette [data-ax-inline]')!;
  const input = dialog.querySelector<HTMLInputElement>('input')!;
  return {
    dialog,
    input,
    /** The values of the result rows shown, in order. */
    rows: () => [...dialog.querySelectorAll<HTMLElement>('[role="option"]')].filter((o) => !o.hidden && !o.closest('[hidden]')).map((o) => o.dataset.value),
    /** The groups shown, by name. */
    groups: () => [...dialog.querySelectorAll<HTMLElement>('[role="group"]')].filter((g) => !g.hidden).map((g) => g.getAttribute('aria-label')),
    /** The highlighted row (aria-activedescendant). */
    active: () => document.getElementById(input.getAttribute('aria-activedescendant') ?? '')?.dataset.value ?? null,
  };
};

/**
 * Open from the trigger: a modal dialog with the search field focused and every command listed
 * in groups. Typing filters; ↓/↑ move the highlight (aria-activedescendant); Enter runs the
 * command (`astryx-select`), the palette closes and focus returns to the trigger.
 */
export const Default = composed(CommandPaletteStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const trigger = canvas.getByRole('button', {name: 'Open command palette'});
    const {dialog, input, rows, groups, active} = parts(canvasElement);
    const selected = recordEvents<{value: string; item: {label: string}}>(canvasElement, 'astryx-select');

    await step('The trigger opens the palette with every command, the field focused', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
      await expect(dialog).toHaveAccessibleName('Command palette');
      await waitFor(() => expect(input).toHaveFocus());
      await expect(input).toHaveAttribute('role', 'combobox');
      await expect(input).toHaveAttribute('aria-expanded', 'true');
      await expect(rows()).toEqual(['new-file', 'search', 'copy-link', 'home', 'calendar', 'theme', 'help']);
      await expect(groups()).toEqual(['Actions', 'Navigation', 'Preferences']);
      await expect(active()).toBeNull();
    });

    await step('Typing filters the rows; the groups follow', async () => {
      await userEvent.type(input, 'o');
      await waitFor(() => expect(rows()).toEqual(['copy-link', 'home', 'calendar', 'theme']));
      await expect(groups()).toEqual(['Actions', 'Navigation', 'Preferences']);
    });

    await step('Arrows move the highlight (clamped at the ends)', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(active()).toBe('copy-link');
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      await expect(active()).toBe('calendar');
      await userEvent.keyboard('{PageDown}{ArrowDown}');
      await expect(active()).toBe('theme');
      await userEvent.keyboard('{ArrowUp}');
      await expect(active()).toBe('calendar');
    });

    await step('Enter runs the highlighted command, closes the palette, focus returns', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
      await expect(selected.map((e) => [e.detail.value, e.detail.item.label])).toEqual([['calendar', 'Open calendar']]);
      await expect(trigger).toHaveFocus();
      await expect(canvasElement.querySelector('[data-command-output]')).toHaveTextContent('Ran: Open calendar (calendar)');
    });
  },
}, options);

/**
 * A query with no match shows `emptySearchText` and the list stops being a listbox; Escape
 * closes the palette through the layer stack.
 */
export const EmptySearch = composed(CommandPaletteStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const {dialog, input, rows} = parts(canvasElement);
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');
    await userEvent.click(canvas.getByRole('button', {name: 'Open command palette'}));
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, 'zzz');
    await waitFor(() => expect(dialog).toHaveTextContent('No commands match'));
    await expect(rows()).toEqual([]);
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).not.toHaveAttribute('aria-controls');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
    await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'escape'});
  },
}, options);

/** Pointer: hovering a row highlights it, a click runs it; a press on the backdrop closes the palette. */
export const Pointer = composed(CommandPaletteStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const trigger = canvas.getByRole('button', {name: 'Open command palette'});
    const {dialog, active} = parts(canvasElement);
    const selected = recordEvents<{value: string}>(canvasElement, 'astryx-select');
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    const row = canvas.getByRole('option', {name: /Go to dashboard/});
    await userEvent.hover(row);
    await expect(active()).toBe('home');
    await userEvent.click(row);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
    await expect(selected.map((e) => e.detail.value)).toEqual(['home']);
    await userEvent.click(trigger);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await userEvent.click(dialog);
    await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
  },
}, options);

/** `hotkey="mod+shift+k"` (⌘ on Apple, Ctrl elsewhere) opens the palette from anywhere on the page. */
export const Hotkey = composed(CommandPaletteStory, {
  args: {hotkey: 'mod+shift+k'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const {dialog} = parts(canvasElement);
    const apple = /Mac|iPhone|iPad/.test(navigator.platform);
    await userEvent.keyboard(apple ? '{Meta>}{Shift>}k{/Shift}{/Meta}' : '{Control>}{Shift>}k{/Shift}{/Control}');
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
  },
}, options);

/**
 * Picker mode (`value`): the selected command is marked and highlighted when the palette opens;
 * picking another reports the new value. `maxHeight={360}` caps the list.
 */
export const PickerMode = composed(CommandPaletteStory, {
  args: {source: 'themes', value: 'matcha'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const {dialog, active} = parts(canvasElement);
    const selected = recordEvents<{value: string}>(canvasElement, 'astryx-select');
    await userEvent.click(canvas.getByRole('button', {name: 'Choose theme'}));
    await waitFor(() => expect(dialog.matches(':modal')).toBe(true));
    await expect(dialog).toHaveAccessibleName('Theme picker');
    await expect(canvas.getByRole('option', {name: 'Matcha'})).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(active()).toBe('matcha'));
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(dialog.matches(':modal')).toBe(false));
    await expect(selected.map((e) => e.detail.value)).toEqual(['stone']);
  },
}, options);

/**
 * An asynchronous source (`astryx-query`, answered after 600 ms, `width={520}`): no query shows
 * the bootstrap text; a pending first query shows a busy spinner; the answer lists grouped
 * results; Enter runs one.
 */
export const AsyncSource = composed(CommandPaletteStory, {
  args: {source: 'people'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const {dialog, input, rows, groups} = parts(canvasElement);
    const selected = recordEvents<{value: string}>(canvasElement, 'astryx-select');
    await userEvent.click(canvas.getByRole('button', {name: 'Search people'}));
    await waitFor(() => expect(input).toHaveFocus());
    await expect(dialog).toHaveTextContent('Start typing a name');
    await userEvent.type(input, 'a');
    await waitFor(() => expect(input).toHaveAttribute('aria-busy'));
    await waitFor(() => expect(rows()).toHaveLength(8), {timeout: 3000});
    await expect(groups()).toEqual(['A–G', 'H–Z']);
    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {timeout: 3000});
    await userEvent.type(input, 'r');
    // Narrowed at once from the previous results, then replaced by the answer.
    await waitFor(() => expect(rows()).toEqual(['barbara-liskov', 'margaret-hamilton', 'susan-kare']));
    await waitFor(() => expect(input).not.toHaveAttribute('aria-busy'), {timeout: 3000});
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(selected.map((e) => e.detail.value)).toEqual(['barbara-liskov']));
  },
}, options);

/** Rendered open (`isOpen`); a modal on load, so docs show it in its own frame. */
export const OpenOnLoad = composed(CommandPaletteStory, {
  args: {isOpen: true},
  parameters: {docs: {story: {inline: false, height: '560px'}}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    await waitFor(() => expect(parts(canvasElement).dialog.matches(':modal')).toBe(true));
  },
}, options);

/** `isInline`: drawn in flow for documentation (no modal, no auto focus); it still filters. */
export const Inline = composed(CommandPaletteStory, {
  args: {isInline: true, isOpen: true, width: 'min(560px, 100%)', maxHeight: 320},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-command-palette');
    const {input, rows} = parts(canvasElement);
    await expect(input).not.toHaveFocus();
    await userEvent.type(input, 'link');
    await waitFor(() => expect(rows()).toEqual(['copy-link']));
  },
}, options);

/** The parts on their own: input, list, a group, items (highlighted, selected, disabled), empty state, footer. */
export const Parts = composed(CommandPaletteParts, {
  play: async ({canvas, canvasElement}) => {
    const selected = recordEvents<{value: string}>(canvasElement, 'astryx-select');
    await expect(canvas.getByRole('searchbox', {name: 'Filter commands'})).toBeInTheDocument();
    await expect(canvas.getByRole('listbox', {name: 'Quick actions'})).toBeInTheDocument();
    await expect(canvas.getByRole('option', {name: 'Share'})).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.getByRole('option', {name: 'Archive (unavailable)'})).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(canvas.getByRole('option', {name: 'Open project'}));
    await expect(selected.map((e) => e.detail.value)).toEqual(['open']);
  },
}, {source: partsSource});
