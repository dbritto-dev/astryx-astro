# lib/date

Astryx's pure date / time / digit logic and Timestamp formatting, ported verbatim from
`@astryxdesign/core` 0.7.9 (MIT). Framework-free (`Intl` only, optional Temporal); use it in
Astro frontmatter (SSR) and in custom elements. Entry: `index.ts`. Tests:
`node tools/tests/lib-date.test.mjs`.

## Exported API

Types (`dateTypes.ts`, `locale.ts`)
- `PlainDate {year, month, day}` (1-based month), `DateRange`, `ISODateString`, `DayOfWeek`, `DayOfWeekName`, `normalizeDayOfWeek(day)`, `Locale` (= BCP 47 string).

PlainDate (`plainDate.ts`)
- Create/convert: `plainDateCreate`, `plainDateFromISO`, `plainDateToISO`, `plainDateToDate`, `plainDateFromDate`, `plainDateToday`, `plainDateToInstant(pd, timezoneID, hour?, minute?)`, `plainDateFromInstant(epochMs, timezoneID)`.
- Arithmetic: `plainDateAddDays`, `plainDateAddMonths` (clamps to month end), `plainDateDiffDays(a, b)` (= b − a), `getDaysInMonth`, `plainDateDayOfWeek`, `plainDateGetWeekNumber` (ISO), `plainDateSetFirstOfMonth`, `plainDateSetStartOfWeek`, `plainDateSetEndOfWeekExclusive`.
- Compare: `plainDateIsBefore/IsAfter/IsEqual/Max/Min`, `plainDateIsInRange(pd, [start, end])`, `nearestAcceptedDate(pd, options)`.
- Zones: `getTimeZoneParts`, `getWallClock(date, timeZone)` (`WallClock`).
- Format: `plainDateFormat`, `plainDateFormatToParts`, `plainDateFormatStandaloneMonthYear`, `plainDateWeekdayNames`, `plainDateWeekFieldName`, `plainDateFormatDayNumber`, `formatSharedDate`, `dateTimeFormatFor`, `dateTimeFormatAtCall`, `DATE_FORMAT_*` and `SHARED_DATE_FORMAT_OPTIONS` presets.

Calendar systems (`calendarSystem.ts`)
- `CalendarSystem` (gregory, iso8601, buddhist, roc, japanese, persian, indian, hebrew, chinese, dangi, coptic, ethiopic, ethioaa, islamic-civil/-tbla/-umalqura), `CALENDAR_SYSTEMS`, `isCalendarSystem`, `isCalendarSystemAvailable`, `isGregorianCalendar`, `isGregorianAligned`.
- Months: `calendarMonthOf`, `calendarDayOfMonth`, `calendarYearMonthOf`, `calendarMonthFromYearMonth`, `calendarAddMonths`, `calendarShiftMonths`, `calendarShiftYears`, `isInCalendarMonth`, `calendarMonthLabelDay`, `calendarMonthsInYear`, `calendarMonthsBetween`, `calendarMonthOfYear`, `calendarMonthsInCalendarYear`, `calendarDateFromFields`, `calendarYearSpansEras`.
- Format: `formatCalendarDate(calendar, pd, options, locale)`, `formatCalendarDateToParts`, `formatCalendarMonthLabel`, `formatCalendarMonthName`, `formatCalendarYearLabel`, `formatCalendarInstant`, `formatCalendarInstantRange`.

Parsing typed dates
- `calendarDateParser.ts`: `getCalendarDateLexicon(locale, calendar)`, `parseCalendarDate(text, lexicon, options)` → `{kind: empty|incomplete|unreadable|nonexistent|outOfRange|value}`, `normalizeDateText`, `formatCalendarDateText`, `formatCalendarDateHint`, `calendarDisplayName` (DateInput's parser).
- `dateParser.ts`: `parseDateInput(text, locale)` → `PlainDate | null` (free-form Gregorian), `isLocaleDayFirst(locale)`.

Time (`timeParser.ts`, `timeFormat.ts`)
- `ISOTimeString`, `ParsedTime`, `createISOTimeString`, `parseISOTime`, `formatISOTime`, `formatDisplayTime12h`, `formatDisplayTime24h`, `parseTimeInput(text, includeSeconds?)`, `compareTime`, `isTimeInRange`, `clampTime`, `adjustTime`.
- `HourFormat`, `resolveHourFormat(locale, hourFormat?)`, `formatLocaleTime(time, locale, hourFormat, includeSeconds?)`, `parseLocaleTime(text, locale, includeSeconds?)`.

Digits (`unicodeDigits.ts`) — `toAsciiDigits(text)`, `digitValue(char)`, `INVISIBLE_CHARS` (NumberInput, date/time parsing).

Timestamp (`formatInstant.ts`, `formatRelativeTime.ts`, `tooltipEntries.ts`, `timestamp.ts`)
- `formatInstant(date, format, locale, {timeZone, isTimezoneShown, timeZoneNameStyle, calendar})`, `InstantFormat`, `FormatInstantOptions`.
- `formatRelativeTime(date, now, locale, 'long' | 'narrow')`.
- `formatTooltipLines(date, entries, locale, calendar?)` → `TimestampTooltipLine[]` (`TimestampTooltipEntry {timezoneID, format, label, isCopyable}`).
- `TimestampFormat`, `parseValue(string | number)` (seconds vs ms heuristic), `getLiveInterval(diffSeconds)`, `isAbsoluteFormat`, `isRelativeFormat`, `DEFAULT_AUTO_THRESHOLD`, `MINUTE/HOUR/DAY`, `effectiveTimestampFormat(format, date, now | null, autoThreshold?)` (`null` = the clock is not read yet: server render → `date_time`).

`standaloneMonthCapitals.generated.ts` — `standaloneMonthCapitalLanguages` (data).

## Source files ported

`utils/{dateTypes,plainDate,calendarSystem,calendarDateParser,dateParser,timeParser,timeFormat,unicodeDigits,standaloneMonthCapitals.generated}.ts`,
`Timestamp/{formatInstant,formatRelativeTime,tooltipEntries}.ts` verbatim (import paths only;
`Locale` from `locale.ts`, `firstCharacter` from `../characters`, `devWarn` from `../devWarning`).
`timestamp.ts` holds the pure part of `Timestamp/Timestamp.tsx` (type + helpers verbatim; the
render's format choice lifted into `effectiveTimestampFormat`).

## Not ported

React hooks around them (`useCalendarSystem`, `useLocale`, Timestamp's clock store and live
interval effect) — the Timestamp / DateInput ports own those.

Siblings in `src/lib/`: `characters.ts` (`characterCount`, `firstCharacter`,
`truncateCharacters`, grapheme-aware), `accessibleName.ts` (`readAccessibleName(el)`, DOM),
`groupItems.ts` (`groupItems(items, {ungroupedFirst})`, `getItemGroup`), `devWarning.ts`.
