import TabList from 'astryx-astro/components/TabList/TabList.astro';
import Demo from 'astryx-astro/components/TabList/TabList.demo.astro';
import demoSource from 'astryx-astro/components/TabList/TabList.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import TabListStory from './TabListStory.astro';
import storySource from './TabListStory.astro?raw';

const meta = {
  title: 'Navigation/Tab List',
  component: TabList,
  ...astryx('TabList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TabList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['value', 'size', 'layout', 'hasDivider', 'overflow', 'tabs', 'dir', 'width'], source: storySource};

type TabListElement = HTMLElement & {value: string};
const tab = (root: Element, value: string) => root.querySelector<HTMLElement>(`[data-tab-value="${value}"]`)!;
const current = (root: Element) => [...root.querySelectorAll('[data-tab-value][aria-current="true"]')].map((t) => t.getAttribute('data-tab-value'));
const stops = (root: Element) => [...root.querySelectorAll('[data-tab-value],[data-tab-menu]')].filter((t) => t.getAttribute('tabindex') === '0').map((t) => t.getAttribute('data-tab-value') ?? 'menu');
const focused = () => (document.activeElement as HTMLElement | null)?.dataset.tabValue ?? (document.activeElement?.hasAttribute('data-tab-menu') ? 'menu' : null);

/**
 * The navigation pattern: a named landmark of button tabs, one Tab stop with a keyboard hint.
 * Arrows (both axes) and Home / End move focus only, skipping the disabled tab; Enter, Space or a
 * click selects (`aria-current`, `astryx-change` `{value}`, cancelable); `el.value` sets the
 * selection without an event.
 */
export const Default = composed(TabListStory, {
  play: async ({canvas, canvasElement, step}) => {
    const root = await upgraded<TabListElement>(canvasElement, 'ax-tab-list');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');

    await step('A named navigation landmark; the value is current and the only stop', async () => {
      await expect(canvas.getByRole('navigation', {name: 'Project'})).toBe(root);
      await expect(current(root)).toEqual(['overview']);
      await expect(stops(root)).toEqual(['overview']);
    });

    await step('Tab enters on the selected tab and shows the hint; an arrow dismisses it', async () => {
      await userEvent.tab();
      await expect(focused()).toBe('overview');
      const hint = root.querySelector(':scope > [data-ax-keyboard-hint]');
      await waitFor(() => expect(isShowing(hint)).toBe(true));
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(isShowing(hint)).toBe(false));
    });

    await step('Arrows move focus only; the disabled tab is skipped', async () => {
      await expect(focused()).toBe('activity');
      await expect(current(root)).toEqual(['overview']);
      await userEvent.keyboard('{ArrowDown}');
      await expect(focused()).toBe('members');
      await userEvent.keyboard('{ArrowRight}');
      await expect(focused()).toBe('menu');
      await userEvent.keyboard('{Home}');
      await expect(focused()).toBe('overview');
      await userEvent.keyboard('{End}');
      await expect(focused()).toBe('menu');
      await userEvent.keyboard('{ArrowLeft}');
      await expect(focused()).toBe('members');
      await expect(changes).toHaveLength(0);
    });

    await step('Enter, Space and a click select', async () => {
      await userEvent.keyboard('{Enter}');
      await expect(current(root)).toEqual(['members']);
      await expect(stops(root)).toEqual(['members']);
      await userEvent.keyboard('{ArrowLeft}');
      await userEvent.keyboard(' ');
      await expect(current(root)).toEqual(['activity']);
      await userEvent.click(tab(root, 'overview'));
      await expect(current(root)).toEqual(['overview']);
      await expect(root.value).toBe('overview');
      await expect(changes.map((e) => e.detail.value)).toEqual(['members', 'activity', 'overview']);
    });

    await step('The disabled tab selects nothing; preventDefault() keeps the selection', async () => {
      tab(root, 'archive').click();
      await expect(current(root)).toEqual(['overview']);
      root.addEventListener('astryx-change', (event) => event.preventDefault(), {once: true});
      await userEvent.click(tab(root, 'members'));
      await expect(current(root)).toEqual(['overview']);
    });

    await step('Setting el.value selects without an event', async () => {
      const before = changes.length;
      root.value = 'members';
      await expect(current(root)).toEqual(['members']);
      await expect(changes.length).toBe(before);
    });
  },
}, options);

/**
 * TabMenu: a click opens it on its first row; picking an option selects it (one `astryx-change`
 * from the TabList), labels the trigger and returns focus; Escape closes; selecting a tab clears it.
 */
export const WithTabMenu = composed(TabListStory, {
  play: async ({canvas, canvasElement}) => {
    const root = await upgraded<TabListElement>(canvasElement, 'ax-tab-list');
    await upgraded(canvasElement, 'ax-menu');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    const trigger = canvas.getByRole('button', {name: 'More'});
    const layer = canvasElement.querySelector('ax-menu');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(canvas.getByRole('menuitemradio', {name: 'Settings'})).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(root.value).toBe('integrations');
    await expect(current(root)).toEqual([]);
    await expect(trigger).toHaveTextContent('Integrations');
    await expect(trigger).toHaveFocus();
    await expect(changes.map((e) => e.detail.value)).toEqual(['integrations']);
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(trigger).toHaveFocus();
    await userEvent.click(tab(root, 'overview'));
    await expect(trigger).toHaveTextContent('More');
  },
}, options);

/** `size="sm"` with a divider rail. */
export const Small = composed(TabListStory, {args: {tabs: 'settings', size: 'sm', hasDivider: true}}, options);

/** `size="lg"` with a divider rail. */
export const Large = composed(TabListStory, {args: {tabs: 'settings', size: 'lg', hasDivider: true}}, options);

/** `hasDivider`: a rail under the strip; the indicator sits on it. */
export const WithDivider = composed(TabListStory, {args: {tabs: 'settings', hasDivider: true}}, options);

/** Icons, a selected icon (Inbox), end text and icon-only tabs named by `label`. */
export const WithIcons = composed(TabListStory, {
  args: {tabs: 'icons'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('button', {name: 'Calendar'})).toBeVisible();
    await expect(canvas.getByRole('button', {name: 'Recent'})).toBeVisible();
  },
}, options);

