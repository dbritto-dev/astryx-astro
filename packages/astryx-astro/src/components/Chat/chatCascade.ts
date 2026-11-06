/**
 * Chat's context-free cascades (lib/cascade.ts) — the stand-ins for Astryx ChatListContext
 * (density) and ChatMessageContext (sender + density), both layer-scoped.
 *
 *   'chat-density'  ChatMessageList stamps its density onto enrolled descendants: every
 *                   ChatMessage without an explicit `density`, and the bubbles / bubble rows /
 *                   metadata of such a message (the message leaves their marker in place).
 *   'chat-message'  ChatMessage stamps its sender onto its bubbles, their name / metadata rows
 *                   and ChatMessageMetadata; with an explicit `density` it also consumes their
 *                   'chat-density' marker with that value (nearest provider wins).
 *
 * Consumers always render their effective default (`assistant`, `balanced`) so theme rules
 * match without a provider. Theme targets carry `data-sender` / `data-density`; private rows
 * carry `data-ax-sender` / `data-ax-density` — each applier writes whichever the element has.
 */
import type {ChatDensity, ChatMessageSender} from './types';

export const CHAT_DENSITY_KEY = 'chat-density';
export const CHAT_MESSAGE_KEY = 'chat-message';

type Attrs = Record<string, string>;

export function densityApplier(density: ChatDensity) {
  return (a: Attrs) => {
    if ('data-density' in a) a['data-density'] = density;
    if ('data-ax-density' in a) a['data-ax-density'] = density;
  };
}

export function senderApplier(sender: ChatMessageSender) {
  return (a: Attrs) => {
    if ('data-sender' in a) a['data-sender'] = sender;
    if ('data-ax-sender' in a) a['data-ax-sender'] = sender;
  };
}
