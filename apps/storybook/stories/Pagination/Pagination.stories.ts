import Pagination from 'astryx-astro/components/Pagination/Pagination.astro';
import Demo from 'astryx-astro/components/Pagination/Pagination.demo.astro';
import demoSource from 'astryx-astro/components/Pagination/Pagination.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import PaginationLinks from './PaginationLinks.astro';
import linksSource from './PaginationLinks.astro?raw';
import PaginationMatrix from './PaginationMatrix.astro';
import matrixSource from './PaginationMatrix.astro?raw';

const meta = {
  title: 'Navigation/Pagination',
  component: Pagination,
  ...astryx('Pagination'),
  args: {page: 1},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Pagination.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type PaginationElement = HTMLElement & {page: number; hasMore: boolean};

/** The page buttons and ellipses as text, the current page in brackets: `1 … 4 [5] 6 … 20`. */
const trail = (root: Element) => [...root.querySelectorAll('.ax-pagination-controls > [data-ax-pagination-item]')]
  .map((el) => (el.hasAttribute('data-page') ? (el.getAttribute('aria-current') === 'page' ? `[${el.textContent?.trim()}]` : el.textContent?.trim()) : '…'))
  .join(' ');
const nav = (root: Element, kind: string) => root.querySelector<HTMLButtonElement>(`[data-ax-nav="${kind}"]`)!;
const info = (root: Element) => root.querySelector('.ax-pagination-info')?.textContent?.trim();

/**
 * Page numbers with ellipses. A click on a page, previous or next dispatches `astryx-change`
 * `{page}` and re-renders in place (the pressed button keeps focus); `preventDefault()` keeps the
 * page; setting `el.page` re-renders without an event.
 */
export const Default: Story = {
  args: {page: 5, totalItems: 200, pageSize: 10},
  play: async ({canvas, canvasElement, step}) => {
    const root = await upgraded<PaginationElement>(canvasElement, 'ax-pagination');
    const changes = recordEvents<{page: number}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('navigation', {name: 'Pagination'})).toBe(root);
    await expect(trail(root)).toBe('1 … 4 [5] 6 … 20');

    await step('A page button changes the page and keeps focus', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Go to page 6'}));
      await expect(changes.map((e) => e.detail.page)).toEqual([6]);
      await waitFor(() => expect(trail(root)).toBe('1 … 5 [6] 7 … 20'));
      await expect(canvas.getByRole('button', {name: 'Go to page 6'})).toHaveFocus();
      await expect(canvas.getByRole('button', {name: 'Go to page 6'})).toHaveAttribute('aria-current', 'page');
    });

    await step('Next and previous step one page', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Go to next page'}));
      await waitFor(() => expect(trail(root)).toBe('1 … 6 [7] 8 … 20'));
      await userEvent.click(canvas.getByRole('button', {name: 'Go to previous page'}));
      await waitFor(() => expect(trail(root)).toBe('1 … 5 [6] 7 … 20'));
      await expect(changes.map((e) => e.detail.page)).toEqual([6, 7, 6]);
    });

    await step('preventDefault() on astryx-change keeps the page', async () => {
      root.addEventListener('astryx-change', (event) => event.preventDefault(), {once: true});
      await userEvent.click(canvas.getByRole('button', {name: 'Go to page 20'}));
      await expect(trail(root)).toBe('1 … 5 [6] 7 … 20');
    });

    await step('Setting el.page re-renders without an event', async () => {
      const before = changes.length;
      root.page = 1;
      await waitFor(() => expect(trail(root)).toBe('[1] 2 3 4 5 … 20'));
      await expect(changes.length).toBe(before);
    });
  },
};

/** Every variant at both sizes. */
export const Matrix = composed(PaginationMatrix, {}, {source: matrixSource});

/** On the first page previous is disabled (no tooltip); next shows its tooltip on hover. */
export const FirstPage: Story = {
  args: {totalPages: 10},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    await expect(nav(root, 'previous')).toBeDisabled();
    const next = nav(root, 'next');
    await expect(next).toBeEnabled();
    await userEvent.hover(next);
    await waitFor(() => expect(isShowing(canvasElement.querySelector(`#${next.dataset.axTooltip}`))).toBe(true));
  },
};

