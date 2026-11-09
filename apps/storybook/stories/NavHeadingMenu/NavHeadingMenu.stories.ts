import NavHeadingMenu from 'astryx-astro/components/NavMenu/NavHeadingMenu.astro';
import Demo from 'astryx-astro/components/NavMenu/NavHeadingMenu.demo.astro';
import demoSource from 'astryx-astro/components/NavMenu/NavHeadingMenu.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import NavHeadingMenuStory from './NavHeadingMenuStory.astro';
import storySource from './NavHeadingMenuStory.astro?raw';

const meta = {
  title: 'Navigation/Nav Heading Menu',
  component: NavHeadingMenu,
  ...astryx('NavHeadingMenu'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (NavHeadingMenu.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['size', 'minWidth', 'rows', 'inHeading'], source: storySource};

/**
 * `role="menu"` of rows that are not tab stops. ↑ / ↓ move and wrap, Home / End jump, a typed
 * letter jumps to the next row starting with it, the disabled row is skipped, and Enter on a
 * row without `href` clicks it.
 */
export const Default = composed(NavHeadingMenuStory, {
  play: async ({canvas}) => {
    const menu = canvas.getByRole('menu', {name: 'Products'});
    const row = (name: RegExp) => canvas.getByRole('menuitem', {name});
    for (const item of canvas.getAllByRole('menuitem')) await expect(item).toHaveAttribute('tabindex', '-1');
    await expect(menu).toHaveAttribute('data-size', 'md');
    row(/^Analytics/).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(row(/^Projects/)).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(row(/^People/)).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(row(/^Analytics/)).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect(row(/^People/)).toHaveFocus();
    await userEvent.keyboard('{Home}');
    await expect(row(/^Analytics/)).toHaveFocus();
    await userEvent.keyboard('{End}');
    await expect(row(/^People/)).toHaveFocus();
    await userEvent.keyboard('p');
    await expect(row(/^Projects/)).toHaveFocus();
    const onClick = fn();
    row(/^People/).addEventListener('click', onClick);
    row(/^People/).focus();
    await userEvent.keyboard('{Enter}');
    await expect(onClick).toHaveBeenCalledTimes(1);
  },
}, options);

/** `size="sm"`: 160px minimum width; the size reaches every row. */
export const Small = composed(NavHeadingMenuStory, {
  args: {size: 'sm', rows: 'pages'},
  play: async ({canvas}) => {
    for (const item of canvas.getAllByRole('menuitem')) await expect(item).toHaveAttribute('data-size', 'sm');
  },
}, options);

/** `size="lg"` with a `minWidth` override (280px). */
export const LargeWithMinWidth = composed(NavHeadingMenuStory, {args: {size: 'lg', minWidth: 280, rows: 'workspace'}}, options);

/**
 * As a TopNavHeading `menu`: a click on the heading opens it and focuses the first row; Escape
 * closes it and refocuses the heading; choosing a row closes it.
 */
export const InTopNavHeading = composed(NavHeadingMenuStory, {
  args: {inHeading: true},
  play: async ({canvas, canvasElement}) => {
    const layer = await upgraded(canvasElement, 'ax-nav-menu');
    const trigger = canvasElement.querySelector<HTMLElement>(`#${layer.getAttribute('data-ax-trigger')}`)!;
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => expect(canvas.getByRole('menuitem', {name: /^Acme Cloud/})).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('menuitem', {name: 'Acme Analytics'})).toHaveFocus();
    await userEvent.click(canvas.getByRole('menuitem', {name: 'Acme Analytics'}));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);
