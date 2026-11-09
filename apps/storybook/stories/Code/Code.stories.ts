import Code from 'astryx-astro/components/Code/Code.astro';
import Demo from 'astryx-astro/components/Code/Code.demo.astro';
import demoSource from 'astryx-astro/components/Code/Code.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import CodeInText from './CodeInText.astro';
import inTextSource from './CodeInText.astro?raw';

const meta = {
  title: 'Content/Code',
  component: Code,
  ...astryx('Code'),
  args: {slots: {default: 'npm run build'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Code.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A `<code>` element in the code font on a muted background. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('code')).toHaveTextContent('npm run build');
  },
};

export const Secondary: Story = {args: {color: 'secondary'}};

/** `color="inherit"` takes the surrounding text colour. */
export const InheritColor: Story = {args: {color: 'inherit'}};

/** Inline in running text: default and inherited size in large text, secondary and inherited colour. */
export const InText = composed(CodeInText, {}, {source: inTextSource});

/** A long path wraps inside a narrow container instead of breaking the layout. */
export const LongWraps: Story = {
  args: {slots: {default: 'packages/astryx-astro/src/components/Code/Code.astro'}},
  decorators: [frame({width: 220})],
  play: async ({canvasElement}) => {
    const code = canvasElement.querySelector('code')!;
    await expect(code.getBoundingClientRect().width).toBeLessThanOrEqual(220);
  },
};
