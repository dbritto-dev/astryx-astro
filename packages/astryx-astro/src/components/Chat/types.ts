// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Types ported from @astryxdesign/core 0.7.9 Chat/ChatContext.tsx,
// ChatComposerInput.tsx, ChatComposer.tsx, ChatToolCalls.tsx and ChatMessageMetadata.tsx.
// React nodes become `unknown` (markup an .astro template renders on the server).
import type {SearchableItem} from '../../lib/searchableItem';
import type {SearchSource} from '../Typeahead/createStaticSource';
import type {BadgeVariant} from '../Badge/Badge.astro';
import type {AstroIconComponent, ExtendedIconName} from '../Icon/iconRegistry';

export type ChatMessageSender = 'user' | 'assistant' | 'system';
export type ChatDensity = 'compact' | 'balanced' | 'spacious';

/** Badge config — the common case: structured, themeable, autocomplete-friendly. */
export interface ChatComposerTokenBadge {
  /** Serialized value: what this token becomes in the submitted string. */
  value: string;
  label?: string | number;
  variant?: BadgeVariant;
  icon?: ExtendedIconName | AstroIconComponent;
}

/** Custom render — tooltips, hover cards, rich content (server: Astro markup). */
export interface ChatComposerTokenCustom {
  value: string;
  render: () => unknown;
}

export type ChatComposerToken = ChatComposerTokenBadge | ChatComposerTokenCustom;

export type ChatComposerTriggerItem = SearchableItem;

/**
 * A trigger menu definition (Astryx ChatComposerTrigger). Server side, a static source
 * (`createStaticSource`) is rendered into the page together with `renderItem` and each item's
 * `onSelect` result, so a static trigger needs no client code. Asynchronous sources are
 * attached in the browser (`input.triggers = [{character, searchSource, onSelect}]`) or answer
 * the `astryx-query` event (see ChatComposerInput.astro).
 */
export interface ChatComposerTrigger {
  /** Character that opens this trigger menu ('@', '/'). */
  character: string;
  /** Items: a `createStaticSource()` is server-rendered; other sources are client-side. */
  searchSource?: SearchSource;
  /** Server-side row content for each static item (Astro markup). */
  renderItem?: (item: SearchableItem) => unknown;
  /** What a static item inserts: a string (plain text) or a token (inline chip). */
  onSelect?: (item: SearchableItem) => string | ChatComposerToken;
  /** Accepted for parity; Astryx 0.7.9 never calls it. */
  deserialize?: (value: string) => ChatComposerToken | null;
  /** Text when the query matched nothing; `''` renders nothing. @default 'No results' */
  emptySearchText?: string;
  /** Text shown while an asynchronous search runs. @default translated "Searching…" */
  loadingText?: string;
  /** Accessible name of the menu. @default translated "Suggestions" */
  menuLabel?: string;
  /** The query runs past spaces (to a line break or ~64 characters). @default false */
  hasMultiWordQuery?: boolean;
}

export interface ChatComposerStatus {
  type: 'error' | 'warning';
  message?: string;
}

export type ChatMessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export type ChatToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

export interface ChatToolCallItem {
  /** Tool/function name. */
  name: string;
  /** @default 'complete' */
  status?: ChatToolCallStatus;
  /** The target of the action ("Button.tsx", "yarn test"). */
  target?: string;
  /** Shown when complete ("1.2s"). */
  duration?: string;
  /** Sandbox/node name, shown as a pill badge. */
  node?: string;
  /** Rendered in green ("+12"). */
  additions?: number;
  /** Rendered in red ("-3"). */
  deletions?: number;
  /** Extra info after the label (text or Astro markup). */
  stats?: unknown;
  /** Spoken for an error status and shown as the status icon's title. */
  errorMessage?: string;
  /** Unique key (accepted for parity). */
  key?: string;
  /** Arbitrary caller data. */
  data?: unknown;
  /** Inline detail shown when the row is expanded (text or Astro markup). */
  resultDetail?: unknown;
}

export const isCustomToken = (token: ChatComposerToken): token is ChatComposerTokenCustom =>
  'render' in token && typeof (token as ChatComposerTokenCustom).render === 'function';
