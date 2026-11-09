import Carousel from 'astryx-astro/components/Carousel/Carousel.astro';
import Demo from 'astryx-astro/components/Carousel/Carousel.demo.astro';
import demoSource from 'astryx-astro/components/Carousel/Carousel.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import CarouselMatrix from './CarouselMatrix.astro';
import matrixSource from './CarouselMatrix.astro?raw';

const hues = ['blue', 'green', 'orange', 'purple', 'teal', 'red', 'cyan', 'pink', 'yellow', 'gray'];
const tile = (hue: string, width: number) =>
  `width:${width}px;height:96px;border-radius:var(--radius-container);display:flex;align-items:flex-end;padding:var(--spacing-2) var(--spacing-3);box-sizing:border-box;` +
  `background:linear-gradient(135deg,var(--color-background-${hue},var(--color-background-muted)),var(--color-${hue}-muted,var(--color-accent-muted)));` +
  'color:var(--color-text-primary);font-size:var(--font-size-sm);font-weight:var(--font-weight-medium)';
const tiles = (count: number, label: string, width = 160) =>
  hues.slice(0, count).map((hue, i) => `<div style="${tile(hue, width)}">${label} ${i + 1}</div>`).join('');

// The prev/next buttons live on a Layer that is open from the first render (a top-layer popover
// over the carousel), so stories with buttons render in their own frame on the docs page.
const ownFrame = {docs: {story: {inline: false, height: '200px'}}};
const width = [frame({width: 640})];