/** On the last page next is disabled; `siblingCount={2}` shows two pages on each side. */
export const LastPage: Story = {
  args: {page: 10, totalPages: 10, siblingCount: 2},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    await expect(nav(root, 'next')).toBeDisabled();
    await expect(trail(root)).toBe('1 … 4 5 6 7 8 9 [10]');
  },
};

export const Small: Story = {args: {page: 2, totalPages: 5, size: 'sm'}};

/**
 * "X–Y of Z" with a page-size Selector. Picking a size dispatches `astryx-page-size-change`
 * `{pageSize}`, then `astryx-change` back to page 1. Rendered in its own frame on the docs page
 * (see the known issue below).
 */
export const CountWithPageSize: Story = {
  args: {page: 1, totalItems: 137, pageSize: 25, pageSizeOptions: [10, 25, 50, 100], variant: 'count'},
  parameters: {docs: {story: {inline: false, height: '320px'}}},
  play: async ({canvas, canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    await expect(info(root)).toBe('1–25 of 137');
    await expect(canvas.getByRole('combobox', {name: 'Items per page'})).toHaveAttribute('aria-haspopup', 'listbox');
    // Known issue: the Selector binds its layer and listbox with getElementById when it connects.
    // Each story is a separate server render, so generated ids (`selector-9-layer`) repeat across
    // stories in one document; after the Overview story (whose demo has the same Selector) the
    // list never opens here. `pnpm -F storybook test stories/Pagination/ -t "Overview|Count With
    // Page Size"` fails, `-t "Default|Count With Page Size"` passes. So the size pick
    // (ArrowDown, End, ArrowUp, Enter → astryx-page-size-change {pageSize: 50}, then page 1) is
    // left out; tools/tests/pagination.test.mjs covers it.
    await userEvent.click(nav(root, 'next'));
    await waitFor(() => expect(info(root)).toBe('26–50 of 137'));
  },
};

/** "Page X of Y" between previous and next. */
export const Compact: Story = {args: {page: 3, totalPages: 12, variant: 'compact'}};

/** `hasFirstLast` adds first and last buttons to the compact variant. */
export const CompactWithFirstLast: Story = {
  args: {page: 3, totalPages: 12, variant: 'compact', hasFirstLast: true},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    await userEvent.click(nav(root, 'last'));
    await waitFor(() => expect(info(root)).toBe('Page 12 of 12'));
    await expect(nav(root, 'last')).toBeDisabled();
    await userEvent.click(nav(root, 'first'));
    await waitFor(() => expect(info(root)).toBe('Page 1 of 12'));
  },
};

/** Previous and next only. */
export const NoneVariant: Story = {args: {page: 2, totalPages: 8, variant: 'none'}};

/** Cursor paging (`hasMore`, total unknown): next advances; `el.hasMore = false` disables it. */
export const CursorPaging: Story = {
  args: {page: 1, hasMore: true, variant: 'none', label: 'Results'},
  play: async ({canvas, canvasElement}) => {
    const root = await upgraded<PaginationElement>(canvasElement, 'ax-pagination');
    const changes = recordEvents<{page: number}>(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('navigation', {name: 'Results'})).toBe(root);
    await userEvent.click(nav(root, 'next'));
    await expect(changes.map((e) => e.detail.page)).toEqual([2]);
    root.hasMore = false;
    await waitFor(() => expect(nav(root, 'next')).toBeDisabled());
  },
};

/**
 * Dots: a radio group with one Tab stop; arrows (wrapping), Home and End select as focus moves;
 * a click selects; next moves the checked dot.
 */
