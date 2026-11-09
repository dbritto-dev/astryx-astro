import ChatLayout from 'astryx-astro/components/Chat/ChatLayout.astro';
import Demo from 'astryx-astro/components/Chat/Chat.demo.astro';
import demoSource from 'astryx-astro/components/Chat/Chat.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ChatBubbles from './ChatBubbles.astro';
import bubblesSource from './ChatBubbles.astro?raw';
import ChatComposerStory from './ChatComposerStory.astro';
import composerSource from './ChatComposerStory.astro?raw';
import ChatConversation from './ChatConversation.astro';
import conversationSource from './ChatConversation.astro?raw';
import ChatDensities from './ChatDensities.astro';
import densitiesSource from './ChatDensities.astro?raw';
import ChatEmpty from './ChatEmpty.astro';
import emptySource from './ChatEmpty.astro?raw';
import ChatInputs from './ChatInputs.astro';
import inputsSource from './ChatInputs.astro?raw';
import ChatLongConversation from './ChatLongConversation.astro';
import longSource from './ChatLongConversation.astro?raw';
import ChatMetadata from './ChatMetadata.astro';
import metadataSource from './ChatMetadata.astro?raw';

const meta = {
  title: 'Chat/Chat',
  component: ChatLayout,
  ...astryx('Chat'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Chat.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

interface ComposerElement extends HTMLElement {
  value: string;
  canSend: boolean;
  status: {type: 'error' | 'warning'; message?: string} | null;
}
interface LayoutElement extends HTMLElement {
  isLocked: boolean;
  isScrolledUp: boolean;
  hasNewMessages: boolean;
}

const composerOptions = {
  controls: ['value', 'placeholder', 'isDisabled', 'isStopShown', 'density', 'elevation', 'status', 'statusPosition', 'drawer', 'hasSmallSendButton', 'hasCustomInput'],
  source: composerSource,
};

/**
 * A whole chat: the log of messages and the docked composer. Typing enables Send; Enter
 * dispatches `astryx-submit` {value, tokens} and clears the draft; `@` opens the people menu
 * (arrow keys, Enter picks a mention token).
 */
export const Conversation = composed(
  ChatConversation,
  {
    play: async ({canvas, canvasElement, step}) => {
      const composer = await upgraded<ComposerElement>(canvasElement, 'ax-chat-composer');
      await upgraded(canvasElement, 'ax-chat-composer-input');
      const log = canvas.getByRole('log');
      const editor = canvas.getByRole('combobox', {name: 'Message input'});
      const send = canvas.getByRole('button', {name: 'Send'});
      const submits = recordEvents<{value: string; tokens: {value: string}[]}>(canvasElement, 'astryx-submit');
      await expect(log).toHaveAttribute('aria-live', 'polite');
      await expect(canvas.getByRole('article', {name: 'Navi'})).toBeVisible();
      await expect(canvas.getByRole('article', {name: 'Message from user'})).toBeVisible();
      await expect(send).toBeDisabled();

      await step('Typing enables Send; Enter submits the trimmed draft and clears it', async () => {
        await userEvent.click(editor);
        await userEvent.keyboard('Ship the overlay fix ');
        await waitFor(() => expect(composer.value).toBe('Ship the overlay fix '));
        await expect(send).toBeEnabled();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(submits).toHaveLength(1));
        await expect(submits[0].detail.value).toBe('Ship the overlay fix');
        await waitFor(() => expect(composer.value).toBe(''));
        await expect(send).toBeDisabled();
      });

      await step('@ opens the people menu; Enter inserts a mention token', async () => {
        await userEvent.keyboard('Ask @gr');
        await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'true'));
        const menu = document.getElementById(editor.getAttribute('aria-controls')!)!;
        await expect(menu).toHaveAccessibleName('People');
        await waitFor(() => expect(menu.querySelectorAll('[role="option"]')).toHaveLength(1));
        await expect(menu.querySelector('[role="option"]')).toHaveTextContent('Grace Hopper');
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'false'));
        // The space after an inserted token is a no-break space (the component's own test expects it).
        await waitFor(() => expect(composer.value).toBe('Ask @grace\u00a0'));
        await expect(editor.querySelector('[data-astryx-token] .astryx-badge')).toHaveTextContent('@Grace Hopper');
      });

      await step('Escape closes the menu; Enter sends the tokens with the value', async () => {
        await userEvent.keyboard('about @');
        await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'true'));
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(editor).toHaveAttribute('aria-expanded', 'false'));
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(submits).toHaveLength(2));
        await expect(submits[1].detail.value).toBe('Ask @grace\u00a0about @');
        await expect(submits[1].detail.tokens.map((token) => token.value)).toEqual(['@grace']);
      });
    },
  },
  {controls: ['density'], source: conversationSource},
);

