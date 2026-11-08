/**
 * Global keyboard shortcuts — the minimal semantics of @astryxdesign/core hooks/useHotkeys.ts
 * (key aliases, `mod` = ⌘ on Apple platforms and Ctrl elsewhere, exact Ctrl/Meta/Alt match,
 * Shift required only when named, skipped while typing in a field unless `allowInInputs`,
 * IME-safe, `defaultPrevented` keys ignored, the first match wins and is `preventDefault()`ed).
 *
 * One shared `window` keydown listener, installed with the first registration (opt-in: only
 * components given a hotkey register — CommandPalette's `hotkey`). The registry and the
 * listener are page-wide (`globalSingleton`): a second copy of this module registers into the
 * same set and adds no second listener.
 *
 *   const unregister = registerHotkey({keys: 'mod+k', onPress: () => palette.show()});
 */
import {isImeKeyEvent} from './runtime/dom';
import {isApplePlatform} from './runtime/platform';
import {globalSingleton} from './runtime/global';

export interface Hotkey {
  /** Combination such as `mod+k`, `shift+?`, `esc`. */
  keys: string;
  onPress: (event: KeyboardEvent) => void;
  /** Also fire while focus is in an input, textarea, select or contenteditable. @default false */
  allowInInputs?: boolean;
  /** Read on every keydown. */
  isDisabled?: () => boolean;
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  plus: '+',
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Whether `event` is the combination `keys` (exported for tests and custom callers). */
export function matchesHotkey(keys: string, event: KeyboardEvent, isApple: boolean): boolean {
  const parts = keys.toLowerCase().split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const wantsMod = mods.has('mod');
  const wantsCtrl = mods.has('ctrl') || (wantsMod && !isApple);
  const wantsMeta = mods.has('meta') || (wantsMod && isApple);
  if (event.ctrlKey !== wantsCtrl) return false;
  if (event.metaKey !== wantsMeta) return false;
  if (event.altKey !== mods.has('alt')) return false;
  if (mods.has('shift') && !event.shiftKey) return false;
  return event.key.toLowerCase() === (KEY_ALIASES[key] ?? key);
}

interface HotkeyState {
  registry: Set<Hotkey>;
  /** Whether the window listener is installed. */
  installed: boolean;
}
const state: HotkeyState = globalSingleton('hotkeys', () => ({registry: new Set(), installed: false}));
const {registry} = state;

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || isImeKeyEvent(event)) return;
  const isTyping = isTypingTarget(event.target);
  const isApple = isApplePlatform();
  for (const hotkey of registry) {
    if (hotkey.isDisabled?.()) continue;
    if (isTyping && !hotkey.allowInInputs) continue;
    if (matchesHotkey(hotkey.keys, event, isApple)) {
      event.preventDefault();
      hotkey.onPress(event);
      return;
    }
  }
}

export function registerHotkey(hotkey: Hotkey): () => void {
  registry.add(hotkey);
  if (typeof window !== 'undefined' && !state.installed) {
    state.installed = true;
    window.addEventListener('keydown', onKeyDown);
  }
  return () => { registry.delete(hotkey); };
}
