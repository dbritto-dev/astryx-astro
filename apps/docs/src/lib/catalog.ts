/**
 * Docs catalog: joins the Astryx docs manifest with the components that have been
 * ported (a `<Name>.demo.astro` next to the component means it is documented here).
 */
import manifest from '../../../../packages/astryx-astro/meta/astryx-docs.json';

export interface ManifestEntry {
  name: string;
  displayName: string;
  dir: string;
  category: string | null;
  group: string | null;
  subComponentOf: string | null;
  hidden: boolean;
  description: string;
  keywords: string[];
  theming: {className: string; visualProps: string[]}[];
  props: {name: string; type: string; required: boolean; default: string | null; description: string}[];
}

const demos = import.meta.glob<{default: unknown}>('../../../../packages/astryx-astro/src/components/*/*.demo.astro', {eager: true});
const sources = import.meta.glob<string>('../../../../packages/astryx-astro/src/components/*/*.astro', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const nameFrom = (path: string) => path.split('/').pop()!.replace(/\.(demo\.)?astro$/, '');

export const demoByName = new Map(Object.entries(demos).map(([path, mod]) => [nameFrom(path), mod.default]));

const propsBlock = (src: string) => src.match(/export (?:interface Props[^{]*\{[\s\S]*?\n\}|type Props = [^\n]+)/)?.[0] ?? null;

/** `interface Props { … }` of every public component in a directory, main component first. */
export function apiSources(dir: string, main: string): {name: string; source: string}[] {
  // Most ports live in the Astryx directory name; a few (e.g. LinkProvider) use their own.
  const dirs = new Set([dir, main]);
  return Object.entries(sources)
    .filter(([path]) => dirs.has(path.split('/').at(-2)!) && !path.endsWith('.demo.astro') && !nameFrom(path).startsWith('_'))
    .filter(([path]) => path.split('/').at(-2) === dir || nameFrom(path) === main)
    .map(([path, src]) => ({name: nameFrom(path), source: propsBlock(src)}))
    .filter((a): a is {name: string; source: string} => a.source !== null)
    .sort((a, b) => (a.name === main ? -1 : b.name === main ? 1 : a.name.localeCompare(b.name)));
}

export const components: ManifestEntry[] = (manifest.components as ManifestEntry[]).filter((c) => !c.subComponentOf);
export const allEntries: ManifestEntry[] = manifest.components as ManifestEntry[];
export const astryxVersion: string = manifest.astryx;

export const categoryOrder = [
  'Layout', 'Content', 'Action', 'Form Controls', 'Container', 'Feedback & Status',
  'Navigation', 'Overlay', 'Table & List', 'Chat', 'Utility',
];

export function byCategory(): [string, ManifestEntry[]][] {
  const groups = new Map<string, ManifestEntry[]>();
  for (const c of components) {
    const key = c.category ?? 'Utility';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }
  return categoryOrder.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!]);
}

export const subComponentsOf = (name: string) => allEntries.filter((c) => c.subComponentOf === name);
export const slug = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
