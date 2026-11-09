import NavIcon from 'astryx-astro/components/NavIcon/NavIcon.astro';
import Demo from 'astryx-astro/components/NavIcon/NavIcon.demo.astro';
import demoSource from 'astryx-astro/components/NavIcon/NavIcon.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {boltIcon, logoMark} from 'astryx-astro/components/NavItem/_demoIcons';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import NavIconInHeading from './NavIconInHeading.astro';
import headingSource from './NavIconInHeading.astro?raw';

const meta = {
  title: 'Navigation/Nav Icon',
  component: NavIcon,
  ...astryx('NavIcon'),
  args: {icon: 'wrench'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (NavIcon.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A registry icon name in the accent circle. Display only: not focusable, no role. */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const icon = canvasElement.querySelector('.astryx-nav-icon')!;
    await expect(icon.tagName).toBe('SPAN');
    await expect(icon).not.toHaveAttribute('tabindex');
    await expect(icon.querySelector('svg')).not.toBeNull();
  },
};

/** `icon` as an inline SVG string. */
export const SvgIcon: Story = {args: {icon: boltIcon}};

/** Artwork in the default slot (Astryx `icon: ReactNode`). */
export const DefaultSlot: Story = {args: {slots: {default: logoMark}}};

/** An Icon in the `icon` slot. */
export const IconSlot: Story = {args: {slots: {icon: {component: Icon, props: {icon: 'search', size: 'sm', color: 'inherit'}}}}};

/** As a TopNavHeading `logo`. */
export const InTopNavHeading = composed(NavIconInHeading, {}, {source: headingSource});
