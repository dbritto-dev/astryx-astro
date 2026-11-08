# Astryx for Astro

An unofficial port of [Astryx](https://github.com/facebook/astryx), Meta's open-source design
system, to **server-rendered Astro components** with plain CSS and small light-DOM web
components. Pages ship no JavaScript for static components; interactive ones (dialogs, menus,
tooltips, comboboxes, tables …) load only their own script.

- **All 110 Astryx 0.7.9 components** and their sub-components, with the same prop names,
  defaults, variants, sizes, ARIA and keyboard behaviour. Callback props become bubbling DOM
  `CustomEvent`s (`astryx-change`, `astryx-open-change` …).
- **Same themes**: the seven published Astryx themes (neutral, butter, chocolate, gothic,
  matcha, stone, y2k) are rebuilt from their TypeScript source with Astryx's own
  `astryx theme build`. Components render the same `astryx-*` classes and `data-*` hooks, so
  the generated theme CSS applies unchanged.
- **Same strings**: Astryx's ICU locale catalogs (30 locales), translated on the server.
- **Modern platform**: `popover`, `<dialog>`, invoker commands, CSS anchor positioning, `:has()`,
  `@scope`, `@starting-style`, and Temporal for every date and time.

> Not affiliated with or endorsed by Meta. Astryx is MIT-licensed; see
> [`packages/astryx-astro/NOTICE`](packages/astryx-astro/NOTICE).

## Install

Requires **Astro 7**.

```sh
pnpm add astryx-astro
```

```js
// astro.config.mjs
import {defineConfig} from 'astro/config';
import astryx from 'astryx-astro/integration';

export default defineConfig({integrations: [astryx()]});
```

The integration keeps a single copy of the client runtime in `astro dev` (it excludes the
package from Vite's dependency pre-bundling). Production builds work without it.

## Use

Tell server components which theme is active (icons resolve from it), and put the theme
attributes on `<html>`:

```ts
// src/middleware.ts
export const onRequest = (ctx, next) => { ctx.locals.astryxTheme = 'neutral'; return next(); };
```

```astro
---
// src/layouts/Base.astro
import 'astryx-astro/astryx.css';
import 'astryx-astro/themes/neutral.css';
import 'astryx-astro/themes/neutral.fonts.css';
import {themeRootAttributes} from 'astryx-astro/components/theme/themeRoot';
import Button from 'astryx-astro/components/Button/Button.astro';
import Stack from 'astryx-astro/components/Stack/Stack.astro';
import Text from 'astryx-astro/components/Text/Text.astro';
---
<html lang="en" {...themeRootAttributes('neutral', 'system')}>
  <body>
    <Stack gap={2}>
      <Text type="display-2" as="h1">Hello</Text>
      <Button label="Save" variant="primary" tooltip="Saves the draft" />
    </Stack>
  </body>
</html>
```

- **Lean pages:** import components by path, as above. `import {Button} from 'astryx-astro'`
  also works, but the package index imports every component, so every component's CSS ships.
- **Modes:** light/dark follows the system; pass `'light'` or `'dark'` to `themeRootAttributes`
  to force one. A nested `<Theme name="butter">` switches theme (tokens and icons) for a subtree.
- **Locale:** set `ctx.locals.astryxLocale = 'es-ES'` in middleware, use Astro i18n routing, or
  wrap a subtree in `<InternationalizationProvider locale="…">`.
- **Client APIs:** imperative helpers live under `astryx-astro/elements/*`, e.g.
  `import {toast} from 'astryx-astro/elements/toast'` in a `<script>`.
- **Events:** `el.addEventListener('astryx-change', (e) => e.detail.value)`. Each component's
  JSDoc and the docs site list its events and element API.

## Browser support

The bar is **Baseline newly available**: the current Chrome, Edge, Firefox and Safari. Features
at that level (popover, `<dialog>`, CSS anchor positioning, invoker commands, `@scope`,
`@starting-style`, `scrollend` …) are used without fallbacks. Newer ones (`popover="hint"`,
`closedby`, `hidden="until-found"`, `interpolate-size` …) are progressive enhancements. Every
feature with its [web-features](https://github.com/web-platform-dx/web-features) status, and
how each enhancement degrades, is listed in [`docs/platform.md`](packages/astryx-astro/docs/platform.md);
`pnpm -F astryx-astro check:baseline` verifies the list.

Dates and times use **Temporal**. Where it is missing (Safari today, and Node during server
rendering), [`temporal-polyfill`](https://github.com/fullcalendar/temporal-polyfill) (MIT,
about 23 KB gzipped, all 16 calendar systems) is imported on demand: only pages with date
components fetch it, and it installs no global. Date props take ISO strings as in Astryx, or
the matching Temporal value; events still carry Astryx's ISO strings.

```astro
---
import {Temporal} from 'astryx-astro/lib/temporal'; // native where available, else the polyfill
import DateInput from 'astryx-astro/components/DateInput/DateInput.astro';
import Timestamp from 'astryx-astro/components/Timestamp/Timestamp.astro';
---
<DateInput label="Start" value={Temporal.PlainDate.from('2026-11-08')} />
<Timestamp value={Temporal.Now.instant()} format="relative" />
```

| Component | Also accepts |
|---|---|
| Calendar, DateInput, DateRangeInput | `Temporal.PlainDate` (values, bounds, presets) |
| TimeInput | `Temporal.PlainTime` |
| DateTimeInput | `Temporal.PlainDateTime`, `Temporal.ZonedDateTime` |
| Timestamp, Timer | `Temporal.Instant`, `Temporal.ZonedDateTime` |
| Table, PowerSearch | Temporal values in rows and cells |

## Repository

| Path | What |
|---|---|
| `packages/astryx-astro` | The component library |
| `packages/astryx-astro/AGENTS.md` | Porting conventions (read before contributing) |
| `packages/astryx-astro/docs/handoffs.md` | Cross-component contracts, events and APIs |
| `packages/astryx-astro/docs/platform.md` | Browser features relied on: Required vs Enhancement |
| `packages/astryx-astro/scripts` | Token/theme/locale/syntax generation, docs manifest, index, conformance check |
| `apps/docs` | Documentation site: every component, every theme, light/dark |
| `tools` | Screenshot helper and the browser test suite (`tools/tests`) |

```sh
pnpm install
pnpm dev                                   # docs site
pnpm build                                 # build the docs
pnpm -F astryx-astro generate              # regenerate tokens, themes, locales, syntax, manifest, index
pnpm -F astryx-astro check:generated       # verify generated files are current
pnpm -F astryx-astro check:baseline        # every Required browser feature is Baseline
node packages/astryx-astro/scripts/conformance.mjs   # theme-hook contract (after a build)
node tools/tests/run-all.mjs               # browser test suite (after a build)
```

## Status

All 110 Astryx 0.7.9 components are ported; every one passes the theme-hook conformance
check and the browser suite covers their behaviour. Desktop, keyboard and screen-reader
behaviour target parity. Astryx's UIKit-style touch extras are deferred and listed in each
component's header comment: the coarse-pointer press controller, press-and-slide across action
groups, press-drag-release menus, swipe actions and wheel pickers. Plain touch use works.

One known engine difference: native Temporal (ICU4X) and the polyfill (the engine's `Intl` data)
put a few Chinese and Dangi month starts a day apart (Chinese New Year 2027 is Feb 6 natively,
Feb 7 polyfilled). The server renders with the polyfill, so in Chrome or Firefox a Chinese or
Dangi calendar can shift by a day in those months after client-side navigation.
