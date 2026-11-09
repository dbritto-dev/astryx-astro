import Markdown from 'astryx-astro/components/Markdown/Markdown.astro';
import Demo from 'astryx-astro/components/Markdown/Markdown.demo.astro';
import demoSource from 'astryx-astro/components/Markdown/Markdown.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import MarkdownHeadingLinks from './MarkdownHeadingLinks.astro';
import headingLinksSource from './MarkdownHeadingLinks.astro?raw';

/** The supported syntax, block by block. */
const syntax = `# Release notes

Atlas 4.2 brings **faster sync**, a _redesigned_ settings page and drops ~~the legacy exporter~~.
Run \`atlas sync --all\` after upgrading. Read the [migration guide](#migration) or the
[changelog on the web](https://example.com/changelog).

## Lists

- Sync engine
  - Delta uploads
    - Resumable chunks
- Settings page

5. Back up your workspace
6. Upgrade the CLI
   1. Check the version

- [x] Ship the migration script
- [ ] Update the screenshots

## Code

\`\`\`ts
import {createClient} from '@atlas/sdk';

const client = createClient({region: 'eu'});
await client.sync();
\`\`\`

## Table

| Plan | Projects | Storage | Support |
| :--- | ---: | ---: | :---: |
| Free | 3 | 1 GB | Community |
| Team | 50 | 100 GB | Email |

## Quote

> Sync stalls after sleep are fixed.
> - Reported by three customers

---

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6`;

const meta = {
  title: 'Content/Markdown',
  component: Markdown,
  ...astryx('Markdown'),
  args: {children: syntax},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Markdown.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** The supported syntax rendered as Astryx components: headings, emphasis, links, lists, tasks, code, table, quote, rule. */
export const Default: Story = {
  play: async ({canvas, canvasElement}) => {
    const root = canvasElement.querySelector('.astryx-markdown')!;
    await expect(root).toHaveAttribute('role', 'document');
    for (const level of [1, 2, 3, 4, 5, 6]) await expect(canvas.getAllByRole('heading', {level}).length).toBeGreaterThan(0);
    await expect(canvas.getByRole('heading', {level: 2, name: 'Lists'})).toHaveAttribute('id');
    await expect(root.querySelector('strong')).toHaveTextContent('faster sync');
    await expect(root.querySelector('del')).toHaveTextContent('the legacy exporter');
    await expect(root.querySelector('code.astryx-code')).toHaveTextContent('atlas sync --all');
    await expect(canvas.getByRole('link', {name: 'migration guide'})).not.toHaveAttribute('target');
    const external = canvas.getByRole('link', {name: 'changelog on the web'});
    await expect(external).toHaveAttribute('target', '_blank');
    await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
    const tasks = canvas.getAllByRole('checkbox');
    await expect(tasks.map((box) => (box as HTMLInputElement).checked)).toEqual([true, false]);
    await expect(canvas.getByRole('checkbox', {name: 'Ship the migration script'})).toHaveAttribute('aria-readonly', 'true');
    await expect(root.querySelector('.astryx-markdown-codeblock pre')).toHaveTextContent(/createClient/);
    await expect(canvas.getAllByRole('columnheader').map((cell) => cell.textContent?.trim())).toEqual(['Plan', 'Projects', 'Storage', 'Support']);
    await expect(root.querySelector('blockquote')).toHaveTextContent(/Sync stalls after sleep/);
    await expect(root.querySelectorAll('hr')).toHaveLength(1);
  },
};

/** Tighter spacing between blocks. */
export const Compact: Story = {args: {density: 'compact'}};

/** `headingLevelStart={3}`: `#` renders an h3 (clamped at h6), for a document inside a page section. */
export const HeadingLevelStart: Story = {
  args: {headingLevelStart: 3, children: '# Section title\n\nBody text.\n\n## Subsection\n\nMore text.'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('heading', {level: 3, name: 'Section title'})).toBeVisible();
    await expect(canvas.getByRole('heading', {level: 4, name: 'Subsection'})).toBeVisible();
  },
};

/** `display="inline"`: a span without block wrappers, for a line inside other text. */
export const Inline: Story = {
  args: {display: 'inline', children: 'Run `pnpm build` and **then** deploy.'},
  play: async ({canvasElement}) => {
    const root = canvasElement.querySelector('.astryx-markdown')!;
    await expect(root.tagName).toBe('SPAN');
    await expect(root.querySelector('[role="paragraph"]')).toBeNull();
  },
};

/** `sources`: `[id]` markers render as Citation chips, numbered in order. */
export const Citations: Story = {
  args: {
    children: 'Delta uploads cut sync time in half [design] and conflicts resolve by last write [rfc].',
    sources: {
      design: {title: 'Sync design doc', url: 'https://example.com/sync-design'},
      rfc: {title: 'Conflict resolution RFC', url: 'https://example.com/rfc-42'},
    },
  },
  play: async ({canvas}) => {
    await expect(canvas.getByRole('doc-noteref', {name: 'Citation 1: Sync design doc'})).toBeVisible();
    await expect(canvas.getByRole('doc-noteref', {name: 'Citation 2: Conflict resolution RFC'})).toBeVisible();
  },
};

/** `citationStyle="number"`: numbered superscript badges. */
export const NumberedCitations: Story = {args: {...Citations.args, citationStyle: 'number'}};

