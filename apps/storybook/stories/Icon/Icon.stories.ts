import Icon from 'astryx-astro/components/Icon/Icon.astro';
import Demo from 'astryx-astro/components/Icon/Icon.demo.astro';
import demoSource from 'astryx-astro/components/Icon/Icon.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import IconGallery from './IconGallery.astro';
import gallerySource from './IconGallery.astro?raw';
import IconMatrix from './IconMatrix.astro';
import matrixSource from './IconMatrix.astro?raw';

const meta = {
  title: 'Content/Icon',
  component: Icon,
  ...astryx('Icon'),
  args: {icon: 'search', size: 'lg'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Icon.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every built-in semantic icon name, from the theme's icon set. */
export const Gallery = composed(
  IconGallery,
  {
    play: async ({canvasElement}) => {
      for (const cell of canvasElement.querySelectorAll('[data-icon-name]')) {
        // Each name resolves to artwork (an unknown name would render nothing).
        await expect(cell.querySelector('.astryx-icon svg')).not.toBeNull();
      }
    },
  },
  {source: gallerySource},
);

/** Sizes × names, every colour, and a directional icon mirrored in right-to-left text. */
export const Matrix = composed(IconMatrix, {}, {source: matrixSource});

/** Without a label an icon is decorative: hidden from assistive technology. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const icon = canvasElement.querySelector('.astryx-icon')!;
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    await expect(icon).toHaveAttribute('data-size', 'lg');
  },
};

export const ExtraSmall: Story = {args: {size: 'xsm'}};

export const Medium: Story = {args: {size: 'md'}};

export const Accent: Story = {args: {color: 'accent'}};

/** A `label` makes a meaningful standalone icon an image with that name. */
export const WithLabel: Story = {
  args: {icon: 'success', color: 'success', label: 'Completed'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('img', {name: 'Completed'})).not.toHaveAttribute('aria-hidden');
  },
};

/** A namespaced key from a component's icon slot. */
export const NamespacedName: Story = {args: {icon: 'numberInput:stepperDown'}};

/** SVG markup passed as `icon`: the `<svg>` itself becomes the root. */
export const SvgString: Story = {
  args: {
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 5.65-7 10-7 10z"></path></svg>',
    color: 'red',
    label: 'Favorite',
  },
  play: async ({canvas}) => {
    const icon = canvas.getByRole('img', {name: 'Favorite'});
    await expect(icon.tagName.toLowerCase()).toBe('svg');
    await expect(icon).toHaveAttribute('data-color', 'red');
  },
};

/** An `<svg>` in the default slot. */
export const SvgSlot: Story = {
  args: {
    icon: undefined,
    color: 'teal',
    slots: {default: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="4"></rect></svg>'},
  },
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('svg')).toHaveAttribute('data-color', 'teal');
  },
};