/**
 * The tabs pattern (`role="tablist"`): `role="tab"` with `aria-selected` and `aria-controls`;
 * only ArrowLeft / ArrowRight move; the panels swap on `astryx-change`. `layout="fill"`.
 */
export const TabsPattern = composed(TabListStory, {
  args: {tabs: 'order', layout: 'fill', hasDivider: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-tab-list');
    await expect(canvas.getByRole('tablist', {name: 'Order'})).toBeVisible();
    const details = canvas.getByRole('tab', {name: 'Details'});
    await expect(details).toHaveAttribute('aria-selected', 'true');
    await expect(details).toHaveAttribute('aria-controls', 'story-panel-details');
    await expect(canvas.getByRole('tabpanel', {name: 'Details'})).toBeVisible();
    details.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(details).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    const shipping = canvas.getByRole('tab', {name: 'Shipping'});
    await expect(shipping).toHaveFocus();
    await expect(shipping).toHaveAttribute('aria-selected', 'false');
    await userEvent.keyboard('{Enter}');
    await expect(shipping).toHaveAttribute('aria-selected', 'true');
    await expect(details).toHaveAttribute('aria-selected', 'false');
    await waitFor(() => expect(canvas.getByRole('tabpanel', {name: 'Shipping'})).toBeVisible());
    await expect(canvas.queryByRole('tabpanel', {name: 'Details'})).toBeNull();
  },
}, options);

/** Link tabs: anchors (clicks are logged in Actions); the disabled one has no `href`; the TabMenu holds the value. */
export const LinkTabs = composed(TabListStory, {
  args: {tabs: 'links'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-tab-list');
    await expect(canvas.getByRole('link', {name: 'Team'})).toHaveAttribute('href', '#team');
    const audit = canvasElement.querySelector('[data-tab-value="audit"]')!;
    await expect(audit).not.toHaveAttribute('href');
    await expect(audit).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('button', {name: 'Billing'})).toHaveAttribute('aria-haspopup', 'menu');
  },
}, options);

/** A narrow strip scrolls with edge fades and scroll buttons; the selected tab is kept in view. */
export const Overflow = composed(TabListStory, {
  args: {tabs: 'workspace', width: 300},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-tab-list');
    const strip = root.querySelector<HTMLElement>('.astryx-tab-strip')!;
    await waitFor(() => expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth));
    const reports = tab(root, 'reports').getBoundingClientRect();
    const box = strip.getBoundingClientRect();
    await waitFor(() => expect(reports.left >= box.left - 1 && reports.right <= box.right + 1).toBe(true));
  },
}, options);

/** `overflow="visible"`: no overflow handling, the tabs spill out of the narrow box. */
export const OverflowVisible = composed(TabListStory, {args: {tabs: 'workspace', value: 'home', overflow: 'visible', width: 300}}, options);

/** Right-to-left: ArrowLeft moves forward, ArrowRight back. */
export const RightToLeft = composed(TabListStory, {
  args: {tabs: 'settings', dir: 'rtl'},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-tab-list');
    tab(root, 'general').focus();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(focused()).toBe('security');
    await userEvent.keyboard('{ArrowRight}');
    await expect(focused()).toBe('general');
  },
}, options);
