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
- **Platform first**: `popover`, `<dialog>`, CSS anchor positioning, `:has()`, `@scope`,
  `@starting-style`.

> Not affiliated with or endorsed by Meta. Astryx is MIT-licensed; see
> [`NOTICE`](NOTICE).

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

## Status

All 110 Astryx 0.7.9 components are ported; every one passes the theme-hook conformance
check and the browser suite covers their behaviour. Desktop, keyboard and screen-reader
behaviour target parity. Astryx's UIKit-style touch extras are deferred and listed in each
component's header comment: the coarse-pointer press controller, press-and-slide across action
groups, press-drag-release menus, swipe actions and wheel pickers. Plain touch use works.

Source, docs site and contribution guide: https://github.com/dbritto-dev/astryx-astro
