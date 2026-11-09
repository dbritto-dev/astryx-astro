import Citation from 'astryx-astro/components/Citation/Citation.astro';
import Demo from 'astryx-astro/components/Citation/Citation.demo.astro';
import demoSource from 'astryx-astro/components/Citation/Citation.demo.astro?raw';
import Icon from 'astryx-astro/components/Icon/Icon.astro';
import {expect} from 'storybook/test';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

/** An inline SVG favicon (no external images), as in Citation.demo.astro. */
const favicon =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#1b1b1b"/><text x="8" y="12" font-family="sans-serif" font-size="10" font-weight="700" fill="white" text-anchor="middle">M</text></svg>',
  );

const meta = {
  title: 'Content/Citation',
  component: Citation,
  ...astryx('Citation'),
  args: {number: 1, source: {title: 'Astro documentation', url: 'https://docs.astro.build/'}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Citation.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** A label chip with the source title: a note reference that opens the source in a new tab. */
export const Default: Story = {
  play: async ({canvas}) => {
    const citation = canvas.getByRole('doc-noteref', {name: 'Citation 1: Astro documentation'});
    await expect(citation).toHaveAttribute('href', 'https://docs.astro.build/');
    await expect(citation).toHaveAttribute('target', '_blank');
    await expect(citation).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(citation).toHaveAttribute('title', 'Astro documentation');
  },
};

/** A compact superscript number badge. */
export const NumberVariant: Story = {
  args: {variant: 'number', number: 2},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('doc-noteref', {name: 'Citation 2: Astro documentation'})).toHaveTextContent('2');
  },
};

/** `source.src`: a favicon image before the title (decorative). */
export const WithFavicon: Story = {
  args: {source: {title: 'MDN Web Docs', url: 'https://developer.mozilla.org/', src: favicon}},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('.ax-citation-icon')).toHaveAttribute('aria-hidden', 'true');
    await expect(canvasElement.querySelector('.ax-citation-icon img')).toHaveAttribute('alt', '');
  },
};

/** An Icon in the `icon` slot (a configured component). */
export const IconSlot: Story = {
  args: {number: 4, source: {title: 'External link', url: 'https://example.com/'}, slots: {icon: {component: Icon, props: {icon: 'externalLink', size: 'xsm'}}}},
};

/** No `url`: an inert span that still shows and names the citation. */
export const WithoutUrl: Story = {
  args: {number: 6, source: {title: 'Internal meeting notes'}},
  play: async ({canvas}) => {
    const citation = canvas.getByRole('group', {name: 'Citation 6: Internal meeting notes'});
    await expect(citation.tagName).toBe('SPAN');
    await expect(citation).not.toHaveAttribute('href');
  },
};

/** A rejected `url` (here `javascript:`) renders the same inert span. */
export const BlockedUrl: Story = {
  args: {number: 7, source: {title: 'Blocked destination', url: 'javascript:alert(1)'}},
  play: async ({canvas}) => {
    await expect(canvas.queryByRole('doc-noteref')).toBeNull();
    await expect(canvas.getByRole('group', {name: 'Citation 7: Blocked destination'})).not.toHaveAttribute('href');
  },
};

/** A long title truncates with an ellipsis; `title` keeps the full text. */
export const LongTitle: Story = {
  args: {number: 5, source: {title: 'A very long source title that truncates with an ellipsis at fifteen em', url: 'https://example.com/a/very/long/path'}},
  play: async ({canvasElement}) => {
    const label = canvasElement.querySelector<HTMLElement>('.ax-citation-label')!;
    await expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
  },
};