/** `autolink="gfm"`: bare URLs, `www.` and emails become links. */
export const Autolink: Story = {
  args: {autolink: 'gfm', children: 'Docs at https://docs.example.com, the site at www.example.com, or write to contact@example.com.'},
  play: async ({canvasElement}) => {
    const hrefs = [...canvasElement.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    await expect(hrefs).toContain('https://docs.example.com');
    await expect(hrefs).toContain('mailto:contact@example.com');
  },
};

/** Prose capped at 420px and centred in a wider container. */
export const ContentWidthCentered: Story = {
  args: {contentWidth: 420, contentAlign: 'center', children: '## Centred prose\n\nA narrower measure reads more comfortably on wide screens; tables and code blocks take the width as a floor.'},
};

/** Safety: raw HTML stays text, a link with a `javascript:` destination stays inert text, and a `data:` image shows its `[alt]`. */
export const UnsafeInput: Story = {
  args: {
    children: 'Raw <b>HTML</b> is escaped. A [blocked link](javascript:alert(1)) stays text.\n\n![Blocked image](data:image/png;base64,AAAA)',
  },
  play: async ({canvas, canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-markdown b')).toBeNull();
    await expect(canvasElement.querySelector('.astryx-markdown')).toHaveTextContent('Raw <b>HTML</b> is escaped.');
    await expect(canvas.queryByRole('link')).toBeNull();
    await expect(canvasElement.querySelector('[href*="alert(1)"]')).toBeNull();
    await expect(canvasElement.querySelector('.astryx-markdown')).toHaveTextContent('[blocked link](javascript:alert(1))');
    await expect(canvasElement.querySelector('img')).toBeNull();
    await expect(canvasElement.querySelector('.astryx-markdown')).toHaveTextContent('[Blocked image]');
  },
};

/** A tag-name override in `components` (`paragraph: 'p'`). */
export const ParagraphOverride: Story = {
  args: {components: {paragraph: 'p'}, children: 'First paragraph.\n\nSecond paragraph.'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelectorAll('.astryx-markdown p')).toHaveLength(2);
    await expect(canvasElement.querySelector('[role="paragraph"]')).toBeNull();
  },
};

/** `hasLinkClickEvent`: links dispatch the cancelable `astryx-link-click` {href}; `preventDefault()` stops navigation. */
export const LinkClickEvent: Story = {
  args: {hasLinkClickEvent: true, children: 'Open the [settings](#settings) page.'},
  play: async ({canvas, canvasElement}) => {
    const clicks = recordEvents<{href: string}>(canvasElement, 'astryx-link-click');
    const onClick = fn((event: Event) => event.preventDefault());
    canvasElement.addEventListener('astryx-link-click', onClick);
    await userEvent.click(canvas.getByRole('link', {name: 'settings'}));
    await waitFor(() => expect(clicks.map((event) => event.detail.href)).toEqual(['#settings']));
    await expect(onClick).toHaveBeenCalledTimes(1);
  },
};

/**
 * `isStreaming`: an `<ax-markdown-stream>` root. Appended text is revealed at a smoothed
 * pace; `finish()` shows the full text, rendered as a non-streaming Markdown would.
 */
export const Streaming: Story = {
  args: {isStreaming: true, children: 'The toolbar uses the shared'},
  play: async ({canvasElement}) => {
    const stream = await upgraded<HTMLElement & {append(text: string): void; finish(): void; isStreaming: boolean}>(canvasElement, 'ax-markdown-stream');
    stream.append(' **overlay tokens** now, so hover paint follows the theme.');
    stream.finish();
    await waitFor(() => expect(stream.querySelector('strong')).toHaveTextContent('overlay tokens'));
    await expect(stream).toHaveTextContent('The toolbar uses the shared overlay tokens now, so hover paint follows the theme.');
    await expect(stream.isStreaming).toBe(false);
  },
};

/**
 * The heading-links plugin: a `#` button after each heading copies the heading's absolute
 * permalink without navigating, says "Link copied" for 1.5 s and dispatches `astryx-copy`.
 */
export const HeadingLinks = composed(
  MarkdownHeadingLinks,
  {
    play: async ({canvas, canvasElement}) => {
      const heading = canvas.getByRole('heading', {name: 'Install'});
      const button = canvas.getByRole('button', {name: 'Copy link to Install'});
      await expect(canvas.getByRole('button', {name: 'Copy link to Configure'})).toBeInTheDocument();
      const copies = recordEvents<{text: string}>(canvasElement, 'astryx-copy');
      const before = window.location.href;
      // Stub the clipboard write: the play runs on page load in the published Storybook and must
      // not overwrite the viewer's clipboard (headless Chrome also denies it).
      const writeText = fn(async (_text: string) => {});
      Object.defineProperty(navigator.clipboard, 'writeText', {value: writeText, configurable: true});
      try {
        await userEvent.click(button);
        const permalink = new URL(`#${heading.id}`, window.location.href).href;
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(permalink));
        await waitFor(() => expect(button).toHaveAccessibleName('Link copied'));
        await expect(copies.map((event) => event.detail.text)).toEqual([permalink]);
        await expect(window.location.href).toBe(before);
      } finally {
        delete (navigator.clipboard as unknown as Record<string, unknown>).writeText;
      }
      await waitFor(() => expect(button).toHaveAccessibleName('Copy link to Install'), {timeout: 2500});
    },
  },
  {source: headingLinksSource},
);
