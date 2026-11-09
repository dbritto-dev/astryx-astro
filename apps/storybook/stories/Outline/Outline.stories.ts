import Outline from 'astryx-astro/components/Outline/Outline.astro';
import Demo from 'astryx-astro/components/Outline/Outline.demo.astro';
import demoSource from 'astryx-astro/components/Outline/Outline.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import OutlineStory from './OutlineStory.astro';
import storySource from './OutlineStory.astro?raw';

const meta = {
  title: 'Navigation/Outline',
  component: Outline,
  ...astryx('Outline'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Outline.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['density', 'activeId', 'hasScrollOnClick', 'label'], source: storySource};
// The headings have fixed ids: each wrapper story gets its own frame on the docs page.
const ownFrame = {docs: {story: {inline: false, height: '360px'}}};

type OutlineNav = HTMLElement & {activeId: string};
const current = (root: Element) => [...root.querySelectorAll('nav a[aria-current="location"]')].map((a) => a.getAttribute('data-ax-outline-id'));
const doc = (root: Element) => root.querySelector<HTMLElement>('#guide-doc')!;

/**
 * Scroll-spy over a scroll container: the first item is current at the top and the last at the
 * bottom (`aria-current="location"`, `astryx-active-id-change`). A click scrolls to the heading,
 * moves focus to it and lands as current (`astryx-navigate-start` / `-end` once each); Space on a
 * focused link does the same.
 */
export const Default = composed(OutlineStory, {
  parameters: ownFrame,
  play: async ({canvas, canvasElement, step}) => {
    const nav = canvas.getByRole('navigation', {name: 'Table of contents'});
    const changes = recordEvents<{id: string}>(canvasElement, 'astryx-active-id-change');
    const starts = recordEvents<{id: string}>(canvasElement, 'astryx-navigate-start');
    const ends = recordEvents<{id: string}>(canvasElement, 'astryx-navigate-end');

    await step('Scroll-spy follows the scroll container', async () => {
      await expect(current(nav)).toEqual(['guide-intro']);
      doc(canvasElement).scrollTop = 100000;
      await waitFor(() => expect(current(nav)).toEqual(['guide-faq']));
      await expect(changes.at(-1)?.detail.id).toBe('guide-faq');
      doc(canvasElement).scrollTop = 0;
      await waitFor(() => expect(current(nav)).toEqual(['guide-intro']));
    });

    await step('A click navigates: the heading gets focus and becomes current', async () => {
      await userEvent.click(canvas.getByRole('link', {name: 'Usage'}));
      await waitFor(() => expect(ends.map((e) => e.detail.id)).toEqual(['guide-usage']), {timeout: 3000});
      await expect(starts.map((e) => e.detail.id)).toEqual(['guide-usage']);
      await expect(current(nav)).toEqual(['guide-usage']);
      await expect(document.activeElement?.id).toBe('guide-usage');
    });

    await step('Space on a focused link navigates too', async () => {
      canvas.getByRole('link', {name: 'Installation'}).focus();
      await userEvent.keyboard(' ');
      await waitFor(() => expect(ends.map((e) => e.detail.id)).toEqual(['guide-usage', 'guide-install']), {timeout: 3000});
      await expect(current(nav)).toEqual(['guide-install']);
    });
  },
}, options);

/** `density="compact"`: tighter item padding. */
export const Compact = composed(OutlineStory, {args: {density: 'compact'}, parameters: ownFrame}, options);

/**
 * Controlled (`activeId`): no scroll-spy; a click reports `astryx-active-id-change` but the
 * current item stays until `nav.activeId` is set.
 */
export const Controlled = composed(OutlineStory, {
  args: {activeId: 'guide-config', label: 'Controlled outline'},
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    const nav = canvas.getByRole('navigation', {name: 'Controlled outline'}) as OutlineNav;
    const changes = recordEvents<{id: string}>(canvasElement, 'astryx-active-id-change');
    await expect(current(nav)).toEqual(['guide-config']);
    await userEvent.click(canvas.getByRole('link', {name: 'Usage'}));
    await waitFor(() => expect(changes.map((e) => e.detail.id)).toContain('guide-usage'));
    await expect(current(nav)).toEqual(['guide-config']);
    nav.activeId = 'guide-usage';
    await waitFor(() => expect(current(nav)).toEqual(['guide-usage']));
  },
}, options);

/** `hasScrollOnClick={false}`: activating an item does not scroll the document. */
export const NoScrollOnClick = composed(OutlineStory, {
  args: {hasScrollOnClick: false},
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    await userEvent.click(canvas.getByRole('link', {name: 'FAQ'}));
    await new Promise((resolve) => setTimeout(resolve, 400));
    await expect(doc(canvasElement).scrollTop).toBe(0);
  },
}, options);

/** Items built from Markdown headings (`markdown`), compact. */
export const FromMarkdown: Story = {
  args: {
    markdown: '# Guide\n\n## Getting started\n\nText.\n\n### Requirements\n\n## Deploying\n\n### Static hosts\n\n### Servers\n',
    density: 'compact',
    label: 'Guide contents',
  },
  play: async ({canvas}) => {
    const links = canvas.getAllByRole('link');
    await expect(links.map((a) => a.textContent?.trim())).toEqual(['Guide', 'Getting started', 'Requirements', 'Deploying', 'Static hosts', 'Servers']);
  },
};
