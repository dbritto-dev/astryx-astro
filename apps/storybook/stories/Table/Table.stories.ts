import Table from 'astryx-astro/components/Table/Table.astro';
import Demo from 'astryx-astro/components/Table/Table.demo.astro';
import demoSource from 'astryx-astro/components/Table/Table.demo.astro?raw';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import TableDataHeavy from './TableDataHeavy.astro';
import heavySource from './TableDataHeavy.astro?raw';

const people = [
  {id: 'p1', name: 'Alice Chen', role: 'Staff Engineer', team: 'Platform', location: 'Seattle'},
  {id: 'p2', name: 'Bob Smith', role: 'Product Designer', team: 'Design', location: 'Austin'},
  {id: 'p3', name: 'Carol Wu', role: 'Product Manager', team: 'Growth', location: 'New York'},
  {id: 'p4', name: 'Daniel Okafor', role: 'Site Reliability Engineer', team: 'Platform', location: 'Lagos'},
  {id: 'p5', name: 'Elena Petrova', role: 'Data Scientist', team: 'Analytics', location: 'Berlin'},
];
// Plain data columns (no functions) can be story args; formatters and plugins need a wrapper.
const columns = [
  {key: 'name', header: 'Name'},
  {key: 'role', header: 'Role'},
  {key: 'team', header: 'Team'},
  {key: 'location', header: 'Location'},
];

const meta = {
  title: 'Table & List/Table',
  component: Table,
  ...astryx('Table'),
  args: {'aria-label': 'People', data: people, columns, idKey: 'id'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Table.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

export const Basic: Story = {};

export const Compact: Story = {args: {density: 'compact'}};

export const Spacious: Story = {args: {density: 'spacious'}};

export const GridDividers: Story = {args: {dividers: 'grid'}};

export const StripedWithHover: Story = {args: {isStriped: true, hasHover: true}};

export const Empty: Story = {args: {data: []}};

/** Columns from the first row's keys when `columns` is omitted. */
export const InferredColumns: Story = {args: {columns: undefined}};

/**
 * 200 rows with sorting, selection (Refunded orders cannot be selected), sticky columns and
 * client-side paging, built in a story wrapper.
 */
export const DataHeavy = composed(TableDataHeavy, {
  play: async ({canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-table');
    const table = within(canvasElement.querySelector('table')!);
    const firstOrder = () => canvasElement.querySelector('tbody tr td:nth-child(2)')?.textContent?.trim();

    await step('Ten rows per page; paging shows the next ten', async () => {
      await expect(canvasElement.querySelectorAll('tbody tr:not([hidden])').length).toBe(10);
      await expect(firstOrder()).toBe('ORD-0001');
    });

    await step('Sorting by Total descending reorders the rows on the client', async () => {
      const total = table.getByRole('columnheader', {name: /Total/});
      const sortButton = within(total).getByRole('button');
      await userEvent.click(sortButton);
      await waitFor(() => expect(total).toHaveAttribute('aria-sort', 'ascending'));
      await userEvent.click(sortButton);
      await waitFor(() => expect(total).toHaveAttribute('aria-sort', 'descending'));
      await expect(firstOrder()).not.toBe('ORD-0001');
    });

    await step('Selecting a row reports it and updates the toolbar', async () => {
      const changes = recordEvents<{selectedKeys?: unknown}>(canvasElement, 'astryx-selection-change');
      // Refunded rows keep a focusable, aria-disabled checkbox.
      const checkbox = [...canvasElement.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')].find((input) => input.getAttribute('aria-disabled') !== 'true')!;
      await userEvent.click(checkbox);
      await waitFor(() => expect(checkbox.closest('tr')).toHaveAttribute('aria-selected', 'true'));
      await expect(changes.at(-1)?.detail).toMatchObject({selectedCount: 1, hasSelection: true});
    });
  },
}, {controls: ['density', 'isStriped'], source: heavySource});
