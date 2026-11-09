import Grid from 'astryx-astro/components/Grid/Grid.astro';
import Demo from 'astryx-astro/components/Grid/Grid.demo.astro';
import demoSource from 'astryx-astro/components/Grid/Grid.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta} from '../_lib/story';
import GridMatrix from './GridMatrix.astro';
import matrixSource from './GridMatrix.astro?raw';
import GridSpans from './GridSpans.astro';
import spansSource from './GridSpans.astro?raw';
import GridStory from './GridStory.astro';
import gridSource from './GridStory.astro?raw';

const meta = {
  title: 'Layout/Grid',
  component: Grid,
  ...astryx('Grid'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Grid.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['columns', 'gap', 'rowGap', 'columnGap', 'align', 'justify', 'width', 'maxWidth', 'minHeight', 'items'],
  source: gridSource,
};

/** Number of placeholder boxes on the first row of the story's Grid. */
function firstRowCount(root: HTMLElement) {
  const tops = [...root.querySelectorAll('.astryx-grid > div')].map((el) => Math.round(el.getBoundingClientRect().top));
  return tops.filter((top) => top === tops[0]).length;
}

/** Without `columns`: one `1fr` column. */
export const SingleColumn = composed(GridStory, {
  args: {gap: 2, items: 3},
  play: async ({canvasElement}) => {
    await expect(firstRowCount(canvasElement)).toBe(1);
  },
}, options);

/** `columns={3}`: exactly three `1fr` tracks at every width (never reflows). */
export const ThreeColumns = composed(GridStory, {
  args: {columns: 3, gap: 3},
  play: async ({canvasElement}) => {
    await expect(firstRowCount(canvasElement)).toBe(3);
  },
}, options);

/** A fixed column count still holds in a narrow container. */
export const FixedColumnsNarrow = composed(GridStory, {
  args: {columns: 4, gap: 2, items: 8},
  decorators: [frame({width: 260})],
  play: async ({canvasElement}) => {
    await expect(firstRowCount(canvasElement)).toBe(4);
  },
}, options);

/** Responsive auto-fill, `columns={{minWidth: 140}}`: as many 140px+ tracks as fit (empty tracks stay). */
export const ResponsiveFill = composed(GridStory, {
  args: {columns: {minWidth: 140}, gap: 2, items: 3},
  decorators: [frame({width: 640})],
}, options);

/** Responsive auto-fit, `repeat: 'fit'`: the present items stretch across the row. */
export const ResponsiveFit = composed(GridStory, {
  args: {columns: {minWidth: 140, repeat: 'fit'}, gap: 2, items: 3},
  decorators: [frame({width: 640})],
  play: async ({canvasElement}) => {
    const grid = canvasElement.querySelector('.astryx-grid')!.getBoundingClientRect();
    const last = [...canvasElement.querySelectorAll('.astryx-grid > div')].at(-1)!.getBoundingClientRect();
    // The last item reaches the row's end (inside the outline's padding).
    await expect(grid.right - last.right).toBeLessThan(16);
  },
}, options);

/** Responsive with a cap, `columns={{minWidth: 100, max: 4}}`: never more than four columns. */
export const ResponsiveCapped = composed(GridStory, {
  args: {columns: {minWidth: 100, max: 4}, gap: 2, items: 7},
  play: async ({canvasElement}) => {
    await expect(firstRowCount(canvasElement)).toBe(4);
  },
}, options);

/** `rowGap` and `columnGap` override `gap` per axis. */
export const RowAndColumnGap = composed(GridStory, {args: {columns: 3, rowGap: 1, columnGap: 6}}, options);

/** `rowHeight` sets the implicit row tracks; GridSpan spans rows, columns or the full width. */
export const RowHeightAndSpans = composed(GridSpans, {
  play: async ({canvas}) => {
    const tall = canvas.getByTestId('rows-2').getBoundingClientRect();
    const wide = canvas.getByTestId('columns-2').getBoundingClientRect();
    const full = canvas.getByTestId('full').getBoundingClientRect();
    const grid = canvas.getByTestId('full').parentElement!.getBoundingClientRect();
    await expect(tall.height).toBeGreaterThan(2 * 48);
    await expect(wide.width).toBeGreaterThan(tall.width * 2);
    await expect(full.width).toBe(grid.width);
  },
}, {controls: ['rowHeight', 'gap'], source: spansSource});

/** `align` and `justify`: every value (start, center, end, stretch). */
export const AlignmentMatrix = composed(GridMatrix, {args: {matrix: 'alignment'}}, {controls: ['matrix'], source: matrixSource});

/** The gap scale: every spacing step from 0 to 10. */
export const GapScale = composed(GridMatrix, {
  args: {matrix: 'gap'},
  play: async ({canvas}) => {
    const gap = (step: string) => {
      const [a, b] = [...canvas.getByTestId(`gap-${step}`).children].map((el) => el.getBoundingClientRect());
      return b.left - a.right;
    };
    await expect(gap('0')).toBe(0);
    await expect(gap('6')).toBeGreaterThan(gap('3'));
  },
}, {controls: ['matrix'], source: matrixSource});