/** The conversation in a compact layout. */
export const CompactConversation = composed(ChatConversation, {args: {density: 'compact'}}, {controls: ['density'], source: conversationSource});

/** The same exchange in a compact, balanced and spacious list; grouped bubbles tighten their corners. */
export const Densities = composed(ChatDensities, {}, {source: densitiesSource});

/** Filled and ghost bubbles, full width, a spacious message in a balanced list, system senders and notices. */
export const Bubbles = composed(
  ChatBubbles,
  {
    play: async ({canvas, canvasElement}) => {
      await expect(canvas.getAllByRole('article')).toHaveLength(6);
      await expect(canvas.getByText('Navi')).toBeVisible();
      const variants = [...canvasElement.querySelectorAll('.astryx-chat-message-bubble')].map((bubble) => bubble.getAttribute('data-variant'));
      await expect(variants).toContain('ghost');
      await expect(canvasElement.querySelector('.astryx-chat-system-message[data-variant="divider"]')).toHaveTextContent('March 15, 2026');
    },
  },
  {source: bubblesSource},
);

/** Every delivery status (icon, label and "Message {status}" name) and action buttons in a metadata footer. */
export const Metadata = composed(
  ChatMetadata,
  {
    play: async ({canvasElement}) => {
      const names = [...canvasElement.querySelectorAll('.astryx-chat-message-metadata [aria-label^="Message "]')].map((status) => status.getAttribute('aria-label'));
      await expect(names).toEqual(['Message sending', 'Message sent', 'Message delivered', 'Message read', 'Message failed']);
    },
  },
  {source: metadataSource},
);

/** A long conversation starts at the bottom; scrolling up shows "Scroll to bottom", and a new message expands it to "New messages". */
export const ScrollToBottom = composed(
  ChatLongConversation,
  {
    play: async ({canvasElement, step}) => {
      const layout = await upgraded<LayoutElement>(canvasElement, 'ax-chat-layout');
      const pill = layout.querySelector<HTMLElement>('.astryx-chat-layout-scroll-button')!;
      const button = pill.querySelector<HTMLElement>('.astryx-button')!;
      const distance = () => layout.scrollHeight - layout.scrollTop - layout.clientHeight;
      await waitFor(() => expect(distance()).toBeLessThan(2));
      await expect(pill.inert).toBe(true);

      await step('Scrolling up unlocks following and shows the button', async () => {
        layout.scrollTop -= 240;
        await waitFor(() => expect(layout.isLocked).toBe(false));
        await waitFor(() => expect(pill.inert).toBe(false));
        // The pill fades in, so read the name from the attribute rather than the computed name.
        await expect(button).toHaveAttribute('aria-label', 'Scroll to bottom');
      });

      await step('A new message while scrolled up does not move the reader and says "New messages"', async () => {
        const before = distance();
        const list = canvasElement.querySelector<HTMLElement & {contentElement: HTMLElement}>('ax-chat-message-list, [role="log"]')!;
        const template = canvasElement.querySelector<HTMLTemplateElement>('template[data-chat-new-message]')!;
        (list.contentElement ?? list.querySelector('[data-ax-chat-list-content]')!).append(template.content.cloneNode(true));
        await waitFor(() => expect(button).toHaveAttribute('aria-label', 'New messages'));
        await expect(distance()).toBeGreaterThan(before);
      });

      await step('The button scrolls to the bottom, re-locks and hides', async () => {
        await userEvent.click(button);
        await waitFor(() => expect(distance()).toBeLessThan(2));
        await waitFor(() => expect(layout.isLocked).toBe(true));
        await waitFor(() => expect(pill.inert).toBe(true));
      });
    },
  },
  {source: longSource},
);