const meta = {
  title: 'Container/Carousel',
  component: Carousel,
  ...astryx('Carousel'),
  args: {'aria-label': 'Color swatches', slots: {default: tiles(10, 'Swatch')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Carousel.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type Parts = {scroller: HTMLElement; start: HTMLButtonElement; end: HTMLButtonElement; root: HTMLElement};
const parts = async (canvasElement: HTMLElement): Promise<Parts> => {
  const root = await upgraded<HTMLElement>(canvasElement, 'ax-carousel');
  return {
    root,
    scroller: root.querySelector<HTMLElement>('.astryx-carousel-scroller')!,
    start: root.querySelector<HTMLButtonElement>('.ax-carousel-nav[data-side="start"]')!,
    end: root.querySelector<HTMLButtonElement>('.ax-carousel-nav[data-side="end"]')!,
  };
};
/** The slide whose start edge is at the scroller's start edge (the "current" one). */
const firstVisible = ({scroller}: Parts) => {
  const left = scroller.getBoundingClientRect().left;
  return [...scroller.children].find((slide) => slide.getBoundingClientRect().right > left + 1)?.getAttribute('aria-label');
};

/**
 * Default: gap 1, buttons and edge fades. The buttons scroll by about one viewport and fade out
 * at their edge; when the focused button runs out, focus moves to the scroller.
 */
export const Default: Story = {
  decorators: width,
  parameters: ownFrame,
  play: async ({canvas, canvasElement, step}) => {
    const p = await parts(canvasElement);

    await step('A labelled carousel region of "Slide N of M" groups', async () => {
      await expect(canvas.getByRole('region', {name: 'Color swatches'})).toHaveAttribute('aria-roledescription', 'carousel');
      const slides = [...p.scroller.children];
      await expect(slides).toHaveLength(10);
      await expect(slides[0]).toHaveAttribute('aria-roledescription', 'slide');
      await expect(slides[0]).toHaveAccessibleName('Slide 1 of 10');
      await expect(p.start).toHaveAccessibleName('Scroll left');
      await expect(p.end).toHaveAccessibleName('Scroll right');
    });

    await step('At rest: the scroller is a tab stop, only the end overflows', async () => {
      await waitFor(() => expect(p.scroller).toHaveAttribute('tabindex', '0'));
      await expect(p.scroller).toHaveAttribute('data-ax-fade', 'end');
      await expect(p.start).toBeDisabled();
      await expect(p.end).toBeEnabled();
      await expect(firstVisible(p)).toBe('Slide 1 of 10');
    });

    await step('Scroll right moves about one viewport; both edges then overflow', async () => {
      await userEvent.click(p.end);
      await waitFor(() => expect(p.scroller.scrollLeft).toBeGreaterThan(400));
      await waitFor(() => expect(p.scroller).toHaveAttribute('data-ax-fade', 'both'));
      await expect(p.start).toBeEnabled();
      await expect(firstVisible(p)).not.toBe('Slide 1 of 10');
    });

    await step('Enter on Scroll right until the end: the button disables and focus moves to the scroller', async () => {
      p.end.focus();
      for (let i = 0; i < 4 && !p.end.disabled; i++) {
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(p.scroller.dataset.axFade === 'start' || p.scroller.scrollLeft > 0).toBe(true));
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      await waitFor(() => expect(p.end).toBeDisabled());
      await expect(p.scroller).toHaveAttribute('data-ax-fade', 'start');
      await waitFor(() => expect(p.scroller).toHaveFocus());
    });

    await step('Scroll left scrolls back', async () => {
      const before = p.scroller.scrollLeft;
      await userEvent.click(p.start);
      await waitFor(() => expect(p.scroller.scrollLeft).toBeLessThan(before));
    });
  },
};

/** The element API: `scrollTo(index)` brings a slide to the start edge; `canScrollNext/Prev()`. */
export const ScrollToSlide: Story = {
  decorators: width,
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    const p = await parts(canvasElement);
    const carousel = p.root as HTMLElement & {scrollTo(index: number): void; canScrollNext(): boolean; canScrollPrev(): boolean};
    await waitFor(() => expect(carousel.canScrollNext()).toBe(true));
    await expect(carousel.canScrollPrev()).toBe(false);
    carousel.scrollTo(3);
    await waitFor(() => expect(firstVisible(p)).toBe('Slide 4 of 10'));
    carousel.scrollTo(9);
    await waitFor(() => expect(carousel.canScrollNext()).toBe(false));
    await expect(carousel.canScrollPrev()).toBe(true);
    carousel.scrollTo(0);
    await waitFor(() => expect(p.scroller.scrollLeft).toBe(0));
  },
};

/** Shift + a vertical mouse wheel scrolls the row horizontally. */
export const ShiftWheel: Story = {
  decorators: width,
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    const p = await parts(canvasElement);
    await waitFor(() => expect(p.scroller).toHaveAttribute('tabindex', '0'));
    p.scroller.dispatchEvent(new WheelEvent('wheel', {deltaY: 200, shiftKey: true, bubbles: true, cancelable: true}));
    await waitFor(() => expect(p.scroller.scrollLeft).toBe(200));
  },
};

/** `hasSnap`, gap 3, padding 3: each card rests against the start edge. */
export const Snap: Story = {
  args: {'aria-label': 'Snapping cards', hasSnap: true, gap: 3, padding: 3, slots: {default: tiles(8, 'Card', 220)}},
  decorators: width,
  parameters: ownFrame,
};

/** `hasLoop`: both buttons stay available and wrap around at the edges. */
export const Loop: Story = {
  args: {'aria-label': 'Looping gallery', hasLoop: true, gap: 2, slots: {default: tiles(10, 'Photo', 180)}},
  decorators: width,
  parameters: ownFrame,
  play: async ({canvasElement, step}) => {
    const p = await parts(canvasElement);
    await waitFor(() => expect(p.scroller).toHaveAttribute('data-ax-fade', 'both'));
    await expect(p.start).toBeEnabled();
    await step('Scroll left at the start wraps to the end', async () => {
      await userEvent.click(p.start);
      await waitFor(() => expect(p.scroller.scrollLeft).toBeGreaterThanOrEqual(p.scroller.scrollWidth - p.scroller.clientWidth - 1));
      // The carousel learns where it is from the scroll event, dispatched in the next rendering
      // step: let it run before pressing the end button, or it scrolls on instead of wrapping.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await step('Scroll right at the end wraps to the start', async () => {
      await userEvent.click(p.end);
      await waitFor(() => expect(p.scroller.scrollLeft).toBe(0));
    });
  },
};

/** Content that fits: no buttons, no fade, and the scroller is not a tab stop. */
export const ContentFits: Story = {
  args: {'aria-label': undefined, gap: 4, slots: {default: tiles(2, 'Item', 120)}},
  decorators: width,
  parameters: ownFrame,
  play: async ({canvas, canvasElement}) => {
    const p = await parts(canvasElement);
    // Without aria-label the region takes the translated default name.
    await expect(canvas.getByRole('region', {name: 'Carousel'})).toBe(p.root);
    await expect(p.scroller).toHaveAttribute('tabindex', '-1');
    await expect(p.scroller).not.toHaveAttribute('data-ax-fade');
    await expect(p.start).toBeDisabled();
    await expect(p.end).toBeDisabled();
  },
};

/** `hasButtons={false}` and `hasEdgeFade={false}`: a plain scrolling row of filter chips. */
export const NoButtonsNoFade: Story = {
  args: {
    'aria-label': 'Filters',
    hasButtons: false,
    hasEdgeFade: false,
    gap: 0.5,
    slots: {
      default: ['All', 'Design', 'Engineering', 'Marketing', 'Sales', 'Support', 'Legal', 'Finance', 'People', 'Research']
        .map((name) => `<span style="padding:var(--spacing-1) var(--spacing-3);border:1px solid var(--color-border);border-radius:var(--radius-full);font-size:var(--font-size-sm);white-space:nowrap">${name}</span>`)
        .join(''),
    },
  },
  decorators: [frame({width: 420})],
  play: async ({canvasElement}) => {
    const p = await parts(canvasElement);
    await waitFor(() => expect(p.scroller).toHaveAttribute('tabindex', '0'));
    await expect(p.root.querySelector('.ax-carousel-nav')).toBeNull();
    await expect(p.scroller).not.toHaveAttribute('data-ax-fade');
  },
};

/** Right to left, in Hebrew (`locale="he-IL"`): the end button sits on the left and scrolls leftwards. */
export const RightToLeft: Story = {
  args: {'aria-label': 'גלריה', dir: 'rtl', lang: 'he', locale: 'he-IL', gap: 1.5, padding: 2, slots: {default: tiles(10, '', 150)}},
  decorators: width,
  parameters: ownFrame,
  play: async ({canvasElement}) => {
    const p = await parts(canvasElement);
    await expect(p.end).toHaveAccessibleName('גלול ימינה');
    await expect(p.scroller.firstElementChild).toHaveAccessibleName('שקופית 1 מתוך 10');
    await waitFor(() => expect(p.end).toBeEnabled());
    await expect(p.start).toBeDisabled();
    await expect(p.end.getBoundingClientRect().left).toBeLessThan(p.start.getBoundingClientRect().left);
    await userEvent.click(p.end);
    await waitFor(() => expect(p.scroller.scrollLeft).toBeLessThan(-100));
  },
};

/** Every `gap` step (0 to 4). */
export const GapScale = composed(CarouselMatrix, {args: {matrix: 'gap'}}, {controls: ['matrix'], source: matrixSource});

/** Every `padding` step (0 to 10): inline padding with matching scroll padding. */
export const PaddingScale = composed(CarouselMatrix, {args: {matrix: 'padding'}}, {controls: ['matrix'], source: matrixSource});
