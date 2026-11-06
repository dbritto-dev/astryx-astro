# Astryx for Astro

An unofficial port of [Astryx](https://github.com/facebook/astryx), Meta's open-source design
system, to **server-rendered Astro components** with plain CSS and small light-DOM web
components. Pages ship zero JavaScript unless a component needs behaviour (dialogs, menus,
tooltips, comboboxes …), and then only that component's script.

- **Same API** as `@astryxdesign/core`: prop names, defaults, variants and sizes match, so
  Astryx docs and agent tooling carry over. Event props become DOM `CustomEvent`s
  (`astryx-change`, `astryx-open-change` …).
- **Same themes**: the seven published Astryx themes (neutral, butter, chocolate, gothic,
  matcha, stone, y2k) are rebuilt from their TypeScript source with Astryx's own
  `astryx theme build`. Components render the same `astryx-*` classes and `data-*` hooks,
  so the generated theme CSS applies unchanged.
- **Same strings**: Astryx's ICU locale catalogs (30 locales), translated on the server.
- **Platform first**: `popover`, `<dialog>`, CSS anchor positioning, `:has()`, `@scope`,
  `@starting-style`.

> Not affiliated with or endorsed by Meta. Astryx is MIT-licensed; see
> [`packages/astryx-astro/NOTICE`](packages/astryx-astro/NOTICE).

## Use

```astro
---
// src/layouts/Base.astro
import 'astryx-astro/astryx.css';
import 'astryx-astro/themes/neutral.css';
import {Button, Stack, Text} from 'astryx-astro';
---
<html lang="en" data-astryx-theme="neutral">
  <body>
    <Stack gap={2}>
      <Text type="display-2" as="h1">Hello</Text>
      <Button label="Save" variant="primary" />
    </Stack>
  </body>
</html>
```

Light/dark follows the system; set `data-theme="light|dark"` on `<html>` to force one.
Each theme also has `themes/<name>.fonts.css` with its web-font imports.

## Repository

| Path | What |
|---|---|
| `packages/astryx-astro` | The component library |
| `packages/astryx-astro/AGENTS.md` | Porting conventions (read before contributing) |
| `packages/astryx-astro/scripts` | Token/theme/locale generation, docs manifest, index, conformance check |
| `apps/docs` | Documentation site with every component, theme and color-mode switcher |
| `tools` | Screenshot and browser test helpers |

```sh
pnpm install
pnpm dev                       # docs site
pnpm build                     # build docs
pnpm -F astryx-astro generate  # regenerate tokens, themes, locales, manifest, index
pnpm -F astryx-astro check:generated
node packages/astryx-astro/scripts/conformance.mjs   # theme-hook contract, after a build
```

## Status

Porting is in progress; the docs overview shows which components are done. Astryx's
touch-gesture extras (press-and-slide across action groups, press-drag-release menus,
swipe actions, wheel pickers) are deferred; desktop, keyboard and screen-reader behaviour
target parity.
