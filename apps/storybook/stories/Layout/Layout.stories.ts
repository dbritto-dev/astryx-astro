import Layout from 'astryx-astro/components/Layout/Layout.astro';
import Demo from 'astryx-astro/components/Layout/Layout.demo.astro';
import demoSource from 'astryx-astro/components/Layout/Layout.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import LayoutStory from './LayoutStory.astro';
import layoutSource from './LayoutStory.astro?raw';

const meta = {
  title: 'Layout/Layout',
  component: Layout,
  ...astryx('Layout'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Layout.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['height', 'contentWidth', 'padding', 'defaultHasDividers', 'panels'],
  source: layoutSource,
};

/** Header, scrolling content and footer. */
export const HeaderContentFooter = composed(LayoutStory, {args: {defaultHasDividers: true}}, options);

export const StartPanel = composed(LayoutStory, {args: {panels: 'start', defaultHasDividers: true}}, options);

/** All five slots. Layout stamps each region with the slots present, which sets its insets. */
export const AllSlots = composed(LayoutStory, {
  args: {panels: 'both', defaultHasDividers: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('main', {name: 'Document'})).toHaveAttribute('data-layout-slots', 'header start end footer');
    await expect(canvas.getByRole('navigation', {name: 'Sections'})).toHaveAttribute('data-layout-area', 'start');
    await expect(canvas.getByRole('complementary', {name: 'Details'})).toHaveAttribute('data-layout-area', 'end');
  },
}, options);

/** Without dividers the regions' spacing collapses into one surface. */
export const NoDividers = composed(LayoutStory, {args: {panels: 'start', defaultHasDividers: false}}, options);

/** `contentWidth` centres every slot's content in a lane; the scrollbar stays at the edge. */
export const ContentWidth = composed(LayoutStory, {args: {contentWidth: 420, padding: 6}}, options);

/** `height="auto"`: grows with its content and the page scrolls instead. */
export const AutoHeight = composed(LayoutStory, {args: {height: 'auto'}}, options);

/** Plain HTML in the slots, passed as `args.slots` strings (no region components). */
export const HtmlSlots: Story = {
  args: {
    height: 'auto',
    slots: {
      header: '<strong>Header slot</strong>',
      start: '<nav aria-label="Pages">Start slot</nav>',
      default: '<p style="margin:0">The default slot is the content.</p>',
      footer: '<small>Footer slot</small>',
    },
  },
  decorators: [frame({width: 480})],
};
