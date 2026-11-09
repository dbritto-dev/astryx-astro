import SideNav from 'astryx-astro/components/SideNav/SideNav.astro';
import Demo from 'astryx-astro/components/SideNav/SideNav.demo.astro';
import demoSource from 'astryx-astro/components/SideNav/SideNav.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import SideNavStory from './SideNavStory.astro';
import storySource from './SideNavStory.astro?raw';

const meta = {
  title: 'Navigation/Side Nav',
  component: SideNav,
  ...astryx('SideNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (SideNav.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['collapsible', 'resizable', 'content', 'hasOutsideToggle', 'dir'], source: storySource};
// Fixed ids: each story gets its own frame on the docs page.
const ownFrame = {docs: {story: {inline: false, height: '480px'}}};

const nav = (root: HTMLElement) => root.querySelector<HTMLElement>('#story-side-nav')!;
const width = (root: HTMLElement) => Math.round(nav(root).getBoundingClientRect().width);
const collapsed = (root: HTMLElement) => nav(root).getAttribute('data-ax-collapsed');

/**
 * A named landmark: the selected row is `aria-current="page"`, the disabled row keeps its tab stop,
 * sections are groups named by their titles. A parent row without a link toggles its group
 * (`astryx-collapse-change`); a parent with a link gets its own chevron.
 */
export const Default = composed(SideNavStory, {
  parameters: ownFrame,
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-side-nav');
    const changes = recordEvents<{isCollapsed: boolean}>(canvasElement, 'astryx-collapse-change');

    await step('Landmark, rows and sections', async () => {
      await expect(canvas.getByRole('navigation', {name: 'Side navigation'})).toBe(nav(canvasElement));
      await expect(canvas.getByRole('link', {name: 'Home'})).toHaveAttribute('aria-current', 'page');
      const audit = canvas.getByRole('button', {name: 'Audit log'});
      await expect(audit).toHaveAttribute('aria-disabled', 'true');
      await expect(audit.tabIndex).toBe(0);
      await expect(canvas.getByRole('group', {name: /^Main/})).toBeVisible();
    });

    await step('The Projects row toggles its group', async () => {
      const projects = canvas.getByRole('button', {name: 'Projects'});
      await expect(projects).toHaveAttribute('aria-expanded', 'true');
      await userEvent.click(projects);
      await expect(projects).toHaveAttribute('aria-expanded', 'false');
      await expect(document.getElementById(projects.getAttribute('aria-controls')!)).toHaveAttribute('aria-hidden', 'true');
      await expect(changes.at(-1)?.detail.isCollapsed).toBe(true);
      await userEvent.keyboard('{Enter}');
      await expect(projects).toHaveAttribute('aria-expanded', 'true');
    });

    await step('A parent with a link keeps it and gets a chevron toggle', async () => {
      await expect(canvas.getByRole('link', {name: 'Reports'})).toHaveAttribute('href', '/reports/');
      await userEvent.click(canvas.getByRole('button', {name: 'Expand Reports'}));
      await expect(canvas.getByRole('button', {name: 'Collapse Reports'})).toHaveAttribute('aria-expanded', 'true');
    });
  },
}, options);

/**
 * `collapsible`: the footer button collapses the nav to a 48px icon rail (`astryx-collapse-change`
 * from the nav). Rail rows are named by their labels and show them as tooltips; a parent opens its
 * children in a flyout dialog (Enter; Escape closes and refocuses); the toggle expands it again.
 */
export const Collapsible = composed(SideNavStory, {
  args: {collapsible: true},
  parameters: ownFrame,
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-side-nav');
    const changes = recordEvents<{isCollapsed: boolean}>(canvasElement, 'astryx-collapse-change');

    await step('The footer button collapses it to the rail', async () => {
      await expect(width(canvasElement)).toBe(260);
      await userEvent.click(canvas.getByRole('button', {name: 'Collapse sidebar'}));
      await waitFor(() => expect(collapsed(canvasElement)).toBe('true'));
      await expect(width(canvasElement)).toBe(48);
      // The nav dispatches it (a group row dispatches its own from the row).
      await expect(changes.filter((e) => e.target === nav(canvasElement)).map((e) => e.detail.isCollapsed)).toEqual([true]);
      await expect(canvas.getByRole('button', {name: 'Expand sidebar'})).toBeVisible();
    });

    await step('Rail rows are named by their labels and show them as tooltips', async () => {
      const inbox = canvas.getByRole('link', {name: 'Inbox'});
      await userEvent.hover(inbox);
      await waitFor(() => expect(isShowing(document.getElementById(inbox.getAttribute('data-ax-tooltip')!))).toBe(true));
      await userEvent.unhover(inbox);
    });

    await step('A parent opens its children in a flyout dialog', async () => {
      const projects = canvasElement.querySelector<HTMLElement>('.ax-side-nav-rail-control[aria-label="Projects"]')!;
      const flyout = document.getElementById(projects.getAttribute('aria-controls')!)!;
      projects.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(flyout)).toBe(true));
      await waitFor(() => expect(canvas.getByRole('dialog', {name: 'Projects submenu'})).toBeVisible());
      await waitFor(() => expect(flyout.contains(document.activeElement)).toBe(true));
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(flyout)).toBe(false));
      await expect(projects).toHaveFocus();
    });

    await step('The toggle expands it again', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Expand sidebar'}));
      await waitFor(() => expect(collapsed(canvasElement)).toBe('false'));
      await expect(width(canvasElement)).toBe(260);
    });
  },
}, options);

