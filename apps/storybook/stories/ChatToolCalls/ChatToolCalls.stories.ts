import ChatToolCalls from 'astryx-astro/components/Chat/ChatToolCalls.astro';
import Demo from 'astryx-astro/components/Chat/ChatToolCalls.demo.astro';
import demoSource from 'astryx-astro/components/Chat/ChatToolCalls.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import ChatToolCallsStory from './ChatToolCallsStory.astro';
import storySource from './ChatToolCallsStory.astro?raw';

const meta = {
  title: 'Chat/Chat Tool Calls',
  component: ChatToolCalls,
  ...astryx('ChatToolCalls'),
  args: {calls: [{name: 'read_file', target: 'Button.tsx', duration: '1.2s'}]},
} satisfies Meta;
export default meta;

/** Every example from the docs page (ChatToolCalls.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['label', 'defaultIsExpanded', 'example'], source: storySource};
const statusText = (root: Element) => [...root.querySelectorAll('.ax-chat-tool-status')].map((status) => status.textContent?.trim());

/** One call renders inline, with no disclosure; its status is spoken as text ("Complete"). */
export const Default: Story = {
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.queryByRole('button')).toBeNull();
    await expect(statusText(canvasElement)).toEqual(['Complete']);
    await expect(canvas.getByText('read_file')).toBeVisible();
    await expect(canvas.getByText('1.2s')).toBeVisible();
  },
};

/** Pending: a subtle spinner, and no duration yet. */
export const Pending: Story = {
  args: {calls: [{name: 'search_docs', status: 'pending', target: 'CSS anchor positioning'}]},
  play: async ({canvasElement}) => {
    await expect(statusText(canvasElement)).toEqual(['Pending']);
  },
};

export const Running: Story = {
  args: {calls: [{name: 'run_tests', status: 'running', target: 'yarn test', duration: '3.1s'}]},
  play: async ({canvas, canvasElement}) => {
    await expect(statusText(canvasElement)).toEqual(['Running']);
    // The duration only shows once the call completes.
    await expect(canvas.queryByText('3.1s')).toBeNull();
  },
};

/** An error with `errorMessage`: "Error: {message}", echoed in the status icon's title. */
export const ErrorStatus: Story = {
  args: {calls: [{name: 'deploy', status: 'error', target: 'staging', errorMessage: 'Permission denied'}]},
  play: async ({canvasElement}) => {
    await expect(statusText(canvasElement)).toEqual(['Error: Permission denied']);
    await expect(canvasElement.querySelector('.ax-chat-tool-status')).toHaveAttribute('title', 'Permission denied');
  },
};

/** Node badge, additions, deletions and extra stats. */
export const WithStats: Story = {
  args: {calls: [{name: 'edit_file', target: 'Button.css', node: 'navi', additions: 12, deletions: 3, stats: '2 hunks', duration: '0.4s'}]},
  play: async ({canvas}) => {
    await expect(canvas.getByText('+12')).toBeVisible();
    await expect(canvas.getByText('-3')).toBeVisible();
    await expect(canvas.getByText('navi')).toBeVisible();
  },
};

/** A call with a `resultDetail` is a disclosure row: Enter, Space or a click shows the detail. */
export const WithResultDetail = composed(
  ChatToolCallsStory,
  {
    args: {example: 'detail'},
    play: async ({canvas, canvasElement, step}) => {
      await upgraded(canvasElement, 'ax-chat-tool-calls');
      const row = canvas.getByRole('button', {name: /bash/});
      const detail = canvas.getByText(/M src\/Button\/Button\.css/);
      await expect(row).toHaveAttribute('aria-expanded', 'false');
      await expect(row).not.toHaveAttribute('aria-controls');
      await expect(detail).not.toBeVisible();
      await step('Enter shows the detail; aria-controls names it', async () => {
        row.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
        await expect(detail).toBeVisible();
        await expect(document.getElementById(row.getAttribute('aria-controls')!)).toContainElement(detail);
      });
      await step('Space hides it, a click shows it again', async () => {
        await userEvent.keyboard(' ');
        await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'));
        await expect(detail).not.toBeVisible();
        await userEvent.click(row);
        await waitFor(() => expect(detail).toBeVisible());
      });
    },
  },
  options,
);

/**
 * Several calls: collapsed, the header shows the latest call and the count over an inert list.
 * Click, Enter and Space toggle it and report `astryx-expanded-change`; a row's own detail does not.
 */
export const Group = composed(
  ChatToolCallsStory,
  {
    play: async ({canvasElement, step}) => {
      const host = await upgraded<HTMLElement & {isExpanded: boolean}>(canvasElement, 'ax-chat-tool-calls');
      const changes = recordEvents<{isExpanded: boolean}>(canvasElement, 'astryx-expanded-change');
      const header = host.querySelector<HTMLElement>(':scope > [role="button"]')!;
      const list = document.getElementById(header.getAttribute('aria-controls')!)!;
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(header).toHaveTextContent(/Running/);
      await expect(header).toHaveTextContent(/run_tests/);
      await expect(header).toHaveTextContent(/4/);
      await expect(list.inert).toBe(true);

      await step('A click expands: the summary label and every call', async () => {
        await userEvent.click(header);
        await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'));
        await expect(header).toHaveTextContent('4 tool calls');
        await expect(list.inert).toBe(false);
        await expect(host.isExpanded).toBe(true);
      });

      await step('A row detail toggles on its own, without the group event', async () => {
        const row = list.querySelector<HTMLElement>('[data-ax-detail]')!;
        row.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'));
        await expect(changes).toHaveLength(1);
      });

      await step('Enter collapses, Space expands', async () => {
        header.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'false'));
        await expect(list.inert).toBe(true);
        await userEvent.keyboard(' ');
        await waitFor(() => expect(header).toHaveAttribute('aria-expanded', 'true'));
      });

      await expect(changes.map((event) => event.detail.isExpanded)).toEqual([true, false, true]);
    },
  },
  options,
);

/** `defaultIsExpanded` with a custom summary `label`. */
export const DefaultExpanded = composed(
  ChatToolCallsStory,
  {
    args: {defaultIsExpanded: true, label: 'Investigated the focus ring'},
    play: async ({canvasElement}) => {
      const header = canvasElement.querySelector('ax-chat-tool-calls > [role="button"]')!;
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await expect(header).toHaveTextContent('Investigated the focus ring');
    },
  },
  options,
);

/** Above the reply, inside an assistant message. */
export const InMessage = composed(ChatToolCallsStory, {args: {example: 'message'}}, options);