/** Empty states: a layout with nothing in its default slot, and an empty message list. */
export const Empty = composed(
  ChatEmpty,
  {
    play: async ({canvas}) => {
      await expect(canvas.getByText('No messages yet. Say hello!')).toBeVisible();
      await expect(canvas.getByText('This list is empty')).toBeVisible();
    },
  },
  {source: emptySource},
);

/** The default composer: raised (low elevation), Send disabled until there is a draft. */
export const Composer = composed(
  ChatComposerStory,
  {
    args: {placeholder: 'Ask anything…'},
    play: async ({canvas, canvasElement}) => {
      const composer = await upgraded<ComposerElement>(canvasElement, 'ax-chat-composer');
      await upgraded(canvasElement, 'ax-chat-composer-input');
      const editor = canvas.getByRole('textbox', {name: 'Message input'});
      const send = canvas.getByRole('button', {name: 'Send'});
      const submits = recordEvents<{value: string}>(canvasElement, 'astryx-submit');
      await expect(editor).toHaveAttribute('aria-multiline', 'true');
      await expect(send).toBeDisabled();
      await userEvent.click(editor);
      await userEvent.keyboard('Via the button');
      await waitFor(() => expect(send).toBeEnabled());
      await expect(composer.canSend).toBe(true);
      await userEvent.click(send);
      await waitFor(() => expect(submits.map((event) => event.detail.value)).toEqual(['Via the button']));
      await waitFor(() => expect(composer.value).toBe(''));
    },
  },
  composerOptions,
);

/** `elevation="none"`: flat with a border. */
export const ComposerFlat = composed(ChatComposerStory, {args: {placeholder: 'Flat composer', elevation: 'none'}}, composerOptions);

/** Compact density with a small send button. */
export const ComposerCompact = composed(ChatComposerStory, {args: {placeholder: 'Compact', density: 'compact', hasSmallSendButton: true}}, composerOptions);

/** Spacious density. */
export const ComposerSpacious = composed(ChatComposerStory, {args: {placeholder: 'Spacious', density: 'spacious'}}, composerOptions);

/** An error status bar below the body; a draft is ready to send again. */
export const ComposerError = composed(
  ChatComposerStory,
  {
    args: {value: 'Draft that can be sent', status: {type: 'error', message: 'Message failed to send. Try again.'}},
    play: async ({canvas}) => {
      await expect(canvas.getByText('Message failed to send. Try again.')).toBeVisible();
      await expect(canvas.getByRole('button', {name: 'Send'})).toBeEnabled();
    },
  },
  composerOptions,
);

/** A warning status bar above the body (`statusPosition="top"`); a status set later is announced. */
export const ComposerWarningTop = composed(
  ChatComposerStory,
  {
    args: {placeholder: 'Warning on top', status: {type: 'warning', message: 'You are near the context limit.'}, statusPosition: 'top'},
    play: async ({canvas, canvasElement}) => {
      const composer = await upgraded<ComposerElement>(canvasElement, 'ax-chat-composer');
      await expect(canvas.getByText('You are near the context limit.')).toBeVisible();
      composer.status = {type: 'error', message: 'Could not reach the server.'};
      await waitFor(() => expect(canvas.getByText('Could not reach the server.')).toBeVisible());
      await waitFor(() => expect(document.querySelector('[data-astryx-live-region="assertive"]')).toHaveTextContent('Could not reach the server.'));
      composer.status = null;
      await waitFor(() => expect(canvas.queryByText('Could not reach the server.')).toBeNull());
      // Leave the story showing the warning it is named after.
      composer.status = {type: 'warning', message: 'You are near the context limit.'};
      await waitFor(() => expect(canvas.getByText('You are near the context limit.')).toBeVisible());
    },
  },
  composerOptions,
);

