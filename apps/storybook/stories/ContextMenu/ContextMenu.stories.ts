import ContextMenu from 'astryx-astro/components/ContextMenu/ContextMenu.astro';
import Demo from 'astryx-astro/components/ContextMenu/ContextMenu.demo.astro';
import demoSource from 'astryx-astro/components/ContextMenu/ContextMenu.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ContextMenuCompound from './ContextMenuCompound.astro';
import compoundSource from './ContextMenuCompound.astro?raw';
import ContextMenuInline from './ContextMenuInline.astro';
import inlineSource from './ContextMenuInline.astro?raw';

const area = (text: string) =>
  `<div tabindex="0" style="display:grid;place-items:center;min-height:140px;padding:var(--spacing-4);border:var(--border-width) dashed var(--color-border-emphasized);border-radius:var(--radius-container);background:var(--color-background-muted);color:var(--color-text-secondary);font-size:var(--font-size-sm)">${text}</div>`;
const items = [
  {label: 'Cut', id: 'cut', endContent: {keys: 'mod+x'}},
  {label: 'Copy', id: 'copy', icon: 'copy', endContent: {keys: 'mod+c'}},
  {label: 'Paste', id: 'paste', endContent: {keys: 'mod+v'}, isDisabled: true},
  {type: 'divider'},
  {label: 'Share', icon: 'externalLink', items: [{label: 'Email', id: 'email'}, {label: 'Messages', id: 'messages'}]},
  {label: 'Delete', variant: 'destructive', id: 'delete'},
];

const meta = {
  title: 'Action/Context Menu',
  component: ContextMenu,
  ...astryx('ContextMenu'),
  args: {items, slots: {default: area('Right-click anywhere in this canvas (or focus it and press Shift+F10)')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ContextMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const parts = (root: HTMLElement) => ({
  layer: root.querySelector<HTMLElement>('ax-menu')!,
  area: root.querySelector<HTMLElement>('.ax-context-menu-trigger')!,
  target: root.querySelector<HTMLElement>('.ax-context-menu-trigger [tabindex]')!,
});
const rightClick = (target: Element, x: number, y: number) => {
  const r = target.getBoundingClientRect();
  return userEvent.pointer({keys: '[MouseRight]', target, coords: {clientX: r.left + x, clientY: r.top + y}});
};
const focusedRow = () => (document.activeElement as HTMLElement | null)?.querySelector('.ax-item-label')?.textContent ?? document.activeElement?.textContent;

/**
 * A right-click opens the menu at the pointer (no native menu) on its first row; arrows skip the
 * disabled row; typeahead jumps; a second right-click moves it; a press outside the menu closes
 * it; Enter on a row reports `astryx-select` and closes.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, area: trigger} = parts(canvasElement);
    const contextmenus = recordEvents<MouseEvent>(canvasElement, 'contextmenu');
    const changes = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
    const selected = recordEvents(canvasElement, 'astryx-select');

    await step('A right-click opens the menu at the pointer, on its first row', async () => {
      await rightClick(trigger, 120, 40);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(contextmenus.at(-1)?.defaultPrevented).toBe(true);
      const menu = canvas.getByRole('menu', {name: 'Context menu'});
      const t = trigger.getBoundingClientRect();
      await waitFor(() => expect(Math.abs(menu.getBoundingClientRect().left - (t.left + 120))).toBeLessThanOrEqual(2));
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: /Cut/})).toHaveFocus());
    });

    await step('Arrows skip the disabled row; typeahead jumps', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(canvas.getByRole('menuitem', {name: /Copy/})).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}');
      await expect(focusedRow()).toBe('Share');
      await userEvent.keyboard('d');
      await expect(canvas.getByRole('menuitem', {name: 'Delete'})).toHaveFocus();
    });

    await step('A second right-click moves the open menu', async () => {
      await rightClick(trigger, 300, 80);
      await expect(isShowing(layer)).toBe(true);
      const t = trigger.getBoundingClientRect();
      await waitFor(() => expect(Math.abs(canvas.getByRole('menu').getBoundingClientRect().left - (t.left + 300))).toBeLessThanOrEqual(2));
    });

    await step('A press outside the menu (here, in the trigger area) closes it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });

    await step('Enter on a row reports astryx-select and closes the menu', async () => {
      await rightClick(trigger, 60, 30);
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: /Cut/})).toHaveFocus());
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(selected.map((e) => (e.target as HTMLElement).dataset.id)).toEqual(['copy']);
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false]);
  },
};

/**
 * The keyboard way in: Shift+F10 on the focused area opens the menu at its bottom-start;
 * ArrowRight opens a sub-menu, Escape closes one level at a time, and focus returns to the
 * area; Tab closes the menu.
 */
export const KeyboardInvocation: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, area: trigger, target} = parts(canvasElement);
    const selected = recordEvents(canvasElement, 'astryx-select');

    await step('Shift+F10 opens the menu at the area’s bottom-start, on the first row', async () => {
      target.focus();
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: /Cut/})).toHaveFocus());
      // Measured once the entry motion (a short scale-in) has settled.
      await waitFor(() => {
        const t = trigger.getBoundingClientRect();
        const m = canvas.getByRole('menu').getBoundingClientRect();
        expect(Math.abs(m.left - t.left)).toBeLessThanOrEqual(2);
        expect(Math.abs(m.top - t.bottom)).toBeLessThanOrEqual(2);
      });
    });

    await step('ArrowRight opens the sub-menu; Escape closes only the sub-menu', async () => {
      await userEvent.keyboard('s');
      await expect(focusedRow()).toBe('Share');
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Email'})).toHaveFocus());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(focusedRow()).toBe('Share'));
      await expect(isShowing(layer)).toBe(true);
    });

    await step('A sub-menu row acts: astryx-select, the whole menu closes, focus returns', async () => {
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Email'})).toHaveFocus());
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(selected.map((e) => (e.target as HTMLElement).dataset.id)).toEqual(['email']);
      await expect(target).toHaveFocus();
    });

    await step('Escape closes and returns focus; Tab closes too', async () => {
      // Focus moves to the first row a frame after the menu shows: keys wait for it.
      const firstRow = () => canvas.getByRole('menuitem', {name: /Cut/});
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await waitFor(() => expect(firstRow()).toHaveFocus());
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(target).toHaveFocus();
      await userEvent.keyboard('{Shift>}{F10}{/Shift}');
      await waitFor(() => expect(firstRow()).toHaveFocus());
      await userEvent.tab();
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });
  },
};

