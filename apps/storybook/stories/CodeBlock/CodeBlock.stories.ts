import CodeBlock from 'astryx-astro/components/CodeBlock/CodeBlock.astro';
import Demo from 'astryx-astro/components/CodeBlock/CodeBlock.demo.astro';
import demoSource from 'astryx-astro/components/CodeBlock/CodeBlock.demo.astro?raw';
import IconButton from 'astryx-astro/components/IconButton/IconButton.astro';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, frame, overview, type Meta, type Story} from '../_lib/story';
import CodeBlockLanguages from './CodeBlockLanguages.astro';
import languagesSource from './CodeBlockLanguages.astro?raw';

const tsx = `import {useState} from 'react';

export function Counter({start = 0}: {start?: number}) {
  const [count, setCount] = useState(start);
  // Increment on click
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
`;
const python = `def fib(n: int) -> int:
    """Return the n-th Fibonacci number."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`;
const diff = `--- a/greet.ts
+++ b/greet.ts
@@ -1,4 +1,4 @@
 export function greet(name: string) {
-  return 'Hello ' + name;
+  return \`Hello, \${name}!\`;
 }
`;
const json = `{"name": "astryx-astro", "private": true, "version": "0.7.9", "scripts": {"build": "astro build", "test": "node tools/tests/run-all.mjs"}}`;
/** 40 deterministic CSS rules: long enough to scroll and to collapse. */
const css = Array.from({length: 40}, (_, i) => `.row-${i + 1} { inset-inline-start: ${i * 4}px; color: var(--color-text-primary); }`).join('\n');

const meta = {
  title: 'Content/Code Block',
  component: CodeBlock,
  ...astryx('CodeBlock'),
  args: {code: tsx, language: 'tsx'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (CodeBlock.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * Stub the clipboard write while `run` runs: the play runs on page load in the published
 * Storybook and must not overwrite the viewer's clipboard (headless Chrome also denies it).
 */
async function withClipboardStub(run: (writeText: ReturnType<typeof fn>) => Promise<void>) {
  const writeText = fn(async (_text: string) => {});
  Object.defineProperty(navigator.clipboard, 'writeText', {value: writeText, configurable: true});
  try {
    await run(writeText);
  } finally {
    delete (navigator.clipboard as unknown as Record<string, unknown>).writeText;
  }
}

/**
 * Title, language label, line numbers and highlighted lines. Copy writes the exact source,
 * flips the button's name to "Copied" for 2 s, announces it and dispatches `astryx-copy`.
 */
export const Default: Story = {
  args: {title: 'Counter.tsx', hasLineNumbers: true, highlightLines: [4, 6]},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-scrollable-area');
    await expect(canvasElement.querySelector('.astryx-code-block-title')).toHaveTextContent('Counter.tsx — tsx');
    await expect(canvasElement.querySelectorAll('[data-line]')).toHaveLength(7);
    const copies = recordEvents<{text: string}>(canvasElement, 'astryx-copy');
    const button = canvas.getByRole('button', {name: 'Copy code'});
    await withClipboardStub(async (writeText) => {
      await step('Copy writes the exact source and shows "Copied"', async () => {
        await userEvent.click(button);
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(tsx));
        await waitFor(() => expect(button).toHaveAccessibleName('Copied'));
        await expect(button).toHaveAttribute('data-copied');
        await expect(copies.map((event) => event.detail.text)).toEqual([tsx]);
        await waitFor(() => expect(document.querySelector('[data-astryx-live-region="polite"]')).toHaveTextContent('Copied'));
      });
    });
    await step('The copied state resets after 2 s', async () => {
      await waitFor(() => expect(button).toHaveAccessibleName('Copy code'), {timeout: 3000});
      await expect(button).not.toHaveAttribute('data-copied');
    });
  },
};

/** `size="sm"`, numbering from line 41 of the source file. */
export const Small: Story = {
  args: {code: python, language: 'python', size: 'sm', hasLineNumbers: true, startLineNumber: 41, highlightLines: [43]},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('[data-line]')).toHaveAttribute('data-line', '41');
  },
};

/** No header: Copy sits in a column beside the code. */
export const NoHeader: Story = {
  args: {code: 'pnpm install\ncd apps/docs && npx astro build', language: 'bash', hasLanguageLabel: false},
  play: async ({canvas, canvasElement}) => {
    await expect(canvasElement.querySelector('.astryx-code-block-header')).toBeNull();
    await expect(canvas.getByRole('button', {name: 'Copy code'})).toBeVisible();
  },
};

/** `container="section"`: flush and transparent, for code inside another surface. */
export const SectionContainer: Story = {args: {code: python, language: 'python', container: 'section'}};

