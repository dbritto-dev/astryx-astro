import EmptyState from 'astryx-astro/components/EmptyState/EmptyState.astro';
import Demo from 'astryx-astro/components/EmptyState/EmptyState.demo.astro';
import demoSource from 'astryx-astro/components/EmptyState/EmptyState.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect, waitFor} from 'storybook/test';
import {pageLoaded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import EmptyStateStory from './EmptyStateStory.astro';
import storySource from './EmptyStateStory.astro?raw';

const meta = {
  title: 'Content/Empty State',
  component: EmptyState,
  ...astryx('EmptyState'),
  args: {title: 'No results found', description: "Try adjusting your search or filters to find what you're looking for."},
} satisfies Meta;
export default meta;

/** Every example from the docs page (EmptyState.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['isCompact', 'icon', 'headingLevel'], source: storySource};

/** A title (an h3 by default) and a description. */
export const Default: Story = {
  play: async ({canvas}) => {
    await expect(canvas.getByRole('heading', {level: 3, name: 'No results found'})).toBeVisible();
    await expect(canvas.getByText(/Try adjusting your search/)).toBeVisible();
  },
};

/** A semantic icon above the title, hidden from assistive technology. */
export const WithIcon: Story = {
  args: {icon: 'search'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-icon')!.closest('[aria-hidden="true"]')).not.toBeNull();
  },
};

/** Custom illustration markup in the `icon` slot. */
export const IllustrationSlot: Story = {
  args: {
    title: 'No projects',
    description: 'Create a project to start collaborating with your team.',
    slots: {
      icon: '<svg width="64" height="64" viewBox="0 0 64 64" fill="none"><rect x="8" y="14" width="48" height="36" rx="6" fill="var(--color-background-muted)" stroke="var(--color-border-emphasized)" stroke-width="2"/><path d="M8 24h48" stroke="var(--color-border-emphasized)" stroke-width="2"/><circle cx="32" cy="38" r="6" stroke="var(--color-text-secondary)" stroke-width="2"/></svg>',
    },
  },
};

/** An Icon in the `icon` slot (a configured component). */
export const IconSlot: Story = {
  args: {title: 'Nothing here yet', description: 'Files you upload appear here.', slots: {icon: {component: Icon, props: {icon: 'upload', size: 'lg', color: 'secondary'}}}},
};

/** `headingLevel` changes only the tag, for the page outline; the title size stays the same. */
export const HeadingLevel: Story = {
  args: {headingLevel: 2},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('heading', {level: 2, name: 'No results found'})).toBeVisible();
  },
};

/** Title only, compact. */
export const CompactTitleOnly: Story = {args: {title: 'Empty folder', description: '', isCompact: true}};

/** Buttons in the `actions` slot, in a row. */
export const WithActions = composed(
  EmptyStateStory,
  {
    args: {icon: 'search'},
    play: async ({canvas}) => {
      await expect(canvas.getByRole('button', {name: 'Compose'})).toBeVisible();
      await expect(canvas.getByRole('button', {name: 'Refresh'})).toBeVisible();
    },
  },
  options,
);

/** Compact: reduced spacing, and the actions stack. */
export const Compact = composed(
  EmptyStateStory,
  {
    args: {isCompact: true},
    play: async ({canvas}) => {
      const compose = canvas.getByRole('button', {name: 'Compose'}).getBoundingClientRect();
      const refresh = canvas.getByRole('button', {name: 'Refresh'}).getBoundingClientRect();
      await expect(refresh.top).toBeGreaterThanOrEqual(compose.bottom);
    },
  },
  options,
);

/** An empty state that appears after load (a list emptied by client code) announces its title and description once. */
export const AppearsAfterLoad = composed(
  EmptyStateStory,
  {
    args: {isInsertedLater: true},
    play: async ({canvas, canvasElement}) => {
      await pageLoaded();
      const host = canvasElement.querySelector('[data-empty-host]')!;
      host.append(host.querySelector<HTMLTemplateElement>('template[data-empty-template]')!.content.cloneNode(true));
      await expect(canvas.getByRole('heading', {name: 'List cleared'})).toBeVisible();
      await waitFor(() => expect(document.querySelector('[data-astryx-live-region="polite"]')).toHaveTextContent('List cleared'));
    },
  },
  {controls: ['isInsertedLater'], source: storySource},
);
