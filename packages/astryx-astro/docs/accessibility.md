# Accessibility

astryx-astro follows Astryx's markup, ARIA, keyboard behaviour and colours exactly, with the
exceptions on this page. Each Storybook story is checked with axe; every finding is either
fixed or listed here as kept, with its reason.

## Policy

- **Markup is fixed, colours are kept.** Where Astryx's own HTML or ARIA is invalid or leaves
  assistive tech without information it shows sighted users, the port deviates, and the
  component's header comment says so. Theme tokens, the syntax-theme palettes and the colour
  options stay exactly as Astryx ships them, low-contrast pairs included.
- **axe limitations.** Where axe flags something WCAG allows or that already reaches people, the
  component changes only if that helps someone (a Safari keyboard user, say); otherwise the
  finding is recorded on the stories it affects with `knownA11y()`
  (`apps/storybook/stories/_lib/story.ts`), so the Storybook check (`a11y.test: 'error'`)
  fails only on new problems.

## Deviations from Astryx

| Component | Astryx | Here | Why |
|---|---|---|---|
| Card (`height`), Layout content and panels, scrollable Stack / StackItem | No tabindex; the browser decides whether a scroll container is a Tab stop | While it overflows and holds nothing focusable, the region is a Tab stop with an inset focus ring (`behaviors/scrollKeyboard.ts`); an explicit tabindex (AppShell's main) wins | Chrome and Firefox make such regions focusable, Safari does not, so its keyboard users could not scroll them |
| ClickableCard with a blocked `href` | An `<a>` with no `href`, no role and an `aria-label` | `role="link"`, `aria-disabled="true"`, named by `label`; the card looks the same | `aria-label` is not allowed on a role-less element, and the link goes nowhere |
| Table tree rows | `aria-level` / `aria-expanded` on the `<tr>` of a table | `data-ax-tree-level` / `data-ax-tree-expanded`; the row's expander button keeps `aria-expanded` and its "Expand row" name | ARIA defines those row states only in a `treegrid`, which needs a cell keyboard model this table does not have. Nesting is shown by indent |
| TableCell with `scope` | `<td scope="row">` | `<th scope="row">`, styled like a data cell | HTML allows `scope` only on `<th>`; on a `<td>` the row had no header |
| ChatComposerDrawer toggle | Named "Expand Attachments" | Named "Expand 3 Attachments" when it shows its default summary | The count is shown but `aria-hidden`, so it never reached assistive tech |
| Step (optional) | The visible "Optional" is inside a button whose `aria-label` replaces it | The button is described by "Optional", before its description | Screen readers never heard that the step is optional |

## Kept findings

Recorded with `knownA11y()` on the stories they affect.

| Rule | Where | Reason |
|---|---|---|
| `color-contrast` | Disabled FileInput, Slider, Tokenizer, PowerSearch, Chat composer, ClickableCard, SelectableCard, interactive Token | Dimmed text of a disabled control. WCAG 1.4.3 exempts inactive components, and the control carries `aria-disabled`; axe cannot tie the surrounding text to it |
| `color-contrast` | Static disabled Token, disabled ProgressBar, Link and Timestamp `color="disabled"` | Astryx's disabled colour; colours are kept |
| `color-contrast` | SyntaxTheme presets (Solarized, Dracula, Nord, Tokyo Night, Catppuccin), Theme: Chocolate and Matcha supporting text in light mode | Palettes and generated themes as Astryx ships them; colours are kept |
| `label-content-name-mismatch` | TreeList | A tree item's text includes its nested group; it is named by its own label (`aria-labelledby`), as the WAI-ARIA tree pattern does. A row action's visible description is its `aria-describedby` |
| `label-content-name-mismatch` | Avatar, AvatarGroup | Initials abbreviate the name the avatar is announced by; its tooltip shows the full name |
| `label-content-name-mismatch` | Stepper | The name ("Go to step N: label", Astryx's string) contains the visible label; the description and Optional marker describe the button |
| `landmark-*` | AppShell and SideNav docs demos | The demos show six app shells and five side navs on one page; a page has one. Astryx gives every SideNav the same name |

## Checking

- `pnpm -F storybook test` runs axe on every story and fails on a violation that is not kept
  (`a11y.test: 'error'`); `pnpm -F storybook a11y` summarises the last run.
- Behaviour behind a deviation has a browser test in `tools/tests` (`scroll-keyboard`,
  `clickable-card`, `table`, `chat-tool-calls`, `stepper`).
- The Storybook checks run in light mode with the neutral theme.
