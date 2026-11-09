/**
 * The autodocs page of every component (browser only, see preview.browser.ts): Storybook's
 * default page (title, the manifest description, the first story, the props table, the other
 * stories) plus the component's own frontmatter JSDoc, which documents its events, element API
 * and port notes. The JSDoc is shown as plain text: it quotes markup (`<ax-dialog>`), which a
 * Markdown block would render as HTML.
 *
 * Props table: `Controls` in `storybook dev`; the read-only `ArgTypes` table in the static
 * build, where a story cannot be re-rendered with new props.
 */
import {ArgTypes, Controls, Description, Heading, Primary, Stories, Subtitle, Title, useOf} from '@storybook/addon-docs/blocks';
import {createElement as h, Fragment} from 'react';

type Documented = {__docgenInfo?: {description?: string}};

function ComponentNotes() {
  const {preparedMeta} = useOf('meta', ['meta']);
  const notes = (preparedMeta.component as Documented | undefined)?.__docgenInfo?.description?.trim();
  if (!notes) return null;
  return h(
    Fragment,
    null,
    h(Heading, null, 'Component notes'),
    h('p', null, 'From the component’s source: events, element API and how the port maps Astryx.'),
    h('pre', {className: 'astryx-docs-notes'}, notes),
  );
}

export default function DocsPage() {
  return h(
    Fragment,
    null,
    h(Title),
    h(Subtitle),
    h(Description, {of: 'meta'}),
    h(Primary),
    import.meta.env.PROD ? h(ArgTypes) : h(Controls),
    h(Stories),
    h(ComponentNotes),
  );
}
