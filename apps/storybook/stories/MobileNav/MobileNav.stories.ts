import MobileNav from 'astryx-astro/components/MobileNav/MobileNav.astro';
import Demo from 'astryx-astro/components/MobileNav/MobileNav.demo.astro';
import demoSource from 'astryx-astro/components/MobileNav/MobileNav.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import MobileNavStory from './MobileNavStory.astro';
import storySource from './MobileNavStory.astro?raw';

const meta = {
  title: 'Navigation/Mobile Nav',
  component: MobileNav,
  ...astryx('MobileNav'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MobileNav.demo.astro), pre-rendered as one story. */
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

const options = {controls: ['isOpen', 'header', 'width', 'side', 'content', 'dir'], source: storySource};
// Fixed ids, and a modal drawer: each story gets its own frame on the docs page.
const ownFrame = {docs: {story: {inline: false, height: '480px'}}};

const parts = (root: HTMLElement) => {
  const dialog = root.querySelector('dialog')!;
  return {dialog, panel: dialog.querySelector<HTMLElement>('.ax-mobile-nav-drawer')!, trigger: root.querySelector<HTMLElement>('#story-mobile-nav-trigger')!};
};
const opened = async (dialog: HTMLDialogElement) => waitFor(() => expect(dialog.matches(':modal')).toBe(true));
const closed = async (dialog: HTMLDialogElement) => waitFor(() => expect(dialog.open).toBe(false));

/**
 * The trigger opens the drawer as a modal named by its header (`aria-expanded`, focus on the
 * panel). A row closes it (`astryx-navigate`) and focus returns to the trigger; a group toggle
 * keeps it open; the close button, a press beside the drawer and Escape close it.
 */
export const Default = composed(MobileNavStory, {
  parameters: ownFrame,
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog, panel, trigger} = parts(canvasElement);
    const navigations = recordEvents<{href: string}>(canvasElement, 'astryx-navigate');

    await step('The trigger opens it as a modal; focus moves to the panel', async () => {
      await userEvent.click(trigger);
      await opened(dialog);
      await expect(dialog).toHaveAccessibleName('Navigation');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(panel).toHaveFocus());
    });

    await step('A group toggle keeps it open; a row closes it and focus returns', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Projects'}));
      await expect(dialog.open).toBe(true);
      const release = holdNavigation();
      try {
        await userEvent.click(canvas.getByRole('link', {name: 'Inbox'}));
        await closed(dialog);
      } finally {
        release();
      }
      await expect(navigations.map((e) => e.detail.href)).toContain('/inbox/');
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await waitFor(() => expect(trigger).toHaveFocus());
    });

    await step('The close button closes it', async () => {
      await userEvent.click(trigger);
      await opened(dialog);
      await userEvent.click(dialog.querySelector<HTMLElement>('button[data-ax-dialog-close]')!);
      await closed(dialog);
    });

    await step('Escape closes it', async () => {
      await userEvent.click(trigger);
      await opened(dialog);
      await userEvent.keyboard('{Escape}');
      await closed(dialog);
      await waitFor(() => expect(trigger).toHaveFocus());
    });
  },
}, options);

/** A breadcrumb link inside the drawer closes it too (it dispatches `astryx-navigate`). */
export const BreadcrumbCloses = composed(MobileNavStory, {
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog, trigger} = parts(canvasElement);
    await userEvent.click(trigger);
    await opened(dialog);
    const release = holdNavigation();
    try {
      await userEvent.click(canvas.getByRole('link', {name: 'Home', current: false}));
      await closed(dialog);
    } finally {
      release();
    }
  },
}, options);

/** `side="start"`, 280px, with a SideNavHeading in the `header` slot. */
export const StartSide = composed(MobileNavStory, {
  args: {side: 'start', width: 280, content: 'heading'},
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog, panel, trigger} = parts(canvasElement);
    await userEvent.click(trigger);
    await opened(dialog);
    await expect(dialog).toHaveAttribute('data-side', 'start');
    await waitFor(() => expect(Math.round(panel.getBoundingClientRect().left)).toBe(0));
    await expect(Math.round(panel.getBoundingClientRect().width)).toBe(280);
    await userEvent.keyboard('{Escape}');
    await closed(dialog);
  },
}, options);

/** `side="end"`: the drawer slides from the inline end. */
export const EndSide = composed(MobileNavStory, {
  args: {side: 'end'},
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog, panel, trigger} = parts(canvasElement);
    await userEvent.click(trigger);
    await opened(dialog);
    await waitFor(() => expect(Math.round(panel.getBoundingClientRect().right)).toBe(window.innerWidth));
    await userEvent.keyboard('{Escape}');
    await closed(dialog);
  },
}, options);

/** Right-to-left: `side="start"` slides in from the right. */
export const RightToLeft = composed(MobileNavStory, {
  args: {side: 'start', dir: 'rtl', header: 'Navigation'},
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog, panel, trigger} = parts(canvasElement);
    await userEvent.click(trigger);
    await opened(dialog);
    await waitFor(() => expect(Math.round(panel.getBoundingClientRect().right)).toBe(window.innerWidth));
    await userEvent.keyboard('{Escape}');
    await closed(dialog);
  },
}, options);

/** Rendered open (`isOpen`): the modal drawer is showing on load. */
export const Open = composed(MobileNavStory, {
  args: {isOpen: true, side: 'start'},
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-mobile-nav');
    const {dialog} = parts(canvasElement);
    await opened(dialog);
  },
}, options);
