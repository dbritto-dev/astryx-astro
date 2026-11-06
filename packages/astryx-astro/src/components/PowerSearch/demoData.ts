/** Demo data for PowerSearch.demo.astro (shared by the server render and the demo script). */
import type {FieldDefinition} from './powerSearchModel';

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
  {title: 'Dialog loses focus on close', status: 'open', labels: ['bug', 'ui'], estimate: 3, created: 1767225600, archived: false, team: 'core'},
  {title: 'Tokenizer overflow count', status: 'open', labels: ['ui'], estimate: 2, created: 1768000000, archived: false, team: 'core'},
  {title: 'Docs for PowerSearch', status: 'in_progress', labels: ['docs'], estimate: 5, created: 1769000000, archived: false, team: 'web'},
  {title: 'Selector flickers in Safari', status: 'open', labels: ['bug'], estimate: 1, created: 1770000000, archived: false, team: 'core'},
  {title: 'Speed up table sort', status: 'closed', labels: ['perf'], estimate: 8, created: 1760000000, archived: true, team: 'web'},
  {title: 'Command palette hotkey', status: 'open', labels: ['ui'], estimate: 2, created: 1771000000, archived: false, team: 'web'},
  {title: 'Calendar week numbers', status: 'closed', labels: ['ui', 'docs'], estimate: 3, created: 1765000000, archived: false, team: 'core'},
];
