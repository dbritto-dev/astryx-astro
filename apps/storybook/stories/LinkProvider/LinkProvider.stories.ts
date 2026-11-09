import LinkProvider from 'astryx-astro/components/LinkProvider/LinkProvider.astro';
import Demo from 'astryx-astro/components/LinkProvider/LinkProvider.demo.astro';
import demoSource from 'astryx-astro/components/LinkProvider/LinkProvider.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import LinkProviderStory from './LinkProviderStory.astro';
import storySource from './LinkProviderStory.astro?raw';

const meta = {
  title: 'Utility/Link Provider',
  component: LinkProvider,
  ...astryx('LinkProvider'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (LinkProvider.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['hasProvider', 'hasNestedReset'], source: storySource};

/**
 * Link, Button `href` and ClickableCard all render through the provider's router link component
 * (marked `data-router-link`); `as="a"` on a link wins over the provider; a blocked destination
 * never reaches the component (an inert anchor without href).
 */
export const RouterLinks = composed(LinkProviderStory, {
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Documentation'})).toHaveAttribute('data-router-link');
    await expect(canvas.getByRole('link', {name: 'Documentation'})).toHaveAttribute('href', '/docs/');
    await expect(canvas.getByRole('link', {name: 'Pricing'})).toHaveAttribute('data-router-link');
    await expect(canvas.getByRole('link', {name: 'Changelog'})).toHaveAttribute('data-router-link');
    await expect(canvas.getByRole('link', {name: /Plain anchor/})).not.toHaveAttribute('data-router-link');
    const blocked = canvas.getByText('Blocked destination').closest('a')!;
    await expect(blocked).not.toHaveAttribute('href');
    await expect(blocked).not.toHaveAttribute('data-router-link');
  },
}, options);

/** Without a provider every link is a native `<a>`. */
export const WithoutProvider = composed(LinkProviderStory, {
  args: {hasProvider: false},
  play: async ({canvas}) => {
    for (const link of canvas.getAllByRole('link')) await expect(link).not.toHaveAttribute('data-router-link');
  },
}, options);

/** A nested `LinkProvider component="a"` resets its own subtree to native anchors. */
export const NestedReset = composed(LinkProviderStory, {
  args: {hasNestedReset: true},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('link', {name: 'Documentation (nested reset)'})).not.toHaveAttribute('data-router-link');
    await expect(canvas.getByRole('link', {name: 'Documentation'})).toHaveAttribute('data-router-link');
  },
}, options);
