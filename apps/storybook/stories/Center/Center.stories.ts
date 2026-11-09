import Center from 'astryx-astro/components/Center/Center.astro';
import Demo from 'astryx-astro/components/Center/Center.demo.astro';
import demoSource from 'astryx-astro/components/Center/Center.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import CenterStory from './CenterStory.astro';
import centerSource from './CenterStory.astro?raw';

const meta = {
  title: 'Layout/Center',
  component: Center,
  ...astryx('Center'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Center.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['axis', 'width', 'height', 'maxWidth', 'minHeight', 'padding', 'paddingBlockStart', 'isInline'],
  source: centerSource,
};

/** Centre of the placeholder box relative to the dashed Center around it. */
function offsets(root: HTMLElement) {
  const outer = root.querySelector('.astryx-center')!.getBoundingClientRect();
  const inner = root.querySelector('.astryx-center > div')!.getBoundingClientRect();
  return {
    x: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
    y: inner.top + inner.height / 2 - (outer.top + outer.height / 2),
  };
}

/** `axis="both"` (default): centred on both axes. */
export const AxisBoth = composed(CenterStory, {
  args: {height: 160},
  play: async ({canvasElement}) => {
    const {x, y} = offsets(canvasElement);
    await expect(Math.abs(x)).toBeLessThan(1);
    await expect(Math.abs(y)).toBeLessThan(1);
  },
}, options);

/** `axis="horizontal"`: centred on the main (inline) axis only; the child stretches on the block axis. */
export const AxisHorizontal = composed(CenterStory, {
  args: {axis: 'horizontal', height: 160},
  play: async ({canvasElement}) => {
    await expect(Math.abs(offsets(canvasElement).x)).toBeLessThan(1);
  },
}, options);

/** `axis="vertical"`: centred on the cross (block) axis only; the child stays at the start edge. */
export const AxisVertical = composed(CenterStory, {
  args: {axis: 'vertical', height: 160},
  play: async ({canvasElement}) => {
    await expect(Math.abs(offsets(canvasElement).y)).toBeLessThan(1);
    await expect(offsets(canvasElement).x).toBeLessThan(0);
  },
}, options);

/** Sized: `maxWidth` and `minHeight` instead of a fixed height. */
export const MaxWidthMinHeight = composed(CenterStory, {args: {width: '100%', maxWidth: 420, minHeight: 120}}, options);

/** Per-edge padding: `padding={4}` with `paddingBlockStart={8}` pushes the centre down. */
export const Padding = composed(CenterStory, {args: {width: '100%', maxWidth: 420, minHeight: 140, padding: 4, paddingBlockStart: 8}}, options);

/** `isInline`: an `inline-flex` box that centres an icon inside a line of text. */
export const Inline = composed(CenterStory, {args: {isInline: true}}, options);
