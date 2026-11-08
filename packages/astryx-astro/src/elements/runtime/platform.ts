/**
 * Platform checks no feature detection can answer (docs/platform.md, "Platform checks that
 * are not features"). Every user-agent or platform read of the client code lives here, each
 * with the question it answers; prefer feature detection for anything a platform API can
 * tell. SSR-safe: on the server (no `navigator`) every check is false.
 *
 * Ports @astryxdesign/core utils/isApplePlatform.ts (also behind utils/primaryClick.ts), the
 * `isSafari` test in CodeBlock/CodeBlock.tsx and the `isIOS` test in Chat/useChatDictation.ts.
 */

/**
 * macOS or iOS: shortcuts use ⌘ where other platforms use Ctrl (Kbd's `mod`, hotkeys), and a
 * Ctrl+click is a secondary click (Slider). No API reports a platform's modifier conventions.
 * Prefers User-Agent Client Hints when they name a platform (not Baseline: Chromium only),
 * else `navigator.platform`.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = 'userAgentData' in navigator ? (navigator as {userAgentData?: unknown}).userAgentData : null;
  if (uaData && typeof uaData === 'object' && 'platform' in uaData) {
    const uaPlatform = (uaData as {platform?: unknown}).platform;
    const named = typeof uaPlatform === 'string' ? uaPlatform.trim() : '';
    // '' and 'Unknown' name nothing: fall through rather than reading as "not Apple".
    if (named !== '' && named.toLowerCase() !== 'unknown') return /mac/i.test(named);
  }
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
}

/**
 * WebKit's renderer (Safari, and every browser on iOS): it supports the CSS Custom Highlight
 * API but paints `::highlight()` unreliably inside code blocks, a rendering bug no feature
 * test can see, so CodeBlock paints token spans there instead.
 */
export function isWebKitRenderer(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return ua.includes('AppleWebKit') && !ua.includes('Chrome');
}

/**
 * An iPhone, iPad or iPod user agent: ChatDictationButton plays no start / stop sounds there,
 * exactly as Astryx decides it (the device check is the behaviour; no API describes it).
 */
export function isIOSDevice(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}
