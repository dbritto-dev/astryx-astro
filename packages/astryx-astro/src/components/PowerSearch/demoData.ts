/**
 * Demo data for PowerSearch.demo.astro (shared by the server render and the demo script).
 * `created` is a Temporal.Instant (port addition: date fields match Instants and ZonedDateTimes
 * as well as Astryx's Dates and Unix seconds).
 */
import type {FieldDefinition} from './powerSearchModel';
import {Temporal} from '../../lib/temporal';

const at = (iso: string) => Temporal.Instant.from(iso);

export const ISSUE_FIELDS = [
  {key: 'title', type: 'string', label: 'Title'},
  {key: 'status', type: 'enum', label: 'Status', enumValues: [
    {value: 'open', label: 'Open'}, {value: 'in_progress', label: 'In progress'}, {value: 'closed', label: 'Closed'},
  ]},
  {key: 'labels', type: 'enum_list', label: 'Labels', enumValues: [
    {value: 'bug', label: 'Bug'}, {value: 'ui', label: 'UI'}, {value: 'docs', label: 'Docs'}, {value: 'perf', label: 'Performance'},
  ]},
  {key: 'estimate', type: 'number', label: 'Estimate'},
  {key: 'created', type: 'date', label: 'Created'},
  {key: 'archived', type: 'boolean', label: 'Archived'},
] as const satisfies ReadonlyArray<FieldDefinition>;

export const ISSUES = [
  {title: 'Dialog loses focus on close', status: 'open', labels: ['bug', 'ui'], estimate: 3, created: at('2026-01-01T00:00:00Z'), archived: false, team: 'core'},
  {title: 'Tokenizer overflow count', status: 'open', labels: ['ui'], estimate: 2, created: at('2026-01-09T23:06:40Z'), archived: false, team: 'core'},
  {title: 'Docs for PowerSearch', status: 'in_progress', labels: ['docs'], estimate: 5, created: at('2026-01-21T12:53:20Z'), archived: false, team: 'web'},
  {title: 'Selector flickers in Safari', status: 'open', labels: ['bug'], estimate: 1, created: at('2026-02-02T02:40:00Z'), archived: false, team: 'core'},
  {title: 'Speed up table sort', status: 'closed', labels: ['perf'], estimate: 8, created: at('2025-10-09T08:53:20Z'), archived: true, team: 'web'},
  {title: 'Command palette hotkey', status: 'open', labels: ['ui'], estimate: 2, created: at('2026-02-13T16:26:40Z'), archived: false, team: 'web'},
  {title: 'Calendar week numbers', status: 'closed', labels: ['ui', 'docs'], estimate: 3, created: at('2025-12-06T05:46:40Z'), archived: false, team: 'core'},
];