/** While a reply streams: the input is disabled (still focusable) and Stop replaces Send; Stop dispatches `astryx-stop`. */
export const ComposerStreaming = composed(
  ChatComposerStory,
  {
    args: {placeholder: 'Streaming…', isDisabled: true, isStopShown: true},
    play: async ({canvas, canvasElement}) => {
      await upgraded(canvasElement, 'ax-chat-composer');
      await upgraded(canvasElement, 'ax-chat-composer-input');
      const stops = recordEvents(canvasElement, 'astryx-stop');
      const editor = canvas.getByRole('textbox', {name: 'Message input'});
      await expect(editor).toHaveAttribute('aria-disabled', 'true');
      await expect(editor).toHaveAttribute('contenteditable', 'false');
      const stop = canvas.getByRole('button', {name: 'Stop'});
      await expect(stop).toBeEnabled();
      await userEvent.click(stop);
      await waitFor(() => expect(stops).toHaveLength(1));
    },
  },
  composerOptions,
);

/** An attachments drawer: its toggle row collapses and expands the tray (`astryx-collapsed-change`). */
export const ComposerDrawer = composed(
  ChatComposerStory,
  {
    args: {placeholder: 'Message with attachments', drawer: 'open'},
    play: async ({canvas, canvasElement, step}) => {
      await upgraded(canvasElement, 'ax-chat-composer-drawer');
      const changes = recordEvents<{isCollapsed: boolean}>(canvasElement, 'astryx-collapsed-change');
      const toggle = canvas.getByRole('button', {name: 'Collapse Attachments'});
      const content = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await step('A click collapses the tray (inert)', async () => {
        await userEvent.click(toggle);
        await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'false'));
        await expect(toggle).toHaveAccessibleName('Expand Attachments');
        await expect(content.inert).toBe(true);
      });
      await step('Enter expands it again', async () => {
        toggle.focus();
        await userEvent.keyboard('{Enter}');
        await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
        await expect(content.inert).toBe(false);
      });
      await expect(changes.map((event) => event.detail.isCollapsed)).toEqual([true, false]);
    },
  },
  composerOptions,
);

/** The drawer starting collapsed: a summary with the count. */
export const ComposerDrawerCollapsed = composed(
  ChatComposerStory,
  {
    args: {placeholder: 'Message with attachments', drawer: 'collapsed'},
    play: async ({canvas}) => {
      await expect(canvas.getByRole('button', {name: 'Expand Attachments'})).toHaveAttribute('aria-expanded', 'false');
    },
  },
  composerOptions,
);

/** A plain textarea in the `input` slot replaces the rich input. */
export const ComposerCustomInput = composed(
  ChatComposerStory,
  {
    args: {hasCustomInput: true},
    play: async ({canvas}) => {
      await expect(canvas.getByRole('textbox', {name: 'Plain message'})).toBeVisible();
    },
  },
  composerOptions,
);

/**
 * The composer's parts on their own: a standalone input (Enter dispatches `astryx-submit`
 * from the input), mention and command tokens, tokenized text and the send button states.
 */
export const Parts = composed(
  ChatInputs,
  {
    play: async ({canvas, canvasElement}) => {
      await upgraded(canvasElement, 'ax-chat-composer-input');
      const submits = recordEvents<{value: string}>(canvasElement, 'astryx-submit');
      const editor = canvas.getByRole('combobox', {name: 'Standalone message'});
      await userEvent.click(editor);
      await userEvent.keyboard('standalone{Enter}');
      await waitFor(() => expect(submits.map((event) => event.detail.value)).toEqual(['standalone']));
      const sends = canvas.getAllByRole('button', {name: 'Send'});
      await expect(sends.map((button) => (button as HTMLButtonElement).disabled)).toEqual([false, true, false]);
      await expect(canvas.getByRole('button', {name: 'Stop'})).toBeEnabled();
      await expect(isShowing(canvasElement.querySelector('[role="listbox"]'))).toBe(false);
    },
  },
  {source: inputsSource},
);