/** A unified diff over TypeScript: file header, hunk, added and removed rows. Copy keeps the diff glyphs. */
export const Diff: Story = {
  args: {code: diff, language: 'ts', isDiff: true, hasLineNumbers: true},
  play: async ({canvasElement}) => {
    const kinds = [...canvasElement.querySelectorAll('[data-line]')].map((row) => row.getAttribute('data-diff'));
    await expect(kinds).toContain('added');
    await expect(kinds).toContain('removed');
    await expect(kinds).toContain('header');
  },
};

/** No copy button. */
export const WithoutCopyButton: Story = {
  args: {code: diff, isDiff: true, hasCopyButton: false},
  play: async ({canvas}) => {
    await expect(canvas.queryByRole('button', {name: 'Copy code'})).toBeNull();
  },
};

/** Long lines wrap instead of scrolling. */
export const Wrapped: Story = {
  args: {code: json, language: 'json', isWrapped: true, width: '100%'},
  decorators: [frame({width: 420})],
  play: async ({canvasElement}) => {
    const viewport = canvasElement.querySelector<HTMLElement>('.ax-codeblock-viewport')!;
    await expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
  },
};

/** An IconButton in the `endContent` slot, before Copy. */
export const EndContentSlot: Story = {
  args: {
    code: json,
    language: 'json',
    isWrapped: true,
    width: '100%',
    slots: {endContent: {component: IconButton, props: {label: 'Open in editor', icon: 'externalLink', variant: 'ghost', size: 'sm'}}},
  },
  play: async ({canvasElement}) => {
    const names = [...canvasElement.querySelectorAll('.ax-codeblock-controls > button')].map((button) => button.getAttribute('aria-label'));
    await expect(names).toEqual(['Open in editor', 'Copy code']);
  },
};

/** `maxHeight`: the overflowing viewport scrolls and becomes a named tab stop for keyboard scrolling. */
export const MaxHeight: Story = {
  args: {code: css, language: 'css', title: 'rows.css', hasLineNumbers: true, maxHeight: 220, width: '100%'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-scrollable-area');
    const viewport = canvas.getByRole('group', {name: 'css'});
    await expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    await waitFor(() => expect(viewport).toHaveAttribute('tabindex', '0'));
    await userEvent.tab();
    await userEvent.tab();
    // Copy comes first in the header; the viewport is the next stop. (Synthetic keys do not
    // scroll natively, so scrolling by keyboard itself is not asserted.)
    await expect(viewport).toHaveFocus();
  },
};

/** The title row is a disclosure button: click, Enter or Space collapses and expands the code; copy never toggles it. */
export const Collapsible: Story = {
  args: {code: css, language: 'css', title: 'rows.css', hasLineNumbers: true, maxHeight: 220, isCollapsible: true, width: '100%'},
  play: async ({canvas, canvasElement, step}) => {
    const changes = recordEvents<{isCollapsed: boolean}>(canvasElement, 'astryx-collapse-change');
    const toggle = canvas.getByRole('button', {name: /rows\.css/});
    const region = canvasElement.querySelector<HTMLElement>(`#${toggle.getAttribute('aria-controls')}`)!;
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await step('Copy does not toggle the collapse', async () => {
      await withClipboardStub(async () => {
        await userEvent.click(canvas.getByRole('button', {name: 'Copy code'}));
        await waitFor(() => expect(canvas.getByRole('button', {name: 'Copied'})).toBeVisible());
      });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(changes).toHaveLength(0);
    });

    await step('A click collapses: the region is inert', async () => {
      await userEvent.click(toggle);
      await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
      await expect(region.inert).toBe(true);
    });

    await step('Enter expands, Space collapses', async () => {
      toggle.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
      await expect(region.inert).toBe(false);
      await userEvent.keyboard(' ');
      await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
    });

    await expect(changes.map((event) => event.detail.isCollapsed)).toEqual([true, false, true]);
  },
};

/** `highlightMode="ranges"`: bare line text painted with the CSS Custom Highlight API. */
export const HighlightRanges: Story = {
  args: {code: 'fn main() {\n    let xs = vec![1, 2, 3];\n    let total: i32 = xs.iter().sum();\n    println!("{}", total);\n}', language: 'rust', highlightMode: 'ranges', hasLineNumbers: true},
};

/** Per-instance syntax colours (`syntaxTheme`). */
export const WithSyntaxTheme: Story = {
  args: {
    code: tsx.split('\n').slice(3, 6).join('\n'),
    language: 'ts',
    syntaxTheme: {
      name: 'night',
      tokens: {
        background: '#1e1f29', variable: '#e6e6f0', keyword: '#ff79c6', string: '#9be38f', comment: '#8a8fa8',
        number: '#f5b56b', function: '#82aaff', type: '#c792ea', operator: '#89ddff', punctuation: '#a6accd',
        property: '#80cbc4', constant: '#f78c6c',
      },
    },
  },
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelector('[data-astryx-syntax-theme]')).toHaveAttribute('data-astryx-syntax-theme', 'night');
  },
};

/** One snippet in each of several built-in languages. */
export const Languages = composed(CodeBlockLanguages, {}, {source: languagesSource});
