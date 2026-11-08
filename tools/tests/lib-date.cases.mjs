/**
 * The lib/date assertions, shared by Node (lib-date.test.mjs: polyfilled Temporal, since Node 22
 * has none) and Chrome (lib-date-browser.test.mjs: native Temporal, and the polyfill with
 * Temporal removed). Plain ES module, no Node APIs: it runs in the page as-is.
 *   runLibDateCases({d, chars, groups, temporal, timer}, {check, eq})
 * `temporal` is src/lib/temporal.ts, `timer` components/Timer/timerFormat.ts.
 */
export function runLibDateCases({d, chars, groups, temporal, timer}, {check, eq}) {
  const {Temporal} = temporal;
  // ── PlainDate arithmetic ────────────────────────────────────────────────
  const pd = (y, m, day) => d.plainDateCreate(y, m, day);
  eq('ISO round trip', d.plainDateToISO(pd(2024, 2, 29)), '2024-02-29');
  eq('fromISO', d.plainDateFromISO('2025-11-06'), {year: 2025, month: 11, day: 6});
  eq('leap February', d.getDaysInMonth(2024, 2), 29);
  eq('common February', d.getDaysInMonth(2023, 2), 28);
  eq('addMonths clamps to month end', d.plainDateToISO(d.plainDateAddMonths(pd(2024, 1, 31), 1)), '2024-02-29');
  eq('addMonths across year', d.plainDateToISO(d.plainDateAddMonths(pd(2024, 11, 15), 3)), '2025-02-15');
  eq('addDays across month', d.plainDateToISO(d.plainDateAddDays(pd(2024, 2, 28), 2)), '2024-03-01');
  eq('diffDays (b − a)', d.plainDateDiffDays(pd(2024, 2, 1), pd(2024, 3, 1)), 29);
  eq('dayOfWeek (2024-01-01 is a Monday)', d.plainDateDayOfWeek(pd(2024, 1, 1)), 1);
  eq('ISO week number', d.plainDateGetWeekNumber(pd(2021, 1, 3)), 53);
  check('isBefore', d.plainDateIsBefore(pd(2024, 1, 1), pd(2024, 1, 2)));
  check('isInRange', d.plainDateIsInRange(pd(2024, 5, 5), [pd(2024, 5, 1), pd(2024, 5, 31)]));
  eq('startOfWeek (Sunday)', d.plainDateToISO(d.plainDateSetStartOfWeek(pd(2024, 5, 8), 0)), '2024-05-05');
  eq('firstOfMonth', d.plainDateToISO(d.plainDateSetFirstOfMonth(pd(2024, 5, 8))), '2024-05-01');

  // ── Free-form date parsing ──────────────────────────────────────────────
  eq('parse ISO', d.parseDateInput('2024-03-05'), {year: 2024, month: 3, day: 5});
  eq('parse US numeric', d.parseDateInput('3/5/2024', 'en-US'), {year: 2024, month: 3, day: 5});
  eq('parse day-first numeric', d.parseDateInput('3/5/2024', 'en-GB'), {year: 2024, month: 5, day: 3});
  eq('parse month name', d.parseDateInput('March 5, 2024'), {year: 2024, month: 3, day: 5});
  eq('reject impossible date', d.parseDateInput('2023-02-29'), null);
  check('en-GB is day-first', d.isLocaleDayFirst('en-GB'));
  check('en-US is month-first', !d.isLocaleDayFirst('en-US'));

  const lex = d.getCalendarDateLexicon('en-US', 'gregory');
  const parsed = d.parseCalendarDate('5/6/2024', lex);
  eq('calendar parser value', parsed.kind === 'value' ? d.plainDateToISO(parsed.date) : parsed.kind, '2024-05-06');
  eq('calendar parser incomplete', d.parseCalendarDate('5/', lex).kind, 'incomplete');
  eq('calendar parser unreadable', d.parseCalendarDate('banana', lex).kind, 'unreadable');
  eq('calendar parser empty', d.parseCalendarDate('  ', lex).kind, 'empty');

  // ── Calendar systems ────────────────────────────────────────────────────
  check('gregory is a calendar system', d.isCalendarSystem('gregory'));
  check('unknown calendar rejected', !d.isCalendarSystem('martian'));
  eq('format gregorian date', d.formatCalendarDate('gregory', pd(2024, 3, 5), {year: 'numeric', month: 'long', day: 'numeric'}, 'en-US'), 'March 5, 2024');

  // ── Time ────────────────────────────────────────────────────────────────
  eq('parse 12h time', d.parseTimeInput('2:30 pm'), '14:30');
  eq('parse dotted meridiem', d.parseTimeInput('2:30 p.m.'), '14:30');
  eq('parse midnight', d.parseTimeInput('12 am'), '00:00');
  eq('parse with seconds', d.parseTimeInput('9:05:07', true), '09:05:07');
  eq('reject bad time', d.parseTimeInput('25:99'), null);
  eq('parseISOTime', d.parseISOTime('07:08:09'), {hour: 7, minute: 8, second: 9});
  eq('compareTime', d.compareTime('09:00', '10:00') < 0, true);
  eq('resolveHourFormat en-US', d.resolveHourFormat('en-US'), '12h');
  eq('resolveHourFormat de-DE', d.resolveHourFormat('de-DE'), '24h');
  eq('formatLocaleTime en-US', d.formatLocaleTime('14:30', 'en-US', '12h'), '2:30 PM');
  eq('formatLocaleTime de-DE', d.formatLocaleTime('14:30', 'de-DE', '24h'), '14:30');
  eq('parseLocaleTime de-DE', d.parseLocaleTime('14:30', 'de-DE'), '14:30');

  // ── Digits ──────────────────────────────────────────────────────────────
  eq('Arabic-Indic digits', d.toAsciiDigits('٢٠٢٤'), '2024');
  eq('Devanagari digit value', d.digitValue('७'), 7);

  // ── Instants and relative time ──────────────────────────────────────────
  const now = new Date('2026-11-06T12:00:00Z');
  eq('relative long', d.formatRelativeTime(new Date('2026-11-06T10:00:00Z'), now, 'en', 'long'), '2 hours ago');
  eq('relative future', d.formatRelativeTime(new Date('2026-11-09T12:00:00Z'), now, 'en', 'long'), 'in 3 days');
  eq('formatInstant date (UTC)', d.formatInstant(now, 'date', 'en-US', {timeZone: 'UTC'}), 'Nov 6, 2026');
  eq('formatInstant unix_seconds', d.formatInstant(now, 'unix_seconds', 'en-US'), String(now.getTime() / 1000));
  check('formatInstant full names the zone', /UTC/.test(d.formatInstant(now, 'full', 'en-US', {timeZone: 'UTC'})));

  // ── Timestamp helpers ───────────────────────────────────────────────────
  eq('parseValue seconds', d.parseValue(1_700_000_000).getTime(), 1_700_000_000_000);
  eq('parseValue ms', d.parseValue(1_700_000_000_000).getTime(), 1_700_000_000_000);
  eq('live interval < 1 min', d.getLiveInterval(5), 1000);
  eq('live interval < 1 h', d.getLiveInterval(-600), 30_000);
  eq('live interval < 1 day', d.getLiveInterval(7200), 60_000);
  eq('live interval ≥ 1 day', d.getLiveInterval(200_000), 300_000);
  check('date is absolute', d.isAbsoluteFormat('date'));
  check('auto is not absolute', !d.isAbsoluteFormat('auto'));
  check('relative_short is relative', d.isRelativeFormat('relative_short'));
  eq('auto before the clock is read', d.effectiveTimestampFormat('auto', now, null), 'date_time');
  eq('auto within threshold', d.effectiveTimestampFormat('auto', new Date('2026-11-05T12:00:00Z'), now), 'relative');
  eq('auto past threshold', d.effectiveTimestampFormat('auto', new Date('2026-10-01T12:00:00Z'), now), 'date_time');
  eq('absolute ignores the clock', d.effectiveTimestampFormat('time', now, null), 'time');

  // ── Tooltip lines ───────────────────────────────────────────────────────
  const lines = d.formatTooltipLines(now, [{timezoneID: 'UTC', label: 'UTC', format: 'system_date_time'}], 'en-US');
  eq('tooltip line', lines.map((l) => [l.label, l.value, l.isCopyable]), [['UTC', '2026-11-06 12:00:00', false]]);

  // ── characters ──────────────────────────────────────────────────────────
  eq('characterCount joins emoji + modifier', chars.characterCount('👍🏽a'), 2);
  eq('characterCount flags', chars.characterCount('🇨🇴🇵🇪'), 2);
  eq('firstCharacter', chars.firstCharacter('👨‍👩‍👧 family'), '👨‍👩‍👧');
  eq('truncateCharacters keeps whole graphemes', chars.truncateCharacters('👍🏽👍🏽👍🏽👍🏽', 3), '👍🏽👍🏽…');
  eq('truncateCharacters within max', chars.truncateCharacters('héllo👍🏽!', 7), 'héllo👍🏽!');

  // ── groupItems ──────────────────────────────────────────────────────────
  const items = [
    {id: '1', label: 'Apple', auxiliaryData: {group: 'Fruit'}},
    {id: '2', label: 'Carrot', auxiliaryData: {group: 'Vegetable'}},
    {id: '3', label: 'Water'},
    {id: '4', label: 'Pear', auxiliaryData: {group: 'Fruit'}},
  ];
  eq('groupItems order', groups.groupItems(items).map((g) => [g.heading, g.items.map((i) => i.id)]), [['Fruit', ['1', '4']], ['Vegetable', ['2']], [null, ['3']]]);
  eq('groupItems ungroupedFirst', groups.groupItems(items, {ungroupedFirst: true})[0].heading, null);
  eq('getItemGroup', groups.getItemGroup(items[1]), 'Vegetable');

  // ── Temporal (lib/temporal.ts, port additions) ─────────────────────────
  const T = Temporal;
  check('lib/temporal exports a Temporal namespace', typeof T.PlainDate === 'function' && typeof T.Now.instant === 'function');
  check('the polyfill is never installed globally', temporal.isNativeTemporal ? globalThis.Temporal === T : globalThis.Temporal === undefined);
  const tpd = T.PlainDate.from('2024-02-28');
  eq('PlainDate input: addDays', d.plainDateAddDays(tpd, 2), {year: 2024, month: 3, day: 1});
  eq('PlainDate input: addMonths clamps', d.plainDateToISO(d.plainDateAddMonths(T.PlainDate.from('2024-01-31'), 1)), '2024-02-29');
  eq('PlainDate input: diffDays', d.plainDateDiffDays(tpd, T.PlainDate.from('2024-03-28')), 29);
  eq('PlainDate input: day of week (Sunday = 0)', d.plainDateDayOfWeek(T.PlainDate.from('2026-11-08')), 0);
  eq('PlainDate input: ISO week', d.plainDateGetWeekNumber(T.PlainDate.from('2021-01-03')), 53);
  check('PlainDate and record compare equal', d.plainDateIsEqual(tpd, pd(2024, 2, 28)));
  eq('another calendar counts as its ISO day', d.plainDateToISO(T.PlainDate.from('2026-03-21').withCalendar('hebrew')), '2026-03-21');
  eq('plainDateFromISO reads an annotated date', d.plainDateFromISO('2026-03-05[u-ca=hebrew]'), {year: 2026, month: 3, day: 5});
  check('plainDateFromISO rejects year 0', (() => { try { d.plainDateFromISO('0000-01-01'); return false; } catch (e) { return e instanceof RangeError; } })());
  eq('plainDateToTemporal → ISO PlainDate', d.plainDateToTemporal(pd(2026, 3, 21)).toString(), '2026-03-21');
  eq('ISO extended years', d.plainDateToISO(pd(9999, 12, 31)), '9999-12-31');
  eq('plainDateToday is Temporal.Now.plainDateISO', d.plainDateToISO(d.plainDateToday()), T.Now.plainDateISO().toString());
  eq('plainDateToDate is the local start of day', d.plainDateToDate(pd(2026, 3, 21)).getTime(), T.PlainDate.from('2026-03-21').toZonedDateTime(T.Now.timeZoneId()).epochMilliseconds);
  // 'compatible' disambiguation: a skipped wall time moves forward, a repeated one is the earlier.
  eq('wall time in a DST gap moves forward (New York 02:30 → 03:30 EDT)', new Date(d.plainDateToInstant(pd(2026, 3, 8), 'America/New_York', 2, 30)).toISOString(), '2026-03-08T07:30:00.000Z');
  eq('repeated wall time is the earlier (New York 01:30 EDT)', new Date(d.plainDateToInstant(pd(2026, 11, 1), 'America/New_York', 1, 30)).toISOString(), '2026-11-01T05:30:00.000Z');
  eq('24:00 carries into the next day', new Date(d.plainDateToInstant(pd(2026, 6, 15), 'UTC', 24, 0)).toISOString(), '2026-06-16T00:00:00.000Z');
  eq('Lord Howe half-hour gap', new Date(d.plainDateToInstant(pd(2026, 10, 4), 'Australia/Lord_Howe', 2, 15)).toISOString(), '2026-10-03T15:45:00.000Z');
  eq('getTimeZoneParts takes an Instant', d.getTimeZoneParts(T.Instant.from('2026-03-08T07:30:00Z'), 'Asia/Kolkata'), {year: 2026, month: 3, day: 8, hour: 13, minute: 0, second: 0});
  eq('plainDateFromInstant across the date line', d.plainDateFromInstant(T.Instant.from('2026-01-01T10:30:00Z'), 'Pacific/Kiritimati'), {year: 2026, month: 1, day: 2});
  eq('getWallClock of a ZonedDateTime', d.getWallClock(T.ZonedDateTime.from('2026-02-19T12:00:00-05:00[America/Bogota]'), 'UTC').hour, 17);

  // Every calendar is available (no Gregorian fallback); months come from Temporal.
  check('all calendar systems available', d.CALENDAR_SYSTEMS.every((c) => d.isCalendarSystemAvailable(c)));
  const farvardin = d.calendarMonthOf('persian', pd(2026, 3, 25));
  eq('Persian month (Farvardin 1405)', [d.plainDateToISO(farvardin.start), farvardin.length, d.calendarYearMonthOf('persian', farvardin)], ['2026-03-21', 31, {year: 1405, month: 1}]);
  eq('Persian 30 Esfand of a common year does not exist', d.calendarDateFromFields('persian', {year: 1404, monthCode: 'M12', day: 30}), null);
  eq('Persian 30 Esfand 1403 (leap)', d.calendarDateFromFields('persian', {year: 1403, monthCode: 'M12', day: 30}), {year: 2025, month: 3, day: 20});
  eq('Hebrew leap year has 13 months', d.calendarMonthsInYear('hebrew', pd(2027, 3, 1)), 13);
  eq('Buddhist year numbers', d.calendarYearMonthOf('buddhist', d.calendarMonthOf('buddhist', pd(2026, 8, 14))), {year: 2569, month: 8});
  eq('Japanese era label of May 2019', d.formatCalendarMonthLabel('japanese', d.calendarMonthOf('japanese', pd(2019, 5, 1)), 'ja-JP'), '令和元年5月');
  eq('Persian date label', d.formatCalendarDate('persian', pd(2026, 3, 21), d.DATE_FORMAT_LONG, 'en'), 'Farvardin 1, 1405 AP');
  eq('Persian typed date', (() => { const r = d.parseCalendarDate('1/1/1405', d.getCalendarDateLexicon('en', 'persian')); return r.kind === 'value' ? d.plainDateToISO(r.date) : r.kind; })(), '2026-03-21');
  // Intl formats epoch milliseconds, never a Temporal object (which picks another pattern).
  eq('ja-JP long date keeps Intl\'s pattern for a Temporal.PlainDate', d.plainDateFormat(T.PlainDate.from('2026-03-21'), d.DATE_FORMAT_LONG, 'ja-JP'), '2026年3月21日');

  // Times: Temporal.PlainTime underneath.
  eq('toPlainTime reads Astryx\'s lenient text', d.toPlainTime('7:8')?.toString(), '07:08:00');
  eq('toPlainTime rejects 24:00', d.toPlainTime('24:00'), null);
  eq('formatISOTime takes a PlainTime', d.formatISOTime(T.PlainTime.from('09:05:07.5'), true), '09:05:07');
  eq('compareTime is a sign', [d.compareTime('09:00', '10:30'), d.compareTime('10:30', '09:00'), d.compareTime('09:00', '09:00:00')], [-1, 1, 0]);
  eq('adjustTime wraps midnight', d.adjustTime('23:50', 15), '00:05');
  eq('adjustTime keeps seconds', d.adjustTime('00:00:30', -1, true), '23:59:30');
  eq('clampTime to the next whole minute', d.clampTime('08:00', '09:00:30', '17:00'), '09:01');
  eq('formatLocaleTime takes a PlainTime', d.formatLocaleTime(T.PlainTime.from('14:30'), 'en-US', '12h'), '2:30 PM');

  // Component values.
  eq('isoDateOf', [d.isoDateOf(T.PlainDate.from('2026-03-21')), d.isoDateOf('2026-03-21'), d.isoDateOf(undefined)], ['2026-03-21', '2026-03-21', undefined]);
  eq('isoTimeOf', [d.isoTimeOf(T.PlainTime.from('14:30')), d.isoTimeOf(T.PlainTime.from('14:30:15')), d.isoTimeOf('9:05')], ['14:30', '14:30:15', '9:05']);
  eq('isoDateTimeOf', [d.isoDateTimeOf(T.PlainDateTime.from('2026-03-21T14:30')), d.isoDateTimeOf(T.ZonedDateTime.from('2026-03-23T09:00:05+01:00[Europe/Berlin]'))], ['2026-03-21T14:30', '2026-03-23T09:00:05']);

  // Instants: parseInstant, ExactTime inputs.
  const inst = T.Instant.from('2026-02-19T17:00:00Z');
  eq('parseInstant: ISO with offset', d.parseInstant('2026-02-19T12:00:00-05:00')?.toString(), '2026-02-19T17:00:00Z');
  eq('parseInstant: seconds and ms', [d.parseInstant(1_700_000_000)?.epochMilliseconds, d.parseInstant(1_700_000_000_123)?.epochMilliseconds], [1_700_000_000_000, 1_700_000_000_123]);
  eq('parseInstant: a date-only string is UTC midnight (Date\'s reading)', d.parseInstant('2026-02-19')?.toString(), '2026-02-19T00:00:00Z');
  eq('parseInstant: ZonedDateTime → its instant', d.parseInstant(T.ZonedDateTime.from('2026-02-19T12:00:00-05:00[America/Bogota]'))?.toString(), '2026-02-19T17:00:00Z');
  eq('parseInstant: unparseable', [d.parseInstant('nope'), d.parseInstant(NaN), d.parseInstant(9e15)], [null, null, null]);
  eq('instantToISOString matches toISOString', d.instantToISOString(inst), new Date(inst.epochMilliseconds).toISOString());
  eq('parseValue stays a Date', d.parseValue('2026-02-19T17:00:00Z') instanceof Date, true);
  eq('formatInstant: Instant input = Date input', d.formatInstant(inst, 'full', 'en-US', {timeZone: 'UTC'}), d.formatInstant(new Date(inst.epochMilliseconds), 'full', 'en-US', {timeZone: 'UTC'}));
  eq('formatInstant: system_date_time of an Instant', d.formatInstant(inst, 'system_date_time', 'en-US', {timeZone: 'Asia/Kathmandu'}), '2026-02-19 22:45:00');
  eq('formatInstant: unix_seconds floors', d.formatInstant(T.Instant.fromEpochMilliseconds(-1500), 'unix_seconds', 'en'), '-2');
  eq('formatRelativeTime with Instants', d.formatRelativeTime(inst, inst.add({hours: 3}), 'en', 'long'), '3 hours ago');
  eq('effectiveTimestampFormat with Instants', d.effectiveTimestampFormat('auto', inst, inst.add({hours: 24 * 8})), 'date_time');
  eq('tooltip zone must pass Temporal too', d.formatTooltipLines(inst, [{timezoneID: 'UTC', format: 'system_time'}], 'en')[0].value, '17:00:00');

  // Timer durations (components/Timer/timerFormat.ts).
  if (timer) {
    eq('Timer elapsed seconds', timer.getPresentation(5_999, 'elapsed'), {dateTime: 'PT5S', text: '5s'});
    eq('Timer elapsed minutes', timer.getPresentation(125_000, 'elapsed'), {dateTime: 'PT125S', text: '2m 05s'});
    eq('Timer elapsed hours drop seconds', timer.getPresentation(3_903_500, 'elapsed'), {dateTime: 'PT3900S', text: '1h 05m'});
    eq('Timer clock', timer.getPresentation(3_723_999, 'clock'), {dateTime: 'PT3723S', text: '1:02:03'});
    eq('Timer clock under an hour', timer.getPresentation(61_000, 'clock'), {dateTime: 'PT61S', text: '1:01'});
    eq('Timer zero', timer.getPresentation(0, 'clock'), {dateTime: 'PT0S', text: '0:00'});
    eq('Timer 3 days', timer.getPresentation(3 * 86_400_000 + 65_000, 'elapsed').text, '72h 01m');
  }

  // Brand helpers (lib/temporalKind.ts, re-exported by lib/temporal.ts).
  eq('temporalKind', [temporal.temporalKind(inst), temporal.temporalKind(tpd), temporal.temporalKind(new Date()), temporal.temporalKind({})], ['Instant', 'PlainDate', null, null]);
  check('isTemporal', temporal.isTemporal(tpd, 'PlainDate') && !temporal.isTemporal(tpd, 'Instant'));
}
