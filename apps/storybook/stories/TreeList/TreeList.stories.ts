import TreeList from 'astryx-astro/components/TreeList/TreeList.astro';
import Demo from 'astryx-astro/components/TreeList/TreeList.demo.astro';
import demoSource from 'astryx-astro/components/TreeList/TreeList.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const folder = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h9A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>';
const file = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';

// A project tree: button rows (`interactiveRole`) report `astryx-select`; one parent is
// collapsed, one is disabled.
const files = [
  {id: 'src', label: 'src', startContent: folder, isExpanded: true, children: [
    {id: 'components', label: 'components', startContent: folder, isExpanded: true, children: [
      {id: 'button', label: 'Button.astro', startContent: file, interactiveRole: 'button'},
      {id: 'card', label: 'Card.astro', startContent: file, interactiveRole: 'button', isSelected: true},
    ]},
    {id: 'lib', label: 'lib', startContent: folder, children: [
      {id: 'cascade', label: 'cascade.ts', startContent: file, interactiveRole: 'button'},
      {id: 'uid', label: 'uid.ts', startContent: file, interactiveRole: 'button'},
    ]},
    {id: 'index', label: 'index.ts', startContent: file, interactiveRole: 'button'},
  ]},
  {id: 'docs', label: 'docs', startContent: folder, children: [
    {id: 'guide', label: 'guide.md', startContent: file, interactiveRole: 'button'},
  ]},
  {id: 'archive', label: 'archive', startContent: folder, isDisabled: true, children: [{id: 'old', label: 'old.txt', startContent: file}]},
  {id: 'pkg', label: 'package.json', startContent: file, interactiveRole: 'button', endContent: '2 KB'},
  {id: 'readme', label: 'README.md', startContent: file, interactiveRole: 'button', description: 'Project overview'},
];

const nested = [
  {id: 'n-1', label: 'Level 1', isExpanded: true, children: [
    {id: 'n-2', label: 'Level 2', isExpanded: true, children: [
      {id: 'n-3', label: 'Level 3', isExpanded: true, children: [{id: 'n-4', label: 'Level 4'}]},
      {id: 'n-2b', label: 'Sibling'},
    ]},
  ]},
  {id: 'n-last', label: 'Last root'},
];

