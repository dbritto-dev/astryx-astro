import Stack from 'astryx-astro/components/Stack/Stack.astro';
import Demo from 'astryx-astro/components/Stack/Stack.demo.astro';
import demoSource from 'astryx-astro/components/Stack/Stack.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import StackItems from './StackItems.astro';
import itemsSource from './StackItems.astro?raw';
import StackMatrix from './StackMatrix.astro';
import matrixSource from './StackMatrix.astro?raw';
import StackStory from './StackStory.astro';
import stackSource from './StackStory.astro?raw';

const meta = {
  title: 'Layout/Stack',
  component: Stack,
  ...astryx('Stack'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Stack.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['direction', 'gap', 'wrap', 'hAlign', 'vAlign', 'justify', 'align', 'padding', 'width', 'height', 'maxWidth', 'as', 'preset', 'items'],
  source: stackSource,
};

/** Placeholder boxes inside the story's Stack, in DOM order. */
const boxes = (root: HTMLElement) => [...root.querySelectorAll('.astryx-stack > div')].map((el) => el.getBoundingClientRect());

/** `direction="vertical"` (default): children stack top to bottom and stretch across. */
export const Vertical = composed(StackStory, {
  args: {gap: 2, padding: 2},
  play: async ({canvasElement}) => {
    const [a, b] = boxes(canvasElement);
    await expect(b.top).toBeGreaterThan(a.bottom);
    await expect(a.width).toBe(b.width);
  },
}, options);

/** `direction="horizontal"`: children sit in a row. */
export const Horizontal = composed(StackStory, {
  args: {direction: 'horizontal', gap: 2, padding: 2},
  play: async ({canvasElement}) => {
    const [a, b] = boxes(canvasElement);
    await expect(b.left).toBeGreaterThan(a.right);
    await expect(a.top).toBe(b.top);
  },
}, options);

/** `hAlign` / `vAlign` name the physical axes whatever the direction: here a row centred both ways. */
export const HAlignVAlign = composed(StackStory, {args: {direction: 'horizontal', gap: 2, hAlign: 'center', vAlign: 'center', height: 120}}, options);

/** `padding` insets the children (a spacing step, per edge or for all). */
export const Padding = composed(StackStory, {args: {direction: 'horizontal', gap: 2, padding: 6}}, options);

/** `wrap="wrap"`: a row that runs out of width continues on the next line. */
export const Wrap = composed(StackStory, {
  args: {direction: 'horizontal', gap: 2, wrap: 'wrap', maxWidth: 320, padding: 2, items: 8},
  play: async ({canvasElement}) => {
    const rects = boxes(canvasElement);
    await expect(rects.at(-1)!.top).toBeGreaterThan(rects[0].bottom);
  },
}, options);

/** `wrap="wrap-reverse"`: wrapped lines stack upwards. */
export const WrapReverse = composed(StackStory, {
  args: {direction: 'horizontal', gap: 2, wrap: 'wrap-reverse', maxWidth: 320, padding: 2, items: 8},
  play: async ({canvasElement}) => {
    const rects = boxes(canvasElement);
    await expect(rects.at(-1)!.bottom).toBeLessThan(rects[0].top);
  },
}, options);

/** `wrap="nowrap"`: the row overflows its width instead of wrapping. */
export const NoWrap = composed(StackStory, {args: {direction: 'horizontal', gap: 2, wrap: 'nowrap', maxWidth: 320, padding: 2, items: 6}}, options);

/** HStack: the horizontal preset (`justify` = horizontal, `align` = vertical). */
export const HStackPreset = composed(StackStory, {args: {preset: 'hstack', gap: 2, justify: 'between', align: 'center', padding: 3}}, options);

/** VStack: the vertical preset (`justify` = vertical, `align` = horizontal). */
export const VStackPreset = composed(StackStory, {args: {preset: 'vstack', gap: 1, align: 'start', padding: 3}}, options);

/** `as` renders another element, here a `<section>`. */
export const AsSection = composed(StackStory, {
  args: {as: 'section', gap: 2, padding: 2},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-stack')!.localName).toBe('section');
  },
}, options);

/** Main-axis alignment, every value of `justify` (start, center, end, between, around, evenly). */
export const JustifyMatrix = composed(StackMatrix, {
  args: {matrix: 'justify'},
  play: async ({canvas}) => {
    // `between` puts the first and last child against the edges.
    const row = canvas.getByTestId('justify-between');
    const outer = row.getBoundingClientRect();
    const kids = [...row.children].map((el) => el.getBoundingClientRect());
    await expect(kids[0].left - outer.left).toBeLessThanOrEqual(1);
    await expect(outer.right - kids.at(-1)!.right).toBeLessThanOrEqual(1);
  },
}, {controls: ['matrix'], source: matrixSource});

/** Cross-axis alignment, every value of `align` (start, center, end, stretch). */
export const AlignMatrix = composed(StackMatrix, {
  args: {matrix: 'align'},
  play: async ({canvas}) => {
    const outer = canvas.getByTestId('align-stretch').getBoundingClientRect();
    const first = canvas.getByTestId('align-stretch').firstElementChild!.getBoundingClientRect();
    await expect(first.height).toBeCloseTo(outer.height - 2, 0);
  },
}, {controls: ['matrix'], source: matrixSource});

/** The gap scale: every spacing step from 0 to 10. */
export const GapScale = composed(StackMatrix, {
  args: {matrix: 'gap'},
  play: async ({canvas}) => {
    const gap = (step: string) => {
      const [a, b] = [...canvas.getByTestId(`gap-${step}`).children].map((el) => el.getBoundingClientRect());
      return b.left - a.right;
    };
    await expect(gap('0')).toBe(0);
    await expect(gap('4')).toBeGreaterThan(gap('2'));
    await expect(gap('10')).toBeGreaterThan(gap('8'));
  },
}, {controls: ['matrix'], source: matrixSource});

/** StackItem `size="fill"` takes the free space; `static` items keep their intrinsic width. */
export const StackItemFill = composed(StackItems, {
  args: {show: 'size'},
  play: async ({canvas}) => {
    await expect(canvas.getByTestId('fill').getBoundingClientRect().width).toBeGreaterThan(canvas.getByTestId('static').getBoundingClientRect().width * 2);
  },
}, {controls: ['show'], source: itemsSource});

/** StackItem `crossAlignSelf`: start, center, end and stretch in one row. */
export const StackItemCrossAlignSelf = composed(StackItems, {args: {show: 'crossAlignSelf'}}, {controls: ['show'], source: itemsSource});

/**
 * StackItem `isScrollable`: while it overflows it becomes a labelled group ("Content") so screen
 * reader users know it scrolls; an item that fits stays a plain box.
 */
export const StackItemScrollable = composed(StackItems, {
  args: {show: 'scrollable'},
  play: async ({canvas}) => {
    await waitFor(() => expect(canvas.getByTestId('scroller')).toHaveAttribute('role', 'group'));
    await expect(canvas.getByTestId('scroller')).toHaveAccessibleName('Content');
    await expect(canvas.getByTestId('fits')).not.toHaveAttribute('role');
  },
}, {controls: ['show'], source: itemsSource});
