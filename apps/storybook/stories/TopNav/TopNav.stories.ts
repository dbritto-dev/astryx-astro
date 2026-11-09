import TopNav from 'astryx-astro/components/TopNav/TopNav.astro';
import Demo from 'astryx-astro/components/TopNav/TopNav.demo.astro';
import demoSource from 'astryx-astro/components/TopNav/TopNav.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta} from '../_lib/story';
import TopNavStory from './TopNavStory.astro';
import storySource from './TopNavStory.astro?raw';

const meta = {
  title: 'Navigation/Top Nav',
  component: TopNav,
  ...astryx('TopNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (TopNav.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * Keeps link clicks in the story while a play runs. The preview logs link navigations instead
 * of following them, but only inside `#storybook-root` / `.docs-story`; the container that
 * `pnpm -F storybook test` renders into is neither, so a clicked link would leave the test page.
 * Same phase as the preview's guard (bubble, on window): components see the click first.
 */
function holdNavigation(): () => void {
  const guard = (event: MouseEvent) => {
    if (!event.defaultPrevented && (event.target as Element | null)?.closest?.('a[href]')) event.preventDefault();
  };
  window.addEventListener('click', guard);
  return () => window.removeEventListener('click', guard);
}

const options = {controls: ['label', 'content', 'dir'], source: storySource};

/** The layer a menu trigger controls. */
const layerOf = (trigger: HTMLElement) => document.getElementById(trigger.getAttribute('aria-controls')!)!;
const focusedText = () => document.activeElement?.textContent?.trim() ?? '';

/**
 * The bar: a named landmark; the selected item is `aria-current="page"`, the disabled one has no
 * `href` and no tab stop, the icon-only one is named by its label. The Solutions menu opens from
 * the keyboard on its first row; ↑ / ↓ wrap, End, typeahead; Escape closes and refocuses the
 * trigger; Space opens it too.
 */
export const Default = composed(TopNavStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-nav-menu');
    await step('Landmark and items', async () => {
      await expect(canvas.getByRole('navigation', {name: 'Main navigation'})).toBeVisible();
      await expect(canvas.getByRole('link', {name: 'Overview'})).toHaveAttribute('aria-current', 'page');
      const billing = canvas.getByText('Billing').closest('a')!;
      await expect(billing).not.toHaveAttribute('href');
      await expect(billing).toHaveAttribute('aria-disabled', 'true');
      await expect(billing).toHaveAttribute('tabindex', '-1');
      const bell = canvas.getByRole('link', {name: 'Notifications'});
      await expect(bell.textContent?.trim()).toBe('');
    });

    const trigger = canvas.getByRole('button', {name: 'Solutions'});
    const layer = layerOf(trigger);
    await step('Enter opens the menu on its first row; arrows, End and typeahead move', async () => {
      await expect(trigger).toHaveAttribute('aria-haspopup', 'true');
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(focusedText()).toMatch(/^Analytics/));
      await waitFor(() => expect(canvas.getByRole('menu', {name: 'Solutions'})).toBeVisible());
      await userEvent.keyboard('{ArrowDown}');
      await expect(focusedText()).toMatch(/^Messaging/);
      await userEvent.keyboard('{ArrowDown}');
      await userEvent.keyboard('{ArrowDown}');
      await expect(focusedText()).toMatch(/^Analytics/);
      await userEvent.keyboard('{End}');
      await expect(focusedText()).toMatch(/^Automation/);
      await userEvent.keyboard('m');
      await expect(focusedText()).toMatch(/^Messaging/);
    });

    await step('Escape closes it and refocuses the trigger; Space opens it', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await userEvent.keyboard(' ');
      await waitFor(() => expect(focusedText()).toMatch(/^Analytics/));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });
  },
}, options);

/** Hovering a menu trigger opens it after a short delay without moving focus; leaving closes it. */
export const HoverMenu = composed(TopNavStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-nav-menu');
    const trigger = canvas.getByRole('button', {name: 'Solutions'});
    const layer = layerOf(trigger);
    // One user-event session, so moving off the trigger dispatches its mouseleave.
    const user = userEvent.setup();
    const point = (el: Element, dx = 0) => {
      const box = el.getBoundingClientRect();
      return {target: el, coords: {clientX: box.x + box.width / 2 - dx, clientY: box.y + box.height / 2}};
    };
    await user.pointer(point(trigger));
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(layer.contains(document.activeElement)).toBe(false);
    // The pointer leaves for Overview and keeps moving away from the menu, so the safe triangle
    // (which holds the menu while the pointer heads for it) lets it close.
    const overview = canvas.getByRole('link', {name: 'Overview'});
    await user.pointer(point(overview));
    await user.pointer(point(overview, 6));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/**
 * The mega menu: a keyboard open focuses the first panel link; the panel is a group named by the
 * trigger; ArrowDown moves between its links; Escape closes it.
 */
export const MegaMenu = composed(TopNavStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-nav-menu');
    const trigger = canvas.getByRole('button', {name: 'Platform'});
    const layer = layerOf(trigger);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(focusedText()).toMatch(/^Compute/));
    await waitFor(() => expect(canvas.getByRole('group', {name: 'Platform'})).toBeVisible());
    await userEvent.keyboard('{ArrowDown}');
    await expect(focusedText()).toMatch(/^Data/);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    await expect(trigger).toHaveFocus();
  },
}, options);

/** The heading with a menu: the whole heading opens it; choosing a row closes it. */
export const HeadingMenu = composed(TopNavStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-nav-menu');
    const row = () => canvas.getByRole('menuitem', {name: 'Acme Analytics'});
    const layer = canvasElement.querySelector<HTMLElement>('.astryx-nav-heading-menu')!.closest<HTMLElement>('[popover]')!;
    const trigger = canvasElement.querySelector<HTMLElement>(`#${layer.getAttribute('data-ax-trigger')}`)!;
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    const release = holdNavigation();
    try {
      await userEvent.click(row());
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    } finally {
      release();
    }
  },
}, options);

/** `centerContent` (a search field) truly centred by a three-column grid; an end menu. */
export const CenterContent = composed(TopNavStory, {args: {content: 'center', label: 'Search navigation'}}, options);

/** TopNavHeading forms: a linked logo alone, a whole-heading link, a static heading with a sub-heading, all three lines. */
export const Headings = composed(TopNavStory, {
  args: {content: 'headings'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Acme home'})).toHaveAttribute('href', '/');
    await expect(canvas.getByRole('link', {name: 'Acme'})).toHaveAttribute('href', '/');
    await expect(canvas.getByRole('link', {name: 'Acme Suite'})).toHaveAttribute('href', '/suite/');
  },
}, options);

/** In a narrow box the standalone bar keeps its content width and scrolls horizontally. */
export const Narrow = composed(TopNavStory, {
  decorators: [frame({width: 360})],
  play: async ({canvasElement}) => {
    const box = canvasElement.querySelector<HTMLElement>('nav')!.parentElement!;
    await expect(box.scrollWidth).toBeGreaterThan(box.clientWidth);
  },
}, options);

/** Right-to-left: the heading sits at the right and menus mirror. */
export const RightToLeft = composed(TopNavStory, {
  args: {dir: 'rtl', label: 'Main navigation'},
  play: async ({canvas}) => {
    const nav = canvas.getByRole('navigation', {name: 'Main navigation'}).getBoundingClientRect();
    const overview = canvas.getByRole('link', {name: 'Overview'}).getBoundingClientRect();
    await expect(overview.right).toBeGreaterThan(nav.left + nav.width / 2);
  },
}, options);
