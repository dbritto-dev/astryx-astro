import AspectRatio from 'astryx-astro/components/AspectRatio/AspectRatio.astro';
import Demo from 'astryx-astro/components/AspectRatio/AspectRatio.demo.astro';
import demoSource from 'astryx-astro/components/AspectRatio/AspectRatio.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, frame, overview, type Meta, type Story} from '../_lib/story';

// The docs demo's inline landscape (400 × 300, so 4 / 3 on its own).
const landscape = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4fa"/><stop offset="1" stop-color="#e8f4fd"/></linearGradient></defs><rect width="400" height="300" fill="url(#s)"/><circle cx="300" cy="80" r="36" fill="#ffd166"/><path d="M0 230 L110 120 L200 210 L270 150 L400 260 L400 300 L0 300Z" fill="#3a7d44"/><path d="M0 260 L150 190 L260 250 L400 210 L400 300 L0 300Z" fill="#2d6a4f"/></svg>',
)}`;
const image = `<img src="${landscape}" alt="Mountains under a sun">`;
const muted = 'background:var(--color-background-muted);color:var(--color-text-secondary);border-radius:var(--radius-element)';
const icon =
  '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-8 8"/></svg>';

// AspectRatio takes its width from its container: the stories give it a 320px-wide box.
const box = [frame({width: 320})];

const meta = {
  title: 'Layout/Aspect Ratio',
  component: AspectRatio,
  ...astryx('AspectRatio'),
  args: {ratio: 16 / 9, slots: {default: image}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (AspectRatio.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** 16 / 9 with `fit="cover"`: the image fills the box and is cropped; the height follows the width. */
export const Default: Story = {
  args: {fit: 'cover'},
  decorators: box,
  play: async ({canvasElement}) => {
    const {width, height} = canvasElement.querySelector('.astryx-aspect-ratio')!.getBoundingClientRect();
    await expect(width).toBe(320);
    await expect(height).toBeCloseTo(180, 0);
  },
};

export const Square: Story = {
  args: {ratio: 1, fit: 'cover'},
  decorators: box,
  play: async ({canvasElement}) => {
    const {width, height} = canvasElement.querySelector('.astryx-aspect-ratio')!.getBoundingClientRect();
    await expect(height).toBeCloseTo(width, 0);
  },
};

/** `fit="contain"`: the whole image shows, letterboxed on the box's background. */
export const FitContain: Story = {args: {fit: 'contain', style: muted}, decorators: box};

/** `fit="center"`: the child keeps its natural size, centred in the box. */
export const FitCenter: Story = {args: {ratio: 4 / 3, fit: 'center', style: muted, slots: {default: icon}}, decorators: box};

/** Without `fit` the child is not sized and styles itself (here a gradient that fills the box). */
export const UnstyledChild: Story = {
  args: {
    ratio: 2,
    slots: {default: '<div style="width:100%;height:100%;background:linear-gradient(135deg,var(--color-accent),var(--color-accent-muted))"></div>'},
  },
  decorators: box,
};

/** `shape="ellipse"` at ratio 1 clips the child to a circle. */
export const Ellipse: Story = {args: {ratio: 1, shape: 'ellipse', fit: 'cover'}, decorators: [frame({width: 160})]};

/** `shape="ellipse"` at another ratio: an ellipse. */
export const EllipseWide: Story = {args: {ratio: 2, shape: 'ellipse', fit: 'cover'}, decorators: box};
