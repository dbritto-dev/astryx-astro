import Item from 'astryx-astro/components/Item/Item.astro';
import Demo from 'astryx-astro/components/Item/Item.demo.astro';
import demoSource from 'astryx-astro/components/Item/Item.demo.astro?raw';
import {expect, userEvent} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import ItemMatrix from './ItemMatrix.astro';
import matrixSource from './ItemMatrix.astro?raw';
import ItemRoles from './ItemRoles.astro';
import rolesSource from './ItemRoles.astro?raw';
import ItemSlots from './ItemSlots.astro';
import slotsSource from './ItemSlots.astro?raw';

const icon =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7"/></svg>';
const width = [frame({width: 420})];

const meta = {
  title: 'Table & List/Item',
  component: Item,
  ...astryx('Item'),
  args: {label: 'Release notes', description: 'Version 4.2 is out'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Item.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Label and description (each truncated to one line by default). */
export const Default: Story = {decorators: width};

/** Components in `startContent` and `endContent`: an Avatar and a Badge, an Icon and a time. */
export const WithSlots = composed(ItemSlots, {}, {controls: ['density'], source: slotsSource});

/** The `label` and `description` slots take markup instead of text. */
export const RichLabelSlots: Story = {
  args: {label: undefined, description: undefined, slots: {label: '<strong>Rich</strong> label markup', description: 'A <em>description</em> slot'}},
  decorators: width,
};

/** Every `density` and `align` value. */
export const DensityAndAlign = composed(ItemMatrix, {
  play: async ({canvas}) => {
    const pad = (density: string) => getComputedStyle(canvas.getByTestId(`density-${density}`)).paddingTop;
    await expect([pad('compact'), pad('balanced'), pad('spacious')]).toEqual(['4px', '8px', '12px']);
  },
}, {source: matrixSource});

/** `labelLines` / `descriptionLines`: wrap to two lines before the ellipsis. */
export const MultiLineTruncation: Story = {
  args: {
    labelLines: 2,
    descriptionLines: 2,
    label: 'labelLines={2}: this long label is allowed to wrap onto two lines before it ellipsizes at the end',
    description: 'descriptionLines={2}: the description wraps to two lines and then ellipsizes, which keeps tall rows in check',
  },
  decorators: [frame({width: 320})],
};

/** `layout="inline"`: label and description share one line; the description ellipsizes first. */
export const InlineLayout: Story = {args: {layout: 'inline', description: 'Version 4.2 is out with a faster build and new themes'}, decorators: [frame({width: 360})]};

/** `isHighlighted`: the hover / keyboard-highlight fill. */
export const Highlighted: Story = {args: {isHighlighted: true}, decorators: width};

/** `isSelected` on a plain row: `aria-current="true"` and the selected fill. */
export const Selected: Story = {
  args: {isSelected: true},
  decorators: width,
  play: async ({canvasElement}) => {
    const row = canvasElement.querySelector('.astryx-item')!;
    await expect(row).toHaveAttribute('aria-current', 'true');
    await expect(row).toHaveAttribute('data-selected', 'selected');
  },
};

/** `role="option"` in a listbox: the parent owns the keyboard; a selected option carries `aria-selected`. */
export const OptionRole = composed(ItemRoles, {
  play: async ({canvas}) => {
    const selected = canvas.getByRole('option', {name: /Eastern Time/});
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).not.toHaveAttribute('aria-current');
    await expect(canvas.queryAllByRole('button')).toHaveLength(0);
  },
}, {source: rolesSource});

/**
 * `interactiveRole="button"`: an invisible button in the label column is the tab stop. A click
 * anywhere else on the row is retargeted to it (one click); a nested control keeps its own.
 */
export const ButtonRow: Story = {
  args: {interactiveRole: 'button', slots: {startContent: icon, endContent: '<button type="button">Share</button>'}},
  decorators: width,
  play: async ({canvas, canvasElement, step}) => {
    const row = canvasElement.querySelector('.astryx-item')!;
    const action = canvas.getByRole('button', {name: /Release notes/});
    const activations: Event[] = [];
    row.addEventListener('click', (event) => event.target === action && activations.push(event));
    await step('A click on the row is one click on its button', async () => {
      await userEvent.click(row.querySelector('.ax-item-start')!);
      await expect(activations).toHaveLength(1);
    });
    await step('Tab reaches the row; Enter activates it', async () => {
      await userEvent.tab();
      await expect(action).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await expect(activations).toHaveLength(2);
    });
    await step('A nested button keeps its own click', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Share'}));
      await expect(activations).toHaveLength(2);
    });
  },
};

