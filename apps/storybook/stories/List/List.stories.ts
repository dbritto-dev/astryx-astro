import List from 'astryx-astro/components/List/List.astro';
import Demo from 'astryx-astro/components/List/List.demo.astro';
import demoSource from 'astryx-astro/components/List/List.demo.astro?raw';
import {expect, userEvent} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ListInteractive from './ListInteractive.astro';
import interactiveSource from './ListInteractive.astro?raw';
import ListStory from './ListStory.astro';
import storySource from './ListStory.astro?raw';

const meta = {
  title: 'Table & List/List',
  component: List,
  ...astryx('List'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (List.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['density', 'hasDividers', 'edge', 'header', 'listStyle', 'start', 'rows', 'inCard', 'hasCustomMarker'], source: storySource};
const rowPadding = (root: HTMLElement) => getComputedStyle(root.querySelector('.astryx-list-item')!).paddingTop;

/** A header labels the list (`<ul role="list">`); rows with avatars and badges in their slots. */
export const Default = composed(ListStory, {
  args: {header: 'Team'},
  play: async ({canvas, canvasElement}) => {
    const list = canvas.getByRole('list', {name: 'Team'});
    await expect(list.localName).toBe('ul');
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3);
    await expect(rowPadding(canvasElement)).toBe('8px');
  },
}, options);

/** `density="compact"`: 4px row padding. */
export const Compact = composed(ListStory, {
  args: {density: 'compact'},
  play: async ({canvasElement}) => {
    await expect(rowPadding(canvasElement)).toBe('4px');
  },
}, options);

/** `density="spacious"`: 12px row padding and a wider inline inset. */
export const Spacious = composed(ListStory, {
  args: {density: 'spacious'},
  play: async ({canvasElement}) => {
    await expect(rowPadding(canvasElement)).toBe('12px');
  },
}, options);

/** `hasDividers`: a divider between rows (square corners, no gap). */
export const Dividers = composed(ListStory, {args: {hasDividers: true}}, options);

/** `listStyle="disc"`: a dot on each row's first line. */
export const Disc = composed(ListStory, {args: {listStyle: 'disc', rows: 'steps'}}, options);

/** `listStyle="circle"`: an outlined dot. */
export const Circle = composed(ListStory, {args: {listStyle: 'circle', rows: 'steps'}}, options);

/** `listStyle="decimal"` renders an `<ol>`; `start={8}` begins the count at 8. */
export const DecimalFromEight = composed(ListStory, {
  args: {listStyle: 'decimal', start: 8, rows: 'steps', header: 'Release checklist'},
  play: async ({canvas}) => {
    const list = canvas.getByRole('list', {name: 'Release checklist'});
    await expect(list.localName).toBe('ol');
    await expect(list).toHaveAttribute('start', '8');
  },
}, options);

/** The `marker` slot (port extension) replaces one row's number with an icon, in the shared column. */
export const CustomMarker = composed(ListStory, {args: {listStyle: 'decimal', rows: 'steps', hasCustomMarker: true}}, options);

const edgeOptions = options;
/** Distance from the Card heading to the first row's text and background. */
const edgeGeometry = (canvas: {getByTestId: (id: string) => HTMLElement}) => {
  const heading = canvas.getByTestId('heading').getBoundingClientRect();
  const row = canvas.getByTestId('list').querySelector('.astryx-list-item')!;
  const label = row.querySelector('.ax-item-label')!.getBoundingClientRect();
  return {text: Math.round(label.left - heading.left), row: Math.round(row.getBoundingClientRect().left - heading.left)};
};

/** In a Card, `edge="padded"` (default): the row background at the content edge, text inset. */
export const EdgePadded = composed(ListStory, {
  args: {inCard: true, edge: 'padded'},
  play: async ({canvas}) => {
    const {text, row} = edgeGeometry(canvas);
    await expect(row).toBe(0);
    await expect(text).toBeGreaterThan(0);
  },
}, edgeOptions);

/** `edge="flush"`: no inline inset; text on the heading line. */
export const EdgeFlush = composed(ListStory, {args: {inCard: true, edge: 'flush'}}, edgeOptions);

/** `edge="outset"`: text on the heading line, the row background reaches into the Card's padding. */
export const EdgeOutset = composed(ListStory, {
  args: {inCard: true, edge: 'outset'},
  play: async ({canvas}) => {
    const {row} = edgeGeometry(canvas);
    await expect(row).toBeLessThan(0);
  },
}, edgeOptions);

/** `edge="bleed"`: rows reach both Card edges with square corners; text on the heading line. */
export const EdgeBleed = composed(ListStory, {args: {inCard: true, edge: 'bleed', hasDividers: true}}, edgeOptions);

/**
 * Interactive rows. A button row retargets surface clicks to its invisible button (one click),
 * Enter activates it, a nested Button keeps its own click; a link row follows its link; a
 * delegate row toggles its checkbox; selected rows carry aria-current, disabled ones aria-disabled.
 */
export const InteractiveRows = composed(ListInteractive, {
  play: async ({canvas, step}) => {
    const buttonRow = canvas.getByTestId('button-row');
    const action = canvas.getByRole('button', {name: /Notifications/});
    // Activations: clicks that reach the row from its invisible button.
    const activations: Event[] = [];
    buttonRow.addEventListener('click', (event) => event.target === action && activations.push(event));

    await step('A click on the row is one click on its button', async () => {
      await userEvent.click(buttonRow.querySelector('.ax-item-start')!);
      await expect(activations).toHaveLength(1);
    });
    await step('Enter on the focused row activates it', async () => {
      action.focus();
      await userEvent.keyboard('{Enter}');
      await expect(activations).toHaveLength(2);
    });
    await step('A nested Button keeps its own click', async () => {
      const mute = canvas.getByRole('button', {name: 'Mute'});
      const own: Event[] = [];
      mute.addEventListener('click', (event) => own.push(event));
      await userEvent.click(mute);
      await expect(own).toHaveLength(1);
      await expect(activations).toHaveLength(2);
    });
    await step('A link row follows its invisible link', async () => {
      const link = canvas.getByRole('link', {name: /Privacy/});
      // Stay on the page: the Vitest runner renders outside the preview's navigation guard.
      link.addEventListener('click', (event) => event.preventDefault());
      const followed: Event[] = [];
      link.addEventListener('click', (event) => followed.push(event));
      await userEvent.click(canvas.getByTestId('link-row'));
      await expect(followed).toHaveLength(1);
    });
    await step('A delegate row toggles its checkbox (described by the row description)', async () => {
      const checkbox = canvas.getByRole('checkbox', {name: 'Weekly digest'});
      await expect(checkbox).toHaveAccessibleDescription('A summary every Monday');
      await userEvent.click(canvas.getByTestId('delegate-row'));
      await expect(checkbox).toBeChecked();
    });
    await step('Selected and disabled rows', async () => {
      const rows = canvas.getAllByRole('listitem');
      await expect(rows[3]).toHaveAttribute('aria-current', 'true');
      await expect(canvas.getByRole('button', {name: /Billing/})).toBeDisabled();
    });
  },
}, {controls: ['density', 'hasDividers'], source: interactiveSource});
