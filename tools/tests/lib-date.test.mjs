#!/usr/bin/env node
/**
 * Behaviour tests for src/lib/date (+ characters, groupItems). Astryx 0.7.9 ships no unit
 * tests in its npm source, so these pin the documented behaviour of the verbatim ports.
 *   node tools/tests/lib-date.test.mjs
 */
import {lib, createChecker} from './lib-loader.mjs';

const {check, eq, done} = createChecker();
const d = await lib('date/index.ts');
const chars = await lib('characters.ts');
const groups = await lib('groupItems.ts');

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

done('lib/date + characters + groupItems');
