import Banner from 'astryx-astro/components/Banner/Banner.astro';
import Demo from 'astryx-astro/components/Banner/Banner.demo.astro';
import demoSource from 'astryx-astro/components/Banner/Banner.demo.astro?raw';
import Button from 'astryx-astro/components/Button/Button.astro';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import BannerMatrix from './BannerMatrix.astro';
import matrixSource from './BannerMatrix.astro?raw';
import BannerStory from './BannerStory.astro';
import bannerSource from './BannerStory.astro?raw';

const meta = {
  title: 'Feedback & Status/Banner',
  component: Banner,
  ...astryx('Banner'),
  args: {status: 'info', title: 'New update available', description: 'Version 2.4 adds offline mode and faster sync.'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Banner.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['status', 'title', 'description', 'isDismissable', 'collapsible', 'role', 'hasDetails', 'hasActions'],
  source: bannerSource,
};

interface BannerElement extends HTMLElement {
  isOpen: boolean;
  isDismissed: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  dismiss(): void;
}

/** Every status in both containers, then every elevation. */
export const Matrix = composed(BannerMatrix, {}, {source: matrixSource});

/** Not a live region by default: pass `role="status"` or `role="alert"` yourself. */
export const Default: Story = {
  play: async ({canvas, canvasElement}) => {
    await expect(canvasElement.querySelector('ax-banner')).not.toHaveAttribute('role');
    await expect(canvas.getByText('New update available')).toBeVisible();
  },
};

export const Success: Story = {args: {status: 'success', title: 'Changes saved', description: 'Your profile is up to date.'}};

export const Warning: Story = {args: {status: 'warning', title: 'Scheduled maintenance', description: 'The service is read-only on Sunday from 02:00 to 04:00 UTC.'}};

/** An urgent error with `role="alert"`, which the banner keeps. */
export const ErrorStatus: Story = {
  args: {status: 'error', title: 'Payment failed', description: 'Your card was declined.', role: 'alert'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('Payment failed');
  },
};

/** `container="section"`: full width, no radius. */
export const Section: Story = {args: {container: 'section'}};

export const Elevated: Story = {args: {status: 'success', title: 'Changes saved', elevation: 'med'}};

/** `icon` replaces the status icon. */
export const CustomIcon: Story = {args: {icon: 'calendar', title: 'Event moved', description: 'The review is now on Thursday.'}};

/** An Icon in the `icon` slot (a configured component). */
export const IconSlot: Story = {
  args: {status: 'warning', title: 'Under maintenance', description: '', slots: {icon: {component: Icon, props: {icon: 'wrench', size: 'md'}}}},
};

/** A Button in the `endContent` slot (a configured component). */
export const WithAction: Story = {
  args: {status: 'error', title: 'Payment failed', description: 'Your card was declined.', slots: {endContent: {component: Button, props: {label: 'Retry', size: 'sm', variant: 'ghost'}}}},
};

/** Two Buttons in the `endContent` slot beside a long single-line title. */
export const WithActions = composed(
  BannerStory,
  {args: {status: 'info', title: 'A long single-line title with actions beside it', description: '', role: 'status', hasDetails: false, hasActions: true}},
  options,
);

/** The dismiss button hides the banner, dispatches `astryx-dismiss` and returns focus to where it was before. */
export const Dismissable = composed(
  BannerStory,
  {
    args: {status: 'error', title: 'Payment failed', description: 'Your card was declined.', isDismissable: true, hasDetails: false, role: 'alert'},
    play: async ({canvas, canvasElement, step}) => {
      const banner = await upgraded<BannerElement>(canvasElement, 'ax-banner');
      const dismissals = recordEvents(canvasElement, 'astryx-dismiss');
      const field = canvas.getByRole('textbox', {name: 'Name on card'});
      const dismiss = canvas.getByRole('button', {name: 'Dismiss Payment failed'});
      await step('Tab from the field reaches the dismiss button', async () => {
        field.focus();
        await userEvent.tab();
        await expect(dismiss).toHaveFocus();
      });
      await step('Enter dismisses: hidden, event, focus back on the field', async () => {
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(banner).not.toBeVisible());
        await expect(banner.isDismissed).toBe(true);
        await expect(dismissals).toHaveLength(1);
        await expect(field).toHaveFocus();
      });
    },
  },
  options,
);

