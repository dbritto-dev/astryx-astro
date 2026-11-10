import AppShell from 'astryx-astro/components/AppShell/AppShell.astro';
import Demo from 'astryx-astro/components/AppShell/AppShell.demo.astro';
import demoSource from 'astryx-astro/components/AppShell/AppShell.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, knownA11y} from '../_lib/story';
import AppShellStory from './AppShellStory.astro';
import shellSource from './AppShellStory.astro?raw';

const meta = {
  title: 'Layout/App Shell',
  component: AppShell,
  ...astryx('AppShell'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AppShell.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource, {parameters: knownA11y({
  "landmark-no-duplicate-banner": "The docs demo shows six app shells on one page; a page has one banner.",
  "landmark-no-duplicate-main": "The docs demo shows six app shells on one page; a page has one main.",
  "landmark-unique": "The docs demo shows six app shells on one page, each with its own (identically named) navigations."
})});

const options = {controls: ['variant', 'contentPadding', 'height', 'mobileNav', 'nav', 'hasBanner', 'rows'], source: shellSource};

const shellRoot = (root: HTMLElement) => root.querySelector<HTMLElement>('.astryx-app-shell')!;
const isShown = (el: Element | null) => el != null && el.getClientRects().length > 0;

/**
 * `variant="elevated"` (default): wash nav areas around a rounded surface content area. A skip
 * link is the first tab stop and moves focus to main; an overflowing main is a keyboard stop.
 * (Below 768px wide the shell switches to its mobile layout.)
 */
export const Elevated = composed(AppShellStory, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    const root = shellRoot(canvasElement);
    const main = canvas.getByRole('main');
    await step('Landmarks: banner, the two navigations, main', async () => {
      await expect(canvas.getByRole('banner')).toBeVisible();
      await expect(canvas.getByRole('navigation', {name: 'Main navigation'})).toBeVisible();
      await expect(canvas.getByRole('navigation', {name: 'Side navigation'})).toBeVisible();
      await expect(root).toHaveAttribute('data-variant', 'elevated');
    });
    await step('Desktop (the story is wider than 768px): the rail shows, the menu toggle does not', async () => {
      await expect(root).toHaveAttribute('data-astryx-shell-mobile', 'false');
      await expect(isShown(root.querySelector('.astryx-app-shell-sidenav'))).toBe(true);
      await expect(isShown(root.querySelector('.ax-mobile-nav-toggle'))).toBe(false);
    });
    await step('An overflowing main joins the Tab order', async () => {
      await waitFor(() => expect(main).toHaveAttribute('tabindex', '0'));
    });
    await step('The skip link is the first tab stop; activating it focuses main', async () => {
      await userEvent.tab();
      const skip = canvas.getByRole('link', {name: 'Skip to content'});
      await expect(skip).toHaveFocus();
      await expect(skip).toBeVisible();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(main).toHaveFocus());
    });
  },
}, options);

/** `variant="wash"`: nav and content share the wash background. */
export const Wash = composed(AppShellStory, {args: {variant: 'wash'}}, options);

/** `variant="surface"`: everything on the surface background. */
export const Surface = composed(AppShellStory, {args: {variant: 'surface'}}, options);

/** `variant="section"`: dividers separate the nav areas from the content. */
export const Section = composed(AppShellStory, {args: {variant: 'section'}}, options);

/** The `banner` slot: a system announcement above the top nav, inside the header landmark. */
export const WithBanner = composed(AppShellStory, {
  args: {hasBanner: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('banner')).toHaveTextContent('Scheduled maintenance on Sunday at 02:00 UTC');
  },
}, options);

/** Only a TopNav: no rail. */
export const TopNavOnly = composed(AppShellStory, {
  args: {nav: 'top'},
  play: async ({canvas}) => {
    await expect(canvas.queryByRole('navigation', {name: 'Side navigation'})).toBeNull();
  },
}, options);

/** Only a SideNav: no header on desktop. */
export const SideNavOnly = composed(AppShellStory, {args: {nav: 'side'}}, options);

