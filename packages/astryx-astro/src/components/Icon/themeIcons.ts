/**
 * Icon sets of the shipped Astryx themes — port of
 * `@astryxdesign/theme-{butter,chocolate,gothic,matcha,neutral,stone,y2k}/src/icons.tsx`.
 *
 * All seven themes map the 29 semantic names to the same lucide-react components, rendered
 * with `size="1em"` and `aria-hidden`. This reproduces them from `lucide-static` (pinned to
 * 1.70.0, the lucide-react version the theme packages resolve to in this workspace; the
 * geometry was checked element-for-element against lucide-react 1.70.0). lucide-react
 * names that are aliases resolve to the same files here (CheckCircle → circle-check-big,
 * AlertTriangle → triangle-exclamation-point, MoreHorizontal → ellipsis, Filter → funnel,
 * Columns → columns-2 …).
 *
 * Server-only: the strings are inlined into the rendered HTML, nothing ships to the client.
 */
import {
  X, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, CheckCircle,
  XCircle, AlertTriangle, Info, Calendar, Clock, ExternalLink, Menu, MoreHorizontal, Search,
  Upload, ArrowUp, ArrowDown, ArrowUpDown, Filter, EyeOff, Columns, Copy, CheckCheck, Wrench,
  Square, Mic,
} from 'lucide-static';
import type {IconName} from './iconRegistry';

/**
 * lucide-static string → what lucide-react renders for `<X size="1em" aria-hidden />`:
 * whitespace collapsed, 1em box, aria-hidden.
 */
function lucide(svg: string): string {
  return svg
    .trim()
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s*>\s*/g, '>')
    .replace(/\s*\/>/g, '/>')
    .replace(/>\s+</g, '><')
    .replace('width="24"', 'width="1em"')
    .replace('height="24"', 'height="1em"')
    .replace(/^<svg([^>]*)>/, '<svg$1 aria-hidden="true">');
}

/** The Lucide map every shipped theme uses (`<name>IconRegistry` in each theme package). */
export const lucideIcons: Readonly<Record<IconName, string>> = Object.freeze({
  close: lucide(X),
  chevronDown: lucide(ChevronDown),
  chevronLeft: lucide(ChevronLeft),
  chevronRight: lucide(ChevronRight),
  chevronsLeft: lucide(ChevronsLeft),
  chevronsRight: lucide(ChevronsRight),
  check: lucide(Check),
  success: lucide(CheckCircle),
  error: lucide(XCircle),
  warning: lucide(AlertTriangle),
  info: lucide(Info),
  calendar: lucide(Calendar),
  clock: lucide(Clock),
  externalLink: lucide(ExternalLink),
  menu: lucide(Menu),
  moreHorizontal: lucide(MoreHorizontal),
  search: lucide(Search),
  upload: lucide(Upload),
  arrowUp: lucide(ArrowUp),
  arrowDown: lucide(ArrowDown),
  arrowsUpDown: lucide(ArrowUpDown),
  funnel: lucide(Filter),
  eyeSlash: lucide(EyeOff),
  viewColumns: lucide(Columns),
  copy: lucide(Copy),
  checkDouble: lucide(CheckCheck),
  wrench: lucide(Wrench),
  stop: lucide(Square),
  microphone: lucide(Mic),
});

/** Shipped theme names (the `data-astryx-theme` values of `src/styles/themes/*.css`). */
export const shippedThemeNames = ['neutral', 'butter', 'chocolate', 'gothic', 'matcha', 'stone', 'y2k'] as const;