/** Details in the default slot start collapsed behind an Expand toggle; click and Enter toggle them. */
export const Expandable = composed(
  BannerStory,
  {
    args: {status: 'warning', title: '3 fields need attention', description: 'Expand for the list.'},
    play: async ({canvas, canvasElement, step}) => {
      const banner = await upgraded<BannerElement>(canvasElement, 'ax-banner');
      // The toggle's tooltip reports its own astryx-open-change: keep the banner's.
      const events = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
      const changes = () => events.filter((event) => event.target === banner).map((event) => event.detail.isOpen);
      const toggle = canvasElement.querySelector<HTMLElement>('[data-ax-banner-toggle]')!;
      const details = canvas.getByText('Email address is invalid');
      await expect(toggle).toHaveAccessibleName('Expand');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).not.toHaveAttribute('aria-controls');
      await expect(details).not.toBeVisible();

      await step('A click expands the details', async () => {
        await userEvent.click(toggle);
        await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
        await expect(details).toBeVisible();
        await expect(toggle).toHaveAccessibleName('Collapse');
        await expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toContainElement(details);
      });

      await step('Enter collapses them again', async () => {
        toggle.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
        await expect(details).not.toBeVisible();
      });
      await expect(changes()).toEqual([true, false]);

      await step('The element API opens and closes without an event', async () => {
        banner.open();
        await waitFor(() => expect(details).toBeVisible());
        await expect(banner.isOpen).toBe(true);
        banner.close();
        await waitFor(() => expect(details).not.toBeVisible());
        await expect(changes()).toHaveLength(2);
      });
    },
  },
  options,
);

/** `collapsible={{defaultIsOpen: true}}`: the details start open. */
export const DefaultOpen = composed(
  BannerStory,
  {
    args: {status: 'info', title: 'Starts open', description: '', collapsible: {defaultIsOpen: true}},
    play: async ({canvas, canvasElement}) => {
      const toggle = canvasElement.querySelector('[data-ax-banner-toggle]')!;
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(canvas.getByText('Email address is invalid')).toBeVisible();
    },
  },
  options,
);

/** `collapsible={false}`: the details always show, with no toggle. */
export const AlwaysOpen = composed(
  BannerStory,
  {
    args: {status: 'success', title: 'Always visible details', description: '', collapsible: false},
    play: async ({canvas, canvasElement}) => {
      await expect(canvasElement.querySelector('[data-ax-banner-toggle]')).toBeNull();
      await expect(canvas.getByText('Email address is invalid')).toBeVisible();
    },
  },
  options,
);

/** `collapsible={{isOpen: false}}` is controlled: the toggle only reports `astryx-open-change`; setting `isOpen` opens it. */
export const Controlled = composed(
  BannerStory,
  {
    args: {status: 'warning', title: '3 fields need attention', description: 'Expand for the list.', collapsible: {isOpen: false}},
    play: async ({canvas, canvasElement}) => {
      const banner = await upgraded<BannerElement>(canvasElement, 'ax-banner');
      const events = recordEvents<{isOpen: boolean}>(canvasElement, 'astryx-open-change');
      const toggle = canvasElement.querySelector<HTMLElement>('[data-ax-banner-toggle]')!;
      const details = canvas.getByText('Email address is invalid');
      await userEvent.click(toggle);
      await waitFor(() => expect(events.filter((event) => event.target === banner).map((event) => event.detail.isOpen)).toEqual([true]));
      await expect(details).not.toBeVisible();
      banner.isOpen = true;
      await waitFor(() => expect(details).toBeVisible());
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    },
  },
  options,
);
