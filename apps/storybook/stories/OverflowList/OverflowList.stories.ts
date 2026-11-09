import OverflowList from 'astryx-astro/components/OverflowList/OverflowList.astro';
import Demo from 'astryx-astro/components/OverflowList/OverflowList.demo.astro';
import demoSource from 'astryx-astro/components/OverflowList/OverflowList.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import OverflowListParent from './OverflowListParent.astro';
import parentSource from './OverflowListParent.astro?raw';

// Plain (non-interactive) tags and a "+N more" indicator: the indicator only counts, so nothing
// in these stories looks clickable without doing anything.
const tag = 'font-size:var(--font-size-sm);padding:var(--spacing-1) var(--spacing-2);border-radius:var(--radius-full);background:var(--color-background-muted);color:var(--color-text-primary);white-space:nowrap';
const more = `${tag};background:var(--color-accent-muted);color:var(--color-text-accent)`;
const labels = ['Overview', 'Activity', 'Settings', 'Members', 'Billing', 'Integrations', 'Security', 'Audit log'];
const items = (list: string[]) => list.map((label) => `<span style="${tag}">${label}</span>`).join('');
const indicator = `<span style="${more}">+<span data-overflow-count></span> more</span>`;

const meta = {
  title: 'Table & List/Overflow List',
  component: OverflowList,
  ...astryx('OverflowList'),
  args: {slots: {default: items(labels), overflow: indicator}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (OverflowList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type ListElement = HTMLElement & {visibleCount: number; overflowItems: {index: number; element: Element}[]};
const state = (list: ListElement) => {
  const children = [...list.children].filter((el) => !el.hasAttribute('data-overflow-indicator')) as HTMLElement[];
  const indicatorEl = list.querySelector<HTMLElement>('[data-overflow-indicator]');
  return {
    visible: children.filter((el) => !el.hasAttribute('data-overflow-hidden')).map((el) => el.textContent),
    hidden: children.filter((el) => el.hasAttribute('data-overflow-hidden')),
    indicator: indicatorEl,
    count: indicatorEl?.querySelector('[data-overflow-count]')?.textContent,
  };
};

/**
 * In a narrow frame the items that don't fit collapse from the end (out of flow and inert) and
 * the indicator shows how many. Widening the frame brings them back and reports
 * `astryx-overflow-change` with an empty set.
 */
export const CollapseFromEnd: Story = {
  decorators: [frame({width: 320})],
  play: async ({canvasElement, step}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    const changes = recordEvents<{overflowItems: {index: number}[]}>(canvasElement, 'astryx-overflow-change');
    await step('Narrow: the last items collapse; "+N" counts them', async () => {
      await waitFor(() => expect(state(list).hidden.length).toBeGreaterThan(0));
      const s = state(list);
      await expect(s.visible[0]).toBe('Overview');
      await expect(s.hidden.at(-1)).toHaveTextContent('Audit log');
      for (const el of s.hidden) await expect(el.inert).toBe(true);
      await expect(s.count).toBe(String(s.hidden.length));
      await expect(s.indicator).not.toHaveAttribute('data-overflow-hidden');
      await expect(list.visibleCount).toBe(s.visible.length);
      await expect(list.overflowItems.map((item) => item.index).at(-1)).toBe(7);
    });
    await step('Wider: everything fits, the indicator leaves, the change is reported', async () => {
      canvasElement.querySelector<HTMLElement>('[data-story-frame]')!.style.width = '1000px';
      await waitFor(() => expect(state(list).hidden).toHaveLength(0));
      await expect(state(list).indicator).toHaveAttribute('data-overflow-hidden');
      await waitFor(() => expect(changes.at(-1)?.detail.overflowItems).toEqual([]));
    });
  },
};

/** Wide enough for every item: no indicator. */
export const AllFit: Story = {
  decorators: [frame({width: 900})],
  play: async ({canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(list.visibleCount).toBe(8));
    await expect(state(list).indicator).toHaveAttribute('data-overflow-hidden');
  },
};

/** `collapseFrom="start"` (breadcrumb-style), `minVisibleItems={1}`: the earliest items collapse, the last stays. */
export const CollapseFromStart: Story = {
  args: {
    collapseFrom: 'start',
    minVisibleItems: 1,
    gap: 1,
    slots: {
      default: ['Home', 'Projects', 'Design system', 'Components', 'Layout', 'Overflow List']
        .map((crumb, i, all) => `<span style="font-size:var(--font-size-sm);color:var(--color-text-secondary)">${crumb}${i < all.length - 1 ? ' /' : ''}</span>`)
        .join(''),
      overflow: '<span style="font-size:var(--font-size-sm);color:var(--color-text-secondary)">… (<span data-overflow-count></span>) /</span>',
    },
  },
  decorators: [frame({width: 300})],
  play: async ({canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(state(list).hidden.length).toBeGreaterThan(0));
    const s = state(list);
    await expect(s.hidden[0]).toHaveTextContent('Home');
    await expect(s.visible.at(-1)).toBe('Overflow List');
    await expect(list.firstElementChild).toBe(s.indicator);
  },
};

/** `minVisibleItems={2}`: at least two items stay, even in a very narrow frame. */
export const MinVisibleItems: Story = {
  args: {minVisibleItems: 2},
  decorators: [frame({width: 140})],
  play: async ({canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(state(list).hidden.length).toBeGreaterThan(0));
    await expect(list.visibleCount).toBe(2);
  },
};

/** `maxVisibleItems={3}`: never more than three, even when everything fits. */
export const MaxVisibleItems: Story = {
  args: {maxVisibleItems: 3, slots: {default: items(labels.slice(0, 5)), overflow: indicator}},
  decorators: [frame({width: 900})],
  play: async ({canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(list.visibleCount).toBe(3));
    await expect(state(list).count).toBe('2');
  },
};

/** `maxRows={2}`: wraps onto two rows, then collapses the rest. */
export const TwoRows: Story = {
  args: {
    maxRows: 2,
    gap: 1.5,
    slots: {default: items(['design', 'frontend', 'astro', 'css', 'tokens', 'theming', 'a11y', 'layout', 'web components', 'performance', 'docs', 'testing']), overflow: indicator},
  },
  decorators: [frame({width: 340})],
  play: async ({canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(state(list).hidden.length).toBeGreaterThan(0));
    const tops = new Set(
      [...list.children].filter((el) => !el.hasAttribute('data-overflow-hidden')).map((el) => Math.round(el.getBoundingClientRect().top)),
    );
    await expect(tops.size).toBe(2);
  },
};

/** `behavior="observeParent"`: content-sized until it overflows its parent, then it fills it. */
export const ObserveParent = composed(OverflowListParent, {
  play: async ({canvas, canvasElement}) => {
    const list = await upgraded<ListElement>(canvasElement, 'ax-overflow-list');
    await waitFor(() => expect(state(list).hidden.length).toBeGreaterThan(0));
    const parent = canvas.getByTestId('parent').getBoundingClientRect();
    await expect(list.getBoundingClientRect().right).toBeLessThanOrEqual(parent.right);
  },
}, {controls: ['behavior', 'parentWidth'], source: parentSource});
