import Text from 'astryx-astro/components/Text/Text.astro';
import Demo from 'astryx-astro/components/Text/Text.demo.astro';
import demoSource from 'astryx-astro/components/Text/Text.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import TextHeadings from './TextHeadings.astro';
import headingsSource from './TextHeadings.astro?raw';

const meta = {
  title: 'Content/Text',
  component: Text,
  ...astryx('Text'),
  args: {slots: {default: 'The quick brown fox jumps over the lazy dog.'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Text.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

export const Body: Story = {};

export const Large: Story = {args: {type: 'large'}};

export const Label: Story = {args: {type: 'label'}};

/** Secondary colour by default. */
export const Supporting: Story = {args: {type: 'supporting'}};

export const Code: Story = {args: {type: 'code', slots: {default: 'const answer = 42;'}}};

export const Display1: Story = {args: {type: 'display-1', as: 'h1', slots: {default: 'Display 1'}}};

export const Display2: Story = {args: {type: 'display-2', as: 'h2', slots: {default: 'Display 2'}}};

export const Display3: Story = {args: {type: 'display-3', as: 'h3', slots: {default: 'Display 3'}}};

export const AccentSemibold: Story = {args: {color: 'accent', weight: 'semibold'}};

export const Strikethrough: Story = {args: {hasStrikethrough: true}};

export const TabularNumbers: Story = {args: {hasTabularNumbers: true, display: 'block', slots: {default: '1,111.11<br>9,999.99'}}};

/** One line with an ellipsis; the full text shows in a tooltip on hover and keyboard focus. */
export const TruncatedOneLine: Story = {
  args: {
    maxLines: 1,
    slots: {default: 'Single-line truncation keeps a long sentence on one line with an ellipsis and a tooltip.'},
  },
  decorators: [frame({width: 280})],
  play: async ({canvasElement}) => {
    const text = canvasElement.querySelector<HTMLElement>('.astryx-text')!;
    // The behaviour attaches the tooltip once a ResizeObserver reports the text truncated.
    await waitFor(() => expect(text).toHaveAttribute('data-ax-tooltip'));
    await expect(text).toHaveAccessibleDescription(/Single-line truncation keeps/);
    await userEvent.hover(text);
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

export const TruncatedTwoLines: Story = {
  args: {
    type: 'supporting',
    maxLines: 2,
    slots: {default: 'Two-line clamp: this longer supporting paragraph is cut after its second line, and hovering or focusing it shows the full text.'},
  },
  decorators: [frame({width: 280})],
};

/** Heading, Text's sub-component: levels 1–6, colour, announced level and display type. */
export const Headings = composed(TextHeadings, {}, {source: headingsSource});
