/** Demo / test fixtures for Markdown.demo.astro (not part of the component API). */

export const releaseNotes = `# Release notes: Atlas 4.2

Atlas 4.2 ships **faster sync**, a _redesigned_ activity feed and ~~the legacy exporter~~ a
new export pipeline. Read the [migration guide](/docs/migrate) or the
[upstream announcement](https://example.com/atlas/4-2) before upgrading. Run \`atlas sync --all\`
once after installing.\\
This line follows a hard break.

## Highlights

Sync now batches writes per project [s1], and conflict resolution keeps both edits [s2].

- Background sync every **30 seconds** by default
- Offline edits replay in order
  - Conflicts surface in the activity feed
    - Each conflict links to both versions
- Smaller install: 18 MB → 11 MB

1. Install the update
2. Restart the desktop app
3. Sign in again if prompted

Numbering can start anywhere:

5. Ordered lists can start anywhere
6. The counter keeps its column

### Rollout checklist

- [x] Ship the migration script
- [x] Update the API reference
- [ ] Announce in the changelog
- [ ] Remove the legacy exporter

### Known issues

- [x] Fixed: sync stalls after sleep

  The watchdog now restarts the worker within one minute.
- [ ] Open: large attachments upload twice
- A plain item in a mixed list

## Performance

| Operation | 4.1 (ms) | 4.2 (ms) | Change |
|:----------|---------:|---------:|:------:|
| Cold start | 1,840 | 1,120 | −39% |
| Project open | 420 | 260 | −38% |
| Full sync (\`10k\` items) | 9,600 | 5,100 | −47% |

> Sync is the feature our customers asked about most. This release makes it boring — in the
> best way.
>
> - Priya, sync team lead

## Configuration

\`\`\`ts
import {createClient} from '@atlas/sdk';

const client = createClient({syncInterval: 30_000});
await client.sync({projects: 'all'});
\`\`\`

The full configuration schema, for reference:

\`\`\`json
{
  "sync": {
    "interval": 30000,
    "batchSize": 200,
    "retry": {
      "attempts": 5,
      "backoff": "exponential"
    }
  },
  "export": {
    "format": "parquet",
    "compression": "zstd"
  }
}
\`\`\`

\`\`\`diff-ts
- const client = createClient({poll: true});
+ const client = createClient({syncInterval: 30_000});
\`\`\`

---

### Safety

Raw HTML stays text: <b onclick="alert(1)">not bold</b>. A link with a blocked scheme
[stays inert](javascript:alert(1)), and so do data URLs in images: ![tracking pixel](data:image/png;base64,AAAA).

#### Smaller headings

##### Level five

###### Level six

![Weekly active projects](__CHART__)
`;

export const releaseSources = {
  s1: {title: 'Sync design doc', url: 'https://example.com/design/sync'},
  s2: {title: 'Conflict resolution RFC', url: 'https://example.com/rfc/42'},
};

export const streamText = `## Streaming answer

Here is how **incremental sync** works, step by step [s1]:

1. The client records each edit locally
2. A background worker batches edits per project
3. The server acknowledges each batch

| Stage | Owner |
|:--|:--|
| Record | Client |
| Batch | Worker |
| Acknowledge | Server |

\`\`\`ts
await client.sync({projects: 'all'});
\`\`\`

- [x] Edits survive restarts
- [ ] Conflicts need a human

> Tip: run \`atlas sync --dry-run\` to preview a batch.

That's it — see the [sync guide](/docs/sync) for details.
`;

export const streamSources = {s1: {title: 'Sync design doc', url: 'https://example.com/design/sync'}};

export const overridesDoc = `## Custom heading renderer

Inline code goes through a function override: \`npm run build\`.

Math needs a renderer: $E = mc^2$ inline, and a display block:

$$
\\sum_{i=1}^{n} x_i
$$

\`\`\`mermaid Checkout flow
graph LR; Cart-->Pay-->Done
\`\`\`

The word Draft becomes Final through a text transform.
`;

export const linkDoc = `Internal links use the LinkProvider component: [settings](/settings), while external ones stay plain anchors: [example.com](https://example.com).`;
