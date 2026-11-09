import Collapsible from 'astryx-astro/components/Collapsible/Collapsible.astro';
import Demo from 'astryx-astro/components/Collapsible/Collapsible.demo.astro';
import demoSource from 'astryx-astro/components/Collapsible/Collapsible.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import CollapsibleGroupStory from './CollapsibleGroupStory.astro';
import groupSource from './CollapsibleGroupStory.astro?raw';

const meta = {
  title: 'Container/Collapsible',
  component: Collapsible,
  ...astryx('Collapsible'),
  args: {
    trigger: 'Shipping details',
    slots: {
      default:
        '<p style="margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary)">Orders ship within two business days. ' +
        '<a href="/help/shipping/">Read the shipping policy</a>.</p>',
    },
  },
  parameters: {layout: 'padded'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Collapsible.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const parts = async (canvasElement: HTMLElement) => {
  const root = await upgraded<HTMLElement & {close(): void}>(canvasElement, 'ax-collapsible');
  const trigger = root.querySelector<HTMLButtonElement>('.astryx-collapsible-trigger')!;
  const content = document.getElementById(trigger.getAttribute('aria-controls')!)!;
  return {root, trigger, content};
};

/**
 * Open by default (`defaultIsOpen` is true). Click, Enter or Space toggles; closed content is
 * `hidden="until-found"` (find-in-page still reaches it); each user toggle reports
 * `astryx-open-change`. Focus inside the content moves to the trigger when it closes.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const {root, trigger, content} = await parts(canvasElement);
    const changes = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
    await expect(trigger).toBe(canvas.getByRole('button', {name: 'Shipping details'}));

    await step('Open: aria-expanded and the region shown', async () => {
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(content).toBeVisible();
    });
    await step('A click closes it: hidden until found, astryx-open-change {isOpen: false}', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await expect(content).toHaveAttribute('hidden', 'until-found');
      await expect(changes.map((event) => event.detail.isOpen)).toEqual([false]);
    });
    await step('Enter opens it, Space closes it', async () => {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
      await userEvent.keyboard(' ');
      await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
      await expect(changes.map((event) => event.detail.isOpen)).toEqual([false, true, false]);
    });
    await step('Closing with focus inside the content moves focus to the trigger', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(content).toBeVisible());
      canvas.getByRole('link', {name: 'Read the shipping policy'}).focus();
      root.close();
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  },
};

/** `defaultIsOpen={false}`: closed on load; the content takes no space. */
export const Closed: Story = {
  args: {defaultIsOpen: false},
  play: async ({canvasElement}) => {
    const {trigger, content} = await parts(canvasElement);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(content).toHaveAttribute('hidden', 'until-found');
    await expect(content.getBoundingClientRect().height).toBe(0);
  },
};

/** `chevronPosition="start"`: a leading arrow, pointing inward when closed and down when open. */
export const ChevronStart: Story = {
  args: {chevronPosition: 'start'},
  play: async ({canvasElement}) => {
    const {trigger} = await parts(canvasElement);
    const chevron = trigger.querySelector('.ax-collapsible-chevron')!.getBoundingClientRect();
    const label = trigger.querySelector('.ax-collapsible-label')!.getBoundingClientRect();
    await expect(chevron.left).toBeLessThan(label.left);
  },
};

/** The `trigger` slot: rich trigger content instead of the `trigger` text. */
export const TriggerSlot: Story = {
  args: {
    trigger: undefined,
    slots: {
      trigger: '<span style="display:inline-flex;gap:var(--spacing-2);align-items:baseline"><strong>Order #1042</strong><span style="color:var(--color-text-secondary)">3 items</span></span>',
      default: '<p style="margin:0;font-size:var(--font-size-sm)">Notebook, pen set and a desk lamp.</p>',
    },
  },
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: /Order #1042/})).toHaveAttribute('aria-expanded', 'true');
  },
};

/** `isDisabled`: dimmed, aria-disabled and out of the tab order; it never toggles (closed here). */
export const Disabled: Story = {
  args: {isDisabled: true, defaultIsOpen: false},
  play: async ({canvasElement}) => {
    const {trigger, content} = await parts(canvasElement);
    const changes = recordEvents(canvasElement, 'astryx-open-change');
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    await expect(trigger).toHaveAttribute('tabindex', '-1');
    await expect(trigger).not.toBeDisabled();
    // A disabled closed item uses plain `hidden`: find-in-page cannot open it.
    await expect(content).toHaveAttribute('hidden', '');
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(changes).toHaveLength(0);
  },
};

/** A disabled item that is open stays open. */
export const DisabledOpen: Story = {
  args: {isDisabled: true},
  play: async ({canvasElement}) => {
    const {trigger} = await parts(canvasElement);
    await userEvent.click(trigger);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

/** `animatedLayout`: the height glides open and closed (immediate with reduced motion). */
export const Animated: Story = {
  args: {animatedLayout: true},
  play: async ({canvasElement}) => {
    const {trigger, content} = await parts(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
    await waitFor(() => expect(content).toHaveAttribute('hidden', 'until-found'));
    await userEvent.click(trigger);
    await waitFor(() => expect(content).toBeVisible());
  },
};

const groupOptions = {controls: ['type', 'defaultValue', 'hasDividers', 'density', 'chevronPosition'], source: groupSource};
const items = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('ax-collapsible')];
const openValues = (root: HTMLElement) => items(root).filter((item) => item.querySelector('[aria-expanded="true"]')).map((item) => item.dataset.value);

/**
 * CollapsibleGroup `type="single"` with dividers (balanced density): opening one item closes the
 * other. The group reports `astryx-change` {value}; the items report nothing themselves.
 */
export const GroupSingle = composed(CollapsibleGroupStory, {
  play: async ({canvas, canvasElement, step}) => {
    const group = await upgraded<HTMLElement & {value: string}>(canvasElement, 'ax-collapsible-group');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const itemChanges = recordEvents(canvasElement, 'astryx-open-change');
    await expect(openValues(canvasElement)).toEqual(['what']);
    await step('Opening another item closes the open one', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'How do I get started?'}));
      await waitFor(() => expect(openValues(canvasElement)).toEqual(['start']));
      await expect(changes.map((event) => event.detail.value)).toEqual(['start']);
      await expect(group.value).toBe('start');
    });
    await step('Toggling the open item closes everything (value "")', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'How do I get started?'}));
      await waitFor(() => expect(openValues(canvasElement)).toEqual([]));
      await expect(changes.at(-1)?.detail.value).toBe('');
      await expect(itemChanges).toHaveLength(0);
    });
  },
}, groupOptions);

