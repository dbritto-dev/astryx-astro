// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Port of @astryxdesign/core 0.7.9 src/hooks/useBusyAnnouncement.ts on the runtime
// announcer (elements/runtime/announce.ts routes into an enclosing open modal by `from`).

import {announce, type Withdraw} from '../runtime/announce';

/**
 * Announce each busy episode once, politely, a frame after it starts; rerenders while busy
 * never repeat it, the end re-arms it, and `settle()` (results arrived) withdraws a message
 * not yet exposed, so a search that settles on its first frame announces nothing.
 */
export function createBusyAnnouncement(from: () => Element | null) {
  let hasAnnounced = false;
  let frame = 0;
  let withdraw: Withdraw | null = null;
  return {
    set(isBusy: boolean, message: string): void {
      if (!isBusy) {
        hasAnnounced = false;
        withdraw = null;
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      if (hasAnnounced || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        hasAnnounced = true;
        if (message) withdraw = announce(message, {politeness: 'polite', from: from()});
      });
    },
    settle(): void {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        hasAnnounced = true;
      }
      withdraw?.();
      withdraw = null;
    },
    destroy(): void {
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