/**
 * Compound rows (`menuContent` slot), `size="sm"`, `menuWidth={220}` and a `label`: a checkbox
 * row toggles and keeps the menu open, a radio row selects and closes it.
 */
export const CompoundRows = composed(ContextMenuCompound, {
  args: {size: 'sm', menuWidth: 220, label: 'Layer actions'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, area: trigger} = parts(canvasElement);
    const changes = recordEvents<{value: unknown}>(canvasElement, 'astryx-change');
    await rightClick(trigger, 50, 30);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    const menu = canvas.getByRole('menu', {name: 'Layer actions'});
    await waitFor(() => expect(menu.getBoundingClientRect().width).toBeGreaterThanOrEqual(219));
    const locked = canvas.getByRole('menuitemcheckbox', {name: 'Locked'});
    await expect(locked).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(locked);
    await expect(locked).toHaveAttribute('aria-checked', 'true');
    await expect(changes.at(-1)?.detail.value).toBe(true);
    await expect(isShowing(layer)).toBe(true);
    await userEvent.click(canvas.getByRole('menuitemradio', {name: 'Multiply'}));
    await expect(canvas.getByRole('menuitemradio', {name: 'Multiply', hidden: true})).toHaveAttribute('aria-checked', 'true');
    await expect(changes.at(-1)?.detail.value).toBe('multiply');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, {controls: ['size', 'menuWidth', 'label'], source: compoundSource});

/** `size="lg"`: larger rows. */
export const LargeSize: Story = {
  args: {size: 'lg'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, target} = parts(canvasElement);
    target.focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getAllByRole('menuitem').length).toBeGreaterThanOrEqual(5);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
};

/** `triggerAs="span"`: an inline trigger area inside prose. */
export const InlineTrigger = composed(ContextMenuInline, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, area: trigger} = parts(canvasElement);
    await expect(trigger.tagName).toBe('SPAN');
    await rightClick(trigger, 10, 5);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(canvas.getByRole('menu', {name: 'Reference actions'})).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, {source: inlineSource});

/** `isDisabled`: the area keeps the browser's own context menu. */
export const Disabled: Story = {
  args: {isDisabled: true, slots: {default: area('Disabled: the browser’s context menu')}},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    const {layer, area: trigger} = parts(canvasElement);
    const contextmenus = recordEvents<MouseEvent>(canvasElement, 'contextmenu');
    await rightClick(trigger, 20, 20);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(contextmenus.at(-1)?.defaultPrevented).toBe(false);
    await expect(isShowing(layer)).toBe(false);
  },
};