/** `type="multiple"`: items open and close independently; the value is an array. */
export const GroupMultiple = composed(CollapsibleGroupStory, {
  args: {type: 'multiple', defaultValue: ['what', 'start']},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-collapsible-group');
    const changes = recordEvents<{value: string[]}>(canvasElement, 'astryx-change');
    await expect(openValues(canvasElement)).toEqual(['what', 'start']);
    await userEvent.click(canvas.getByRole('button', {name: 'Can I bring my own theme?'}));
    await waitFor(() => expect(openValues(canvasElement)).toEqual(['what', 'start', 'themes']));
    await expect(changes.at(-1)?.detail.value).toEqual(['what', 'start', 'themes']);
    await userEvent.click(canvas.getByRole('button', {name: 'What is Astryx?'}));
    await waitFor(() => expect(changes.at(-1)?.detail.value).toEqual(['start', 'themes']));
  },
}, groupOptions);

/** `density="compact"` (with dividers). */
export const DensityCompact = composed(CollapsibleGroupStory, {args: {density: 'compact'}}, groupOptions);

/** `density="balanced"` (the default with dividers). */
export const DensityBalanced = composed(CollapsibleGroupStory, {args: {density: 'balanced'}}, groupOptions);

/** `density="spacious"`. */
export const DensitySpacious = composed(CollapsibleGroupStory, {args: {density: 'spacious'}}, groupOptions);

/** Without dividers: no group box, the items keep no row chrome. */
export const GroupWithoutDividers = composed(CollapsibleGroupStory, {args: {hasDividers: false}}, groupOptions);

/** The group's `chevronPosition="start"` reaches items that set none. */
export const GroupChevronStart = composed(CollapsibleGroupStory, {args: {chevronPosition: 'start'}}, groupOptions);