/** Main that fits is not a tab stop (it has nothing to scroll). */
export const ShortContent = composed(AppShellStory, {
  args: {rows: 1},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    await expect(canvas.getByRole('main')).toHaveAttribute('tabindex', '-1');
  },
}, options);

/** `height="auto"`: the shell grows with its content, the frame scrolls, header and rail stick. */
export const AutoHeight = composed(AppShellStory, {
  args: {height: 'auto', variant: 'surface'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    // Main is not the scroller here: it never joins the Tab order.
    await expect(canvas.getByRole('main')).toHaveAttribute('tabindex', '-1');
  },
}, options);

/** The drawer's dialog, found through the toggle's aria-controls. */
const drawerOf = (toggle: HTMLElement) => document.getElementById(toggle.getAttribute('aria-controls')!) as HTMLDialogElement;

/**
 * The mobile layout: `mobileNav={{breakpoint: '2xl'}}` makes the shell mobile below 1536px, so
 * it shows on most screens. The TopNav becomes the mobile bar and its menu button opens the
 * drawer (a modal): TopNav items, a divider, then the SideNav items. A drawer row reports
 * `astryx-navigate` and closes it; Escape closes it; focus returns to the toggle.
 */
export const MobileDrawer = composed(AppShellStory, {
  args: {mobileNav: {breakpoint: '2xl'}},
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    const root = shellRoot(canvasElement);
    const toggle = root.querySelector<HTMLElement>('.ax-mobile-nav-toggle')!;
    const drawer = drawerOf(toggle);
    const navigations = recordEvents<{href: string}>(canvasElement, 'astryx-navigate');

    await step('Mobile: the rail leaves, the bar becomes the mobile bar with a menu button', async () => {
      await expect(root).toHaveAttribute('data-astryx-shell-mobile', 'true');
      await expect(isShown(root.querySelector('.astryx-app-shell-sidenav'))).toBe(false);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });

    await step('The toggle opens the drawer as a modal with focus inside', async () => {
      await userEvent.click(toggle);
      await waitFor(() => expect(drawer.open).toBe(true));
      await expect(drawer.matches(':modal')).toBe(true);
      await expect(drawer).toHaveAccessibleName('Navigation');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));
      const current = [...drawer.querySelectorAll('[aria-current="page"]')].map((el) => el.textContent?.trim());
      await expect(current).toEqual(expect.arrayContaining(['Overview', 'Home']));
    });

    await step('A drawer row reports astryx-navigate and closes the drawer; focus returns to the toggle', async () => {
      const inbox = [...drawer.querySelectorAll<HTMLElement>('.astryx-side-nav-item')].find((el) => el.textContent?.trim() === 'Inbox')!;
      await userEvent.click(inbox);
      await waitFor(() => expect(drawer.open).toBe(false));
      await expect(navigations.map((event) => event.detail.href)).toContain('#inbox');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await waitFor(() => expect(toggle).toHaveFocus());
    });

    await step('Enter reopens it; Escape closes it and focus returns', async () => {
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(drawer.open).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(drawer.open).toBe(false));
      await waitFor(() => expect(toggle).toHaveFocus());
    });
  },
}, options);

/** Mobile with only a SideNav: a phone bar with the menu button opens the SideNav as a drawer. */
export const MobileSideNavOnly = composed(AppShellStory, {
  args: {mobileNav: {breakpoint: '2xl'}, nav: 'side'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    await expect(canvas.getByRole('navigation', {name: 'Mobile navigation'})).toBeVisible();
    const toggle = shellRoot(canvasElement).querySelector<HTMLElement>('.ax-mobile-nav-toggle')!;
    const drawer = drawerOf(toggle);
    await userEvent.click(toggle);
    await waitFor(() => expect(drawer.open).toBe(true));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(drawer.open).toBe(false));
  },
}, options);

/** `mobileNav={false}`: no mobile layout at any width (the rail and bar stay). */
export const MobileNavDisabled = composed(AppShellStory, {
  args: {mobileNav: false},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-app-shell');
    await expect(canvasElement.querySelector('.ax-mobile-nav-toggle')).toBeNull();
  },
}, options);