const meta = {
  title: 'Table & List/Tree List',
  component: TreeList,
  ...astryx('TreeList'),
  args: {items: files, header: 'Project files'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (TreeList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const row = (root: HTMLElement, id: string) => root.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const focusedId = () => (document.activeElement?.closest('[role="treeitem"]') as HTMLElement | null)?.dataset.treeId;

/**
 * The APG tree keyboard model with one roving Tab stop (seeded on the selected row): ↓/↑ move
 * (disabled rows skipped), → expands a collapsed parent then moves into it, ← moves to the parent
 * then collapses it, Home/End, Enter/Space toggle a parent, typeahead, and `*` expands siblings.
 * Expanding and collapsing report `astryx-expanded-change`.
 */
export const KeyboardNavigation: Story = {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-tree-list');
    const expandedChanges = recordEvents<{id: string; isExpanded: boolean}>(canvasElement, 'astryx-expanded-change');
    const tree = canvas.getByRole('tree', {name: 'Project files'});

    await step('One Tab stop, on the selected row', async () => {
      await expect(row(canvasElement, 'card')).toHaveAttribute('aria-selected', 'true');
      await userEvent.tab();
      await expect(focusedId()).toBe('card');
      await expect(tree.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    });
    await step('ArrowDown / ArrowUp move between visible rows', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(focusedId()).toBe('lib');
      await userEvent.keyboard('{ArrowUp}');
      await expect(focusedId()).toBe('card');
      await userEvent.keyboard('{ArrowDown}');
    });
    await step('ArrowRight expands a collapsed parent, then moves to its first child', async () => {
      await expect(row(canvasElement, 'lib')).toHaveAttribute('aria-expanded', 'false');
      await userEvent.keyboard('{ArrowRight}');
      await expect(row(canvasElement, 'lib')).toHaveAttribute('aria-expanded', 'true');
      await expect(focusedId()).toBe('lib');
      await expect(expandedChanges.map((event) => event.detail)).toEqual([{id: 'lib', isExpanded: true}]);
      await userEvent.keyboard('{ArrowRight}');
      await expect(focusedId()).toBe('cascade');
    });
    await step('ArrowLeft moves to the parent, then collapses it', async () => {
      await userEvent.keyboard('{ArrowLeft}');
      await expect(focusedId()).toBe('lib');
      await userEvent.keyboard('{ArrowLeft}');
      await expect(row(canvasElement, 'lib')).toHaveAttribute('aria-expanded', 'false');
      await expect(expandedChanges.at(-1)?.detail).toEqual({id: 'lib', isExpanded: false});
    });
    await step('Home and End; ArrowUp skips the disabled row', async () => {
      await userEvent.keyboard('{End}');
      await expect(focusedId()).toBe('readme');
      await userEvent.keyboard('{ArrowUp}{ArrowUp}');
      await expect(focusedId()).toBe('docs');
      await userEvent.keyboard('{Home}');
      await expect(focusedId()).toBe('src');
    });
    await step('Enter and Space toggle a parent without an action', async () => {
      await userEvent.keyboard('{End}{ArrowUp}{ArrowUp}');
      await expect(focusedId()).toBe('docs');
      await userEvent.keyboard('{Enter}');
      await expect(row(canvasElement, 'docs')).toHaveAttribute('aria-expanded', 'true');
      await userEvent.keyboard(' ');
      await expect(row(canvasElement, 'docs')).toHaveAttribute('aria-expanded', 'false');
    });
    await step('Typeahead moves to the next row starting with the typed letter', async () => {
      await userEvent.keyboard('r');
      await expect(focusedId()).toBe('readme');
    });
    await step('* expands every expandable sibling (the disabled one stays closed)', async () => {
      await userEvent.keyboard('{Home}*');
      await waitFor(() => expect(row(canvasElement, 'docs')).toHaveAttribute('aria-expanded', 'true'));
      await expect(row(canvasElement, 'archive')).toHaveAttribute('aria-expanded', 'false');
    });
  },
};

/**
 * Button rows (`interactiveRole: 'button'`): Enter or a click on the row reports `astryx-select`
 * {id}; the element's `selectedId` moves the selection.
 */
export const Selection: Story = {
  play: async ({canvasElement, step}) => {
    const list = await upgraded<HTMLElement & {selectedId: string}>(canvasElement, 'ax-tree-list');
    const selects = recordEvents<{id: string}>(canvasElement, 'astryx-select');
    await step('Enter on a button row reports astryx-select', async () => {
      row(canvasElement, 'button').focus();
      await userEvent.keyboard('{Enter}');
      await expect(selects.map((event) => event.detail.id)).toEqual(['button']);
    });
    await step('A click on a row reports astryx-select once', async () => {
      await userEvent.click(row(canvasElement, 'pkg').querySelector('.astryx-tree-list-item')!);
      await expect(selects.map((event) => event.detail.id)).toEqual(['button', 'pkg']);
    });
    await step('selectedId moves aria-selected', async () => {
      list.selectedId = 'pkg';
      await waitFor(() => expect(row(canvasElement, 'pkg')).toHaveAttribute('aria-selected', 'true'));
      await expect(row(canvasElement, 'card')).not.toHaveAttribute('aria-selected');
    });
  },
};

/** A click on a parent's row or its chevron toggles it; a disabled parent never toggles. */
export const PointerToggle: Story = {
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tree-list');
    const changes = recordEvents<{id: string}>(canvasElement, 'astryx-expanded-change');
    const lib = row(canvasElement, 'lib');
    await userEvent.click(lib.querySelector('.ax-tree-chevron')!);
    await expect(lib).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(lib.querySelector('.astryx-tree-list-item')!);
    await expect(lib).toHaveAttribute('aria-expanded', 'false');
    // A disabled row takes no pointer input (pointer-events: none): click it directly.
    row(canvasElement, 'archive').querySelector<HTMLElement>('.astryx-tree-list-item')!.click();
    await expect(row(canvasElement, 'archive')).toHaveAttribute('aria-expanded', 'false');
    await expect(changes.map((event) => event.detail.id)).toEqual(['lib', 'lib']);
  },
};

/** Link rows (`href`): the whole row follows its link; Enter clicks it. */
export const LinkRows: Story = {
  args: {
    header: undefined,
    'aria-label': 'Documentation',
    items: [
      {id: 'overview', label: 'Overview', href: '#overview'},
      {id: 'components', label: 'Components', isExpanded: true, children: [
        {id: 'buttons', label: 'Button', href: '#button', description: 'Actions'},
        {id: 'trees', label: 'Tree list', href: '#tree-list', description: 'Hierarchies'},
      ]},
      {id: 'changelog', label: 'Changelog', href: '#changelog'},
    ],
  },
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-tree-list');
    const link = canvas.getByRole('link', {name: 'Tree list'});
    // Stay on the page: the Vitest runner renders outside the preview's navigation guard.
    for (const a of canvasElement.querySelectorAll('a[href]')) a.addEventListener('click', (event) => event.preventDefault());
    const followed: Event[] = [];
    link.addEventListener('click', (event) => followed.push(event));
    await userEvent.click(row(canvasElement, 'trees').querySelector('.astryx-tree-list-item')!);
    await expect(followed).toHaveLength(1);
    row(canvasElement, 'trees').focus();
    await userEvent.keyboard('{Enter}');
    await expect(followed).toHaveLength(2);
  },
};

/** `density="compact"`. */
export const Compact: Story = {args: {items: nested, header: 'Compact tree', density: 'compact'}};

/** `density="spacious"`. */
export const Spacious: Story = {args: {items: nested, header: 'Spacious tree', density: 'spacious'}};

/** `variant="noGuides"`: indentation alone, no connector lines. */
export const NoGuides: Story = {args: {items: nested, header: 'Without guides', variant: 'noGuides'}};

/** Without a header the tree is named by `aria-label`. */
export const AriaLabel: Story = {
  args: {items: nested, header: undefined, 'aria-label': 'Outline'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('tree', {name: 'Outline'})).toBeVisible();
  },
};

/** `animatedLayout`: child groups glide open and closed (immediate with reduced motion). */
export const Animated: Story = {
  args: {animatedLayout: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tree-list');
    const src = row(canvasElement, 'src');
    await userEvent.click(src.querySelector('.ax-tree-chevron')!);
    await expect(src).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(src.querySelector(':scope > [role="group"]')).toHaveAttribute('hidden', 'until-found'));
  },
};

/** Right to left: the arrows swap (← expands and moves in, → collapses and moves out). */
export const RightToLeft: Story = {
  args: {items: nested, header: 'עץ', dir: 'rtl'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-tree-list');
    row(canvasElement, 'n-2').focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(row(canvasElement, 'n-2')).toHaveAttribute('aria-expanded', 'false');
    await userEvent.keyboard('{ArrowLeft}');
    await expect(row(canvasElement, 'n-2')).toHaveAttribute('aria-expanded', 'true');
  },
};
