import MetadataList from 'astryx-astro/components/MetadataList/MetadataList.astro';
import Demo from 'astryx-astro/components/MetadataList/MetadataList.demo.astro';
import demoSource from 'astryx-astro/components/MetadataList/MetadataList.demo.astro?raw';
import {expect, userEvent} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import MetadataListStory from './MetadataListStory.astro';
import storySource from './MetadataListStory.astro?raw';

const meta = {
  title: 'Table & List/Metadata List',
  component: MetadataList,
  ...astryx('MetadataList'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (MetadataList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['columns', 'label', 'maxNumOfItems', 'orientation', 'title', 'locale'], source: storySource};
const term = (root: HTMLElement, text: string) => [...root.querySelectorAll('dt')].find((dt) => dt.textContent?.includes(text))!;

/** `columns="single"` (default): a `<dl>` with labels beside their values. */
export const SingleColumn = composed(MetadataListStory, {
  play: async ({canvasElement}) => {
    const name = term(canvasElement, 'Name').getBoundingClientRect();
    const value = term(canvasElement, 'Name').nextElementSibling!.getBoundingClientRect();
    await expect(canvasElement.querySelector('dl')!.querySelectorAll('dt')).toHaveLength(7);
    await expect(value.left).toBeGreaterThan(name.right);
  },
}, options);

/** `label={{position: 'top'}}`: labels stacked above their values. */
export const StackedLabels = composed(MetadataListStory, {
  args: {label: {position: 'top'}},
  play: async ({canvasElement}) => {
    const name = term(canvasElement, 'Name').getBoundingClientRect();
    await expect(term(canvasElement, 'Name').nextElementSibling!.getBoundingClientRect().top).toBeGreaterThanOrEqual(name.bottom);
  },
}, options);

/** `label={{width: 120}}`: a fixed label column. */
export const LabelWidth = composed(MetadataListStory, {args: {label: {width: 120}}}, options);

/** `columns="multi"`: auto-fill columns at least 280px wide (labels on top). */
export const MultiColumn = composed(MetadataListStory, {args: {columns: 'multi'}}, options);

/** `columns={3}`: exactly three columns. */
export const ThreeColumns = composed(MetadataListStory, {
  args: {columns: 3},
  play: async ({canvasElement}) => {
    const tops = ['Name', 'Status', 'Created'].map((text) => Math.round(term(canvasElement, text).getBoundingClientRect().top));
    await expect(new Set(tops).size).toBe(1);
  },
}, options);

/** `columns={2}` with labels at the start: label and value pairs side by side in two columns. */
export const TwoColumnsLabelsAtStart = composed(MetadataListStory, {args: {columns: 2, label: {position: 'start'}}}, options);

/** `orientation="horizontal"`: stacked items flow in a wrapping row. */
export const Horizontal = composed(MetadataListStory, {args: {orientation: 'horizontal'}}, options);

/**
 * `maxNumOfItems={3}`: the rest are hidden behind a "Show more" button (aria-expanded,
 * aria-controls the list), which turns into "Show less".
 */
export const ShowMore = composed(MetadataListStory, {
  args: {maxNumOfItems: 3},
  play: async ({canvas, canvasElement, step}) => {
    const toggle = canvas.getByRole('button', {name: 'Show more'});
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', canvasElement.querySelector('dl')!.id);
    await expect(term(canvasElement, 'Region')).not.toBeVisible();
    await step('Show more reveals the hidden items', async () => {
      await userEvent.click(toggle);
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveTextContent('Show less');
      await expect(term(canvasElement, 'Region')).toBeVisible();
    });
    await step('Show less hides them again (keyboard)', async () => {
      toggle.focus();
      await userEvent.keyboard('{Enter}');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(term(canvasElement, 'Region')).not.toBeVisible();
    });
  },
}, options);

/** The toggle text is translated (`locale="de-DE"`). */
export const ShowMoreGerman = composed(MetadataListStory, {args: {maxNumOfItems: 3, locale: 'de-DE', title: 'Bereitstellung'}}, options);