/** `collapsible={{defaultIsCollapsed: true}}`: rendered as the rail on the server; a parent row is a flyout button. */
export const CollapsedRail = composed(SideNavStory, {
  args: {collapsible: {defaultIsCollapsed: true}},
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    await expect(collapsed(canvasElement)).toBe('true');
    await expect(width(canvasElement)).toBe(48);
    await expect(canvas.getByRole('link', {name: 'Home'})).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('button', {name: 'Reports'})).toHaveAttribute('aria-haspopup', 'dialog');
  },
}, options);

/** `resizable`: a separator at the inline end; ←/→ resize in 10px steps, Home goes to the minimum. */
export const Resizable = composed(SideNavStory, {
  args: {collapsible: true, resizable: {defaultWidth: 260, minWidth: 200, maxWidth: 360}},
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-side-nav');
    const handle = canvas.getByRole('separator');
    await expect(handle).toHaveAttribute('aria-controls', 'story-side-nav');
    await expect(handle).toHaveAttribute('aria-valuenow', '260');
    handle.focus();
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(width(canvasElement)).toBe(280));
    await userEvent.keyboard('{Home}');
    await waitFor(() => expect(width(canvasElement)).toBe(200));
  },
}, options);

/** A SideNavCollapseButton outside the nav (`controls`) collapses and expands it. */
export const OutsideToggle = composed(SideNavStory, {
  args: {collapsible: {hasButton: false}, hasOutsideToggle: true, content: 'sizes'},
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-side-nav');
    await userEvent.click(canvas.getByRole('button', {name: 'Collapse sidebar'}));
    await waitFor(() => expect(collapsed(canvasElement)).toBe('true'));
    await userEvent.click(canvas.getByRole('button', {name: 'Expand sidebar'}));
    await waitFor(() => expect(collapsed(canvasElement)).toBe('false'));
  },
}, options);

/** Row sizes sm / md / lg, a section with a hidden header, and children that are always shown. */
export const Sizes = composed(SideNavStory, {
  args: {content: 'sizes'},
  parameters: ownFrame,
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Small row'})).toHaveAttribute('data-size', 'sm');
    await expect(canvas.getByRole('link', {name: 'Large row'})).toHaveAttribute('data-size', 'lg');
    await expect(canvas.getByRole('button', {name: 'Workspace'})).not.toHaveAttribute('aria-expanded');
    await expect(canvas.getByRole('link', {name: 'General'})).toBeVisible();
  },
}, options);

/** Right-to-left: icons sit at the inline start (right); the collapse chevron mirrors. */
export const RightToLeft = composed(SideNavStory, {
  args: {collapsible: true, dir: 'rtl'},
  parameters: ownFrame,
  play: async ({canvas}) => {
    const home = canvas.getByRole('link', {name: 'Home'});
    const icon = home.querySelector('svg')!.getBoundingClientRect();
    const label = home.querySelector('.ax-side-nav-item-label')!.getBoundingClientRect();
    await expect(icon.left).toBeGreaterThan(label.left);
  },
}, options);