/** `href`: an invisible link; a click on the row follows it. */
export const LinkRow: Story = {
  args: {href: '#release-notes', slots: {startContent: icon}},
  decorators: width,
  play: async ({canvas, canvasElement}) => {
    const link = canvas.getByRole('link', {name: /Release notes/});
    await expect(link).toHaveAttribute('href', '#release-notes');
    // Stay on the page: the Vitest runner renders outside the preview's navigation guard.
    link.addEventListener('click', (event) => event.preventDefault());
    const followed: Event[] = [];
    link.addEventListener('click', (event) => followed.push(event));
    await userEvent.click(canvasElement.querySelector('.ax-item-start')!);
    await expect(followed).toHaveLength(1);
  },
};

/** `target="_blank"` merges `noopener noreferrer` into `rel`. */
export const LinkRowNewTab: Story = {
  args: {href: '/changelog/', target: '_blank', slots: {startContent: icon}},
  decorators: width,
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: /Release notes/});
    await expect(link.getAttribute('rel')).toMatch(/noopener/);
    await expect(link.getAttribute('rel')).toMatch(/noreferrer/);
  },
};

/**
 * `interactiveRef="input"`: the row is an enlarged target for its checkbox (one tab stop). The
 * checkbox opts into the `item-description` cascade, so the description describes it.
 */
export const DelegateRow: Story = {
  args: {
    label: 'Weekly digest',
    description: 'A summary every Monday',
    interactiveRef: 'input',
    slots: {startContent: '<input type="checkbox" aria-label="Weekly digest" data-ax-inherit="item-description">'},
  },
  decorators: width,
  play: async ({canvas, canvasElement}) => {
    const checkbox = canvas.getByRole('checkbox', {name: 'Weekly digest'});
    await expect(checkbox).toHaveAccessibleDescription('A summary every Monday');
    await expect(canvasElement.querySelectorAll('.astryx-item button, .astryx-item a')).toHaveLength(0);
    await userEvent.click(canvasElement.querySelector('.ax-item-label')!);
    await expect(checkbox).toBeChecked();
    await userEvent.click(checkbox);
    await expect(checkbox).not.toBeChecked();
  },
};

/** A disabled button row: dimmed, a native disabled button, no activation. */
export const DisabledButtonRow: Story = {
  args: {interactiveRole: 'button', isDisabled: true},
  decorators: width,
  play: async ({canvas, canvasElement}) => {
    const action = canvas.getByRole('button', {name: /Release notes/});
    const row = canvasElement.querySelector<HTMLElement>('.astryx-item')!;
    await expect(action).toBeDisabled();
    await expect(row).toHaveAttribute('aria-disabled', 'true');
    const activations: Event[] = [];
    canvasElement.addEventListener('click', (event) => event.target === action && activations.push(event));
    // The disabled row takes no pointer input (pointer-events: none), so click it directly.
    row.click();
    await expect(activations).toHaveLength(0);
  },
};

/** A disabled link row renders no destination (`aria-disabled` link, out of the tab order). */
export const DisabledLinkRow: Story = {
  args: {href: '/changelog/', isDisabled: true},
  decorators: width,
  play: async ({canvasElement}) => {
    const link = canvasElement.querySelector('.astryx-item a')!;
    await expect(link).not.toHaveAttribute('href');
    await expect(link).toHaveAttribute('aria-disabled', 'true');
  },
};

/**
 * `swipeActions`: the leading and trailing panels (neutral, accent and destructive verbs) are
 * rendered inert and zero-width at rest; the swipe gesture itself is deferred in the port.
 */
export const SwipeActionPanels: Story = {
  args: {
    swipeActions: {
      leading: [{label: 'Pin', variant: 'neutral'}],
      trailing: [{label: 'Archive', variant: 'accent'}, {label: 'Delete', variant: 'destructive', hasRemoval: true}],
    },
  },
  decorators: width,
  play: async ({canvasElement}) => {
    const panels = [...canvasElement.querySelectorAll<HTMLElement>('.astryx-item-swipe-panel')];
    await expect(panels).toHaveLength(2);
    for (const panel of panels) {
      await expect(panel.inert).toBe(true);
      await expect(panel.getBoundingClientRect().width).toBe(0);
    }
  },
};
