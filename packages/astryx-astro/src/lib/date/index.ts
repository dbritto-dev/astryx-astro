/**
 * Pure date / time / number logic ported from @astryxdesign/core 0.7.9 (MIT, Copyright (c)
 * Meta Platforms, Inc. and affiliates), with the date arithmetic on Temporal
 * (lib/temporal.ts). Framework-free: usable in Astro frontmatter and in custom elements.
 * See README.md for the API and sources.
 */
export type {Locale} from './locale';
export * from './dateTypes';
export * from './plainDate';
export * from './instant';
export * from './calendarSystem';
export * from './calendarDateParser';
export * from './dateParser';
export * from './timeParser';
export * from './timeFormat';
export * from './unicodeDigits';
export * from './standaloneMonthCapitals.generated';
export * from './formatInstant';
export * from './formatRelativeTime';
export * from './tooltipEntries';
export * from './timestamp';
