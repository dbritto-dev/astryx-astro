// Copyright (c) Meta Platforms, Inc. and affiliates.
// MIT License. Ported from @astryxdesign/core 0.7.9 src/i18n/types.ts (the `Locale` type only).

/**
 * A BCP 47 locale tag such as `'en'`, `'es-ES'` or `'ar-SA'`. Astryx resolves
 * locale chains elsewhere; the date and time modules only pass it to `Intl`.
 */
export type Locale = string;
