import Overlay from 'astryx-astro/components/Overlay/Overlay.astro';
import Demo from 'astryx-astro/components/Overlay/Overlay.demo.astro';
import demoSource from 'astryx-astro/components/Overlay/Overlay.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import OverlayControlled from './OverlayControlled.astro';
import controlledSource from './OverlayControlled.astro?raw';
import OverlayMatrix from './OverlayMatrix.astro';
import matrixSource from './OverlayMatrix.astro?raw';

/** A gradient "photo" in inline CSS (no image request). */
const media = (hue: number, name: string) =>
  `<div role="img" aria-label="${name}" style="aspect-ratio:16/10;border-radius:var(--radius-container);background:radial-gradient(circle at 30% 30%, hsl(${hue} 80% 70%), transparent 55%),linear-gradient(135deg, hsl(${hue} 60% 35%), hsl(${(hue + 60) % 360} 70% 20%))"></div>`;
/** The same photo as a link, so keyboard focus can reach the overlay. */
const mediaLink = (hue: number, name: string) =>
  `<a href="#${name.toLowerCase().replace(/\s+/g, '-')}" class="ax-focus-visible" style="display:block;border-radius:var(--radius-container)">${media(hue, name)}</a>`;
const caption = (title: string, detail: string) =>
  `<p style="margin:0;font-weight:var(--font-weight-semibold);color:var(--color-text-primary)">${title}</p><p style="margin:0;font-size:var(--font-size-sm);color:var(--color-text-secondary)">${detail}</p>`;

/** The base content and caption most stories use. Stories set `slots` whole: slot objects merge. */
const lake = {default: media(210, 'Lake at dusk'), content: caption('Lake at dusk', 'Taken on 2 November 2026')};
/** Overlays fill their container: args stories render in a 320px box. */
const framed = [frame({width: 320})];

const meta = {
  title: 'Overlay/Overlay',
  component: Overlay,
  ...astryx('Overlay'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Overlay.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const scrimOf = (root: HTMLElement) => root.querySelector<HTMLElement>('.astryx-overlay-scrim')!;

/** `showOn="always"` (default): a dark scrim over the whole surface, content aligned to the end. */
export const Default: Story = {args: {slots: lake}, decorators: framed};

/** Every `position` × `scrim` mode: dark and light scrims invert the theme of their content. */
export const Matrix = composed(OverlayMatrix, {decorators: [frame({width: 720})]}, {source: matrixSource});

export const AlignStart: Story = {args: {align: 'start', slots: lake}, decorators: framed};

export const AlignCenter: Story = {args: {align: 'center', position: 'bottom', slots: lake}, decorators: framed};

/**
 * `showOn="hover"` with a bottom strip: hidden at rest; shown while the overlay is hovered (CSS
 * `:hover`, which synthetic test events cannot trigger) or anything inside has focus, so its
 * content is reachable by keyboard.
 */
export const ShowOnHover: Story = {
  args: {
    showOn: 'hover',
    position: 'bottom',
    slots: {
      default: mediaLink(20, 'Desert road'),
      content: `${caption('Desert road', 'Route 66, Arizona')}<a href="#desert-road-details" class="ax-focus-visible" style="font-size:var(--font-size-sm);color:var(--color-text-primary)">Details</a>`,
    },
  },
  decorators: framed,
  play: async ({canvas, canvasElement}) => {
    const scrim = scrimOf(canvasElement);
    await expect(scrim).not.toBeVisible();
    await userEvent.tab();
    await expect(canvas.getByRole('link', {name: 'Desert road'})).toHaveFocus();
    await waitFor(() => expect(scrim).toBeVisible());
    await userEvent.tab();
    await expect(canvas.getByRole('link', {name: 'Details'})).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await waitFor(() => expect(scrim).not.toBeVisible());
  },
};

/** `showOn="focus"`: shown only while something inside has focus (hover alone does nothing). */
export const ShowOnFocus: Story = {
  args: {
    showOn: 'focus',
    align: 'center',
    slots: {default: mediaLink(140, 'Forest'), content: caption('Forest', 'Focus shows this caption')},
  },
  decorators: framed,
  play: async ({canvas, canvasElement}) => {
    const scrim = scrimOf(canvasElement);
    const link = canvas.getByRole('link', {name: 'Forest'});
    await expect(scrim).not.toBeVisible();
    link.focus();
    await waitFor(() => expect(scrim).toBeVisible());
    link.blur();
    await waitFor(() => expect(scrim).not.toBeVisible());
  },
};

/** `showOn="hover-or-focus"` with a light top strip, content aligned to the start. */
export const HoverOrFocus: Story = {
  args: {
    showOn: 'hover-or-focus',
    position: 'top',
    scrim: 'light',
    align: 'start',
    slots: {default: mediaLink(280, 'Aurora'), content: caption('Aurora', 'Tromsø, Norway')},
  },
  decorators: framed,
  play: async ({canvas, canvasElement}) => {
    const scrim = scrimOf(canvasElement);
    await expect(scrim).not.toBeVisible();
    canvas.getByRole('link', {name: 'Aurora'}).focus();
    await waitFor(() => expect(scrim).toBeVisible());
  },
};

/** The `content` prop: plain text instead of the `content` slot, with no scrim (`scrim={false}`). */
export const TextContent: Story = {
  args: {content: 'Photo 3 of 12', scrim: false, align: 'start', slots: {default: media(330, 'Coral reef')}},
  decorators: framed,
};

/**
 * Controlled `isOpen={false}`: hidden and inert until the app opens it. The button toggles it
 * through the element API (`toggle()`).
 */
export const Controlled = composed(OverlayControlled, {
  play: async ({canvas, canvasElement}) => {
    const scrim = scrimOf(canvasElement);
    const toggle = canvas.getByRole('button', {name: 'Toggle caption'});
    await expect(scrim).not.toBeVisible();
    await expect(scrim.inert).toBe(true);
    await userEvent.click(toggle);
    await waitFor(() => expect(scrim).toBeVisible());
    await expect(scrim.inert).toBe(false);
    await userEvent.click(toggle);
    await waitFor(() => expect(scrim).not.toBeVisible());
    await expect(scrim.inert).toBe(true);
  },
}, {controls: ['isOpen'], source: controlledSource});
