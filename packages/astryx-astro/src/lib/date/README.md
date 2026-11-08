# lib/date

Astryx's pure date / time / digit logic and Timestamp formatting, ported from
`@astryxdesign/core` 0.7.9 (MIT) with the date arithmetic on **Temporal**. Framework-free; use
it in Astro frontmatter (SSR) and in custom elements. Entry: `index.ts`. Tests:
`node tools/tests/lib-date.test.mjs` (Node: polyfilled Temporal) and the browser half in
`tools/tests/lib-date-browser.test.mjs` (native Chrome Temporal, and the polyfill with
Chrome's Temporal removed).

## Temporal

- Temporal comes from `../temporal.ts` only: the native `globalThis.Temporal`, else
  `temporal-polyfill/full` loaded by a dynamic import (Safari, Node). Never `Date` for calendar
  math, never a global polyfill.
- Arithmetic, comparisons, day of week, days in month, ISO weeks, ISO parse/serialize, zone
  conversion ('compatible' disambiguation), calendar systems (all 16 always available),
  PlainTime checks/compare/clamp/step, instants and durations all run on Temporal.
- Text is Intl's, exactly as Astryx writes it: Intl formats the **epoch milliseconds** of a
  Temporal value with the native `Intl.DateTimeFormat`. Never pass a Temporal object to
  `Intl.DateTimeFormat` / `toLocaleString`: native V8 and the polyfill both pick another pattern
  for Temporal objects (ja-JP `{month: 'long'}` → "2026/3/21", en-GB `hour: 'numeric'` →
  "07:00"), so outputs would change and differ between engines.
- Inputs: every function that takes a `PlainDate` takes a `{year, month, day}` record or a
  `Temporal.PlainDate` (another calendar counts as its ISO day); outputs stay records. Instant
  APIs take an `ExactTime` (`Date | epoch ms | Temporal.Instant | Temporal.ZonedDateTime`);
  time APIs a `HH:MM[:SS]` string, and `toPlainTime` / `formatISOTime` a `Temporal.PlainTime`.
- `Date` stays only at Astryx's boundaries: `plainDateToDate` / `plainDateFromDate` and
  `parseValue` (Astryx returns / accepts a Date), `ExactTime` inputs, and the free-form
  fallbacks of `parseDateInput` and `parseInstant` (Temporal has no lenient parser).

## Exported API

Types (`dateTypes.ts`, `locale.ts`)
- `PlainDate {year, month, day}` (1-based month), `DateRange`, `ISODateString`, `DayOfWeek`, `DayOfWeekName`, `normalizeDayOfWeek(day)`, `Locale` (= BCP 47 string).

PlainDate (`plainDate.ts`)
- Create/convert: `plainDateCreate`, `plainDateFromISO` (`Temporal.PlainDate.from`), `plainDateToISO`, `plainDateToDate`, `plainDateFromDate`, `plainDateToday`, `plainDateToInstant(pd, timezoneID, hour?, minute?)` (epoch ms), `plainDateFromInstant(exactTime, timezoneID)`, `plainDateToTemporal(pd)` / `plainDateFromTemporal(date)` (port additions).
- Arithmetic: `plainDateAddDays`, `plainDateAddMonths` (clamps to month end), `plainDateDiffDays(a, b)` (= b − a), `getDaysInMonth`, `plainDateDayOfWeek`, `plainDateGetWeekNumber` (ISO), `plainDateSetFirstOfMonth`, `plainDateSetStartOfWeek`, `plainDateSetEndOfWeekExclusive`.
- Compare: `plainDateIsBefore/IsAfter/IsEqual/Max/Min`, `plainDateIsInRange(pd, [start, end])`, `nearestAcceptedDate(pd, options)`.
- Zones: `getTimeZoneParts(exactTime, zone)`, `getWallClock(exactTime, timeZone)` (`WallClock`).

Component values (`values.ts`, port addition)
- `DateValue` (ISO or `Temporal.PlainDate`), `TimeValue` (ISO or `PlainTime`), `DateTimeValue` (ISO, `PlainDateTime` or `ZonedDateTime`), `isoDateOf`, `isoTimeOf`, `isoDateTimeOf`: Temporal props → the ISO strings components use (strings pass through).

Instants (`instant.ts`, port addition)
- `ExactTime`, `toInstant`, `epochMillisecondsOf`, `zonedOf(exactTime, zone?)`, `hostTimeZone()`, `secondsBetween(from, to)`.
- Format: `plainDateFormat`, `plainDateFormatToParts`, `plainDateFormatStandaloneMonthYear`, `plainDateWeekdayNames`, `plainDateWeekFieldName`, `plainDateFormatDayNumber`, `formatSharedDate`, `dateTimeFormatFor`, `dateTimeFormatAtCall`, `DATE_FORMAT_*` and `SHARED_DATE_FORMAT_OPTIONS` presets.

Calendar systems (`calendarSystem.ts`)
- `CalendarSystem` (gregory, iso8601, buddhist, roc, japanese, persian, indian, hebrew, chinese, dangi, coptic, ethiopic, ethioaa, islamic-civil/-tbla/-umalqura), `CALENDAR_SYSTEMS`, `isCalendarSystem`, `isCalendarSystemAvailable`, `isGregorianCalendar`, `isGregorianAligned`.
- Months: `calendarMonthOf`, `calendarDayOfMonth`, `calendarYearMonthOf`, `calendarMonthFromYearMonth`, `calendarAddMonths`, `calendarShiftMonths`, `calendarShiftYears`, `isInCalendarMonth`, `calendarMonthLabelDay`, `calendarMonthsInYear`, `calendarMonthsBetween`, `calendarMonthOfYear`, `calendarMonthsInCalendarYear`, `calendarDateFromFields`, `calendarYearSpansEras`.
- Format: `formatCalendarDate(calendar, pd, options, locale)`, `formatCalendarDateToParts`, `formatCalendarMonthLabel`, `formatCalendarMonthName`, `formatCalendarYearLabel`, `formatCalendarInstant`, `formatCalendarInstantRange`.

Parsing typed dates
- `calendarDateParser.ts`: `getCalendarDateLexicon(locale, calendar)`, `parseCalendarDate(text, lexicon, options)` → `{kind: empty|incomplete|unreadable|nonexistent|outOfRange|value}`, `normalizeDateText`, `formatCalendarDateText`, `formatCalendarDateHint`, `calendarDisplayName` (DateInput's parser).
- `dateParser.ts`: `parseDateInput(text, locale)` → `PlainDate | null` (free-form Gregorian), `isLocaleDayFirst(locale)`.

Time (`timeParser.ts`, `timeFormat.ts`)
- `ISOTimeString`, `ParsedTime`, `createISOTimeString`, `parseISOTime`, `toPlainTime` (port addition), `formatISOTime` (also a `Temporal.PlainTime`), `formatDisplayTime12h`, `formatDisplayTime24h`, `parseTimeInput(text, includeSeconds?)`, `compareTime` (−1 / 0 / 1), `isTimeInRange`, `clampTime`, `adjustTime`.
- `HourFormat`, `resolveHourFormat(locale, hourFormat?)`, `formatLocaleTime(time, locale, hourFormat, includeSeconds?)`, `parseLocaleTime(text, locale, includeSeconds?)`.

Digits (`unicodeDigits.ts`) — `toAsciiDigits(text)`, `digitValue(char)`, `INVISIBLE_CHARS` (NumberInput, date/time parsing).

Timestamp (`formatInstant.ts`, `formatRelativeTime.ts`, `tooltipEntries.ts`, `timestamp.ts`)
- `formatInstant(exactTime, format, locale, {timeZone, isTimezoneShown, timeZoneNameStyle, calendar})`, `InstantFormat`, `FormatInstantOptions`.
- `formatRelativeTime(exactTime, now, locale, 'long' | 'narrow')` (distance: `Temporal.Instant#until`).
- `formatTooltipLines(exactTime, entries, locale, calendar?)` → `TimestampTooltipLine[]` (`TimestampTooltipEntry {timezoneID, format, label, isCopyable}`; a zone must pass both Intl and Temporal).
- `TimestampFormat`, `TimestampValue`, `parseInstant(value)` → `Temporal.Instant | null` and `parseValue(value)` → `Date` (seconds vs ms heuristic; ISO via `Temporal.Instant.from`, else `Date`'s parser), `instantToISOString`, `getLiveInterval(diffSeconds)`, `isAbsoluteFormat`, `isRelativeFormat`, `DEFAULT_AUTO_THRESHOLD`, `MINUTE/HOUR/DAY`, `effectiveTimestampFormat(format, exactTime, now | null, autoThreshold?)` (`null` = the clock is not read yet: server render → `date_time`).

`standaloneMonthCapitals.generated.ts` — `standaloneMonthCapitalLanguages` (data).

## Source files ported

`utils/{dateTypes,plainDate,calendarSystem,calendarDateParser,dateParser,timeParser,timeFormat,unicodeDigits,standaloneMonthCapitals.generated}.ts`,
`Timestamp/{formatInstant,formatRelativeTime,tooltipEntries}.ts`: Astryx's structure, option
bags, Intl calls and text unchanged; their hand-rolled date math (Date getters, `Date.UTC`
anchors, the 'compatible'-disambiguation emulation, the `Intl` wall-clock reader, minute
arithmetic) replaced by Temporal (import paths: `Locale` from `locale.ts`, `firstCharacter` from
`../characters`, `devWarn` from `../devWarning`). `instant.ts` is a port addition.
`timestamp.ts` holds the pure part of `Timestamp/Timestamp.tsx` (type + helpers; the render's
format choice lifted into `effectiveTimestampFormat`; `parseInstant` added).

Behaviour against main (the golden corpus of ~640k outputs in Node, Chrome native and Chrome
polyfilled is identical) differs only where the old result was not a date: `plainDateToISO`
writes years outside 1-9999 as ISO extended years (`+010000-01-01`), `calendarMonthFromYearMonth`
constrains a month past the year's end in Gregorian-aligned calendars too (as its doc says),
`plainDateFromISO` reads what `Temporal.PlainDate.from` reads (no unpadded `2026-2-3`),
`formatISOTime` throws for fields that are not a time, and `compareTime` returns −1 / 0 / 1.

## Not ported

React hooks around them (`useCalendarSystem`, `useLocale`, Timestamp's clock store and live
interval effect) — the Timestamp / DateInput ports own those.

Siblings in `src/lib/`: `temporal.ts` (`Temporal`, `isNativeTemporal`, `isTemporal`),
`temporalKind.ts` (`temporalKind`, `exactTimeMilliseconds`, `compareTemporal`: Temporal values
by brand, without loading Temporal), `characters.ts` (`characterCount`, `firstCharacter`,
`truncateCharacters`, grapheme-aware), `accessibleName.ts` (`readAccessibleName(el)`, DOM),
`groupItems.ts` (`groupItems(items, {ungroupedFirst})`, `getItemGroup`), `devWarning.ts`.