export const Dots: Story = {
  args: {page: 2, totalPages: 6, variant: 'dots'},
  play: async ({canvas, canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    const changes = recordEvents<{page: number}>(canvasElement, 'astryx-change');
    const group = canvas.getByRole('radiogroup', {name: 'Page indicators'});
    const checked = () => group.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label');
    await expect(checked()).toBe('Page 2');
    await expect(group.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    canvas.getByRole('radio', {name: 'Page 2'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(checked()).toBe('Page 3'));
    await expect(canvas.getByRole('radio', {name: 'Page 3'})).toHaveFocus();
    await userEvent.keyboard('{End}');
    await waitFor(() => expect(checked()).toBe('Page 6'));
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(checked()).toBe('Page 1'));
    await userEvent.click(canvas.getByRole('radio', {name: 'Page 4'}));
    await waitFor(() => expect(checked()).toBe('Page 4'));
    await userEvent.click(nav(root, 'next'));
    await waitFor(() => expect(checked()).toBe('Page 5'));
    await expect(changes.map((e) => e.detail.page)).toEqual([3, 6, 1, 4, 5]);
  },
};

export const DotsSmall: Story = {args: {page: 1, totalPages: 4, variant: 'dots', size: 'sm'}};

/**
 * "Page [ n ] / N" with first and last: a typed page commits on Enter, clamped to 1…N (the
 * inner NumberInput's own event stops at the root).
 */
export const Input: Story = {
  args: {page: 4, totalPages: 20, variant: 'input'},
  play: async ({canvas, canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    const changes = recordEvents<{page: number}>(canvasElement, 'astryx-change');
    const box = canvas.getByRole('spinbutton', {name: /Go to page/}) as HTMLInputElement;
    await expect(box).toHaveValue('4');
    await userEvent.clear(box);
    await userEvent.type(box, '99{Enter}');
    await waitFor(() => expect(box).toHaveValue('20'));
    await expect(changes.filter((e) => e.target === root).map((e) => e.detail.page)).toEqual([20]);
    await expect(nav(root, 'next')).toBeDisabled();
    await userEvent.click(nav(root, 'first'));
    await waitFor(() => expect(box).toHaveValue('1'));
  },
};

/** A custom `pageLabel` and `step={5}`: previous and next move five pages ("Go forward 5 pages"). */
export const InputWithStep: Story = {
  args: {page: 7, totalPages: 40, variant: 'input', pageLabel: 'Row', step: 5, size: 'sm'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-pagination');
    const changes = recordEvents<{page: number}>(canvasElement, 'astryx-change');
    await userEvent.click(canvas.getByRole('button', {name: 'Go forward 5 pages'}));
    await expect(changes.map((e) => e.detail.page)).toEqual([12]);
    await expect(canvas.getByRole('button', {name: 'Go back 5 pages'})).toBeEnabled();
  },
};

/** Every control is disabled. */
export const Disabled: Story = {
  args: {page: 3, totalPages: 7, isDisabled: true},
  play: async ({canvas}) => {
    for (const button of canvas.getAllByRole('button')) await expect(button).toBeDisabled();
  },
};

/** Disabled dots are aria-disabled and nothing changes. */
export const DotsDisabled: Story = {
  args: {page: 3, totalPages: 7, variant: 'dots', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-pagination');
    const changes = recordEvents(canvasElement, 'astryx-change');
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).toHaveAttribute('aria-disabled', 'true');
    canvas.getByRole('radio', {name: 'Page 5'}).click();
    await expect(changes).toHaveLength(0);
  },
};

/** `locale="es-ES"`: translated labels and number formatting. */
export const Translated: Story = {
  args: {page: 2, totalItems: 1234, pageSize: 20, variant: 'count', locale: 'es-ES'},
  play: async ({canvasElement}) => {
    const root = await upgraded(canvasElement, 'ax-pagination');
    await expect(info(root)).toBe('21–40 de 1234');
  },
};

/** Links mode (`href` function): every page is a real link and the current one is `aria-current="page"`. */
export const Links = composed(PaginationLinks, {
  args: {page: 4, totalPages: 9},
  play: async ({canvas}) => {
    const current = canvas.getByRole('link', {name: 'Go to page 4'});
    await expect(current).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', {name: 'Go to page 5'})).toHaveAttribute('href', '/docs/changelog/?page=5');
    await expect(canvas.getByRole('link', {name: 'Go to next page'})).toHaveAttribute('href', '/docs/changelog/?page=5');
  },
}, {controls: ['page', 'totalPages', 'variant'], source: linksSource});

/** Links mode with dots: each dot is a link. */
export const LinksDots = composed(PaginationLinks, {
  args: {page: 2, totalPages: 5, variant: 'dots'},
  play: async ({canvasElement}) => {
    const dots = [...canvasElement.querySelectorAll('.astryx-pagination-dot')];
    await expect(dots).toHaveLength(5);
    for (const dot of dots) await expect(dot.tagName).toBe('A');
  },
}, {controls: ['page', 'totalPages', 'variant'], source: linksSource});
