# Astryx → Astro port: architecture & planning report

Source: `~/astryx` (`@astryxdesign/core` 0.7.10 HEAD at analysis time), read-only static analysis. The port itself targets the installed **0.7.9** package (see AGENTS.md); differences between the two are minor. LOC = non-test `.tsx` lines per component directory, plus non-stylex `.ts` in parentheses when ≥200. Core totals: about 136k tsx and 53k ts.

**Headline facts that shape the port**
- **No JS positioner.**
  - Every overlay uses the **native Popover API** (`popover="auto"`/`"manual"`) or **native `<dialog>.showModal()`**.
  - Positioning is **CSS Anchor Positioning**: `anchor-name`, `position-anchor`, logical `position-area`, `position-try-fallbacks`, and generated `@position-try` rules.
  - Without the Popover API the code just toggles `display`; it never falls back to floating-ui.
- **Themes are pure CSS over a stable DOM contract.**
  - Each component paints a stable class `astryx-<kebab>` plus `data-<prop>="<value>"` reflection (`themeProps()`).
  - Theme CSS has the shape `@layer astryx-theme { @scope ([data-astryx-theme="x"]) to ([data-astryx-theme]) { .astryx-button[data-variant="secondary"]{…} } }`.
  - Emit the same ~270 target classes, data attributes and private `--_*` var names, and the shipped `@astryxdesign/theme-*/theme.css` works **unchanged**.
- **Runtime deps are tiny.**
  - Core's only dependency is `intl-messageformat`.
  - The Markdown parser, CodeBlock tokenizer and date/time math (PlainDate, calendar systems, parsers) are in-house pure TS with no React. They can be reused in Astro frontmatter and client JS.
  - The theme packages depend on `lucide-react`.
- **Much of the JS is touch fidelity to iOS UIKit.** This covers the gesture arena, springs, velocity filters, keyboard riding and slide-across press. That is about 27k LOC in `gestures/` (11k), `motion/` (14k) and `keyboard/` (2k), plus the `use*Press*` hooks. All of it can be deferred without losing desktop or keyboard behaviour.
- **React context is everywhere; Astro has none.** Size cascade, group disabled, FormLayout optionality, InputGroup labelling and layer content boundaries all rely on context. They need CSS `@scope … to …` cascades for visuals, and explicit props or slot-HTML stamping for semantics (§5).

---

## 1. Component inventory

Notation:
- **Renders/uses** = Astryx components it renders or whose hook it calls. `~X` = soft dependency (context, CSS contract or lazy-only).
- **JS** = none / light / heavy. "via X" means the JS comes from a dependency.
- **B#** = batch in §2.

Every component uses `themeProps` and `tokens.stylex`. 59 of them also use `useComponentTranslator` (intl-messageformat), which is not repeated per row.

| Name (sub-exports) | Category | Renders/uses | Client JS | Native element / ARIA | LOC tsx (+ts) | Notes / notable deps | B# |
|---|---|---|---|---|---|---|---|
| **AlertDialog** (useImperativeAlertDialog) | overlay | Button, Dialog, Heading, Layout, Stack, Text | heavy (via Dialog; native `<dialog>` covers trap/Esc) | `<dialog>`.showModal(), role=alertdialog; action row is an action group | 385 | imperative useImperativeAlertDialog | B4 |
| **AppShell** (useAppShellMobile) | layout | Layout, MobileNav, SideNav, TopNav | heavy: breakpoint swap, mobile drawer, main-overflow observer, scroll-key delegation | landmarks banner/main/navigation; Layout grid; MobileNav below a theme width point | 1.5k (+275 ts) | theme width points (sm..2xl); FLIP side-nav collapse (animatedLayout) | B9 |
| **AspectRatio** | layout | — | none | box with CSS aspect-ratio | 271 | — | B8 |
| **Avatar** (AvatarStatusDot) | data display | Link, Tooltip ; ~AvatarGroup | light: img error → initials fallback; tooltip | `<img>` or initials, role=img; optional `<a>`/`<button>` | 1.3k | — | B4 |
| **AvatarGroup** (AvatarGroupOverflow) | data display | VisuallyHidden ; ~Avatar | light: roving focus over overflow | role=group, overlapping stack, "+N" overflow button | 440 | AvatarGroupContext (size/overlap) | B4 |
| **Badge** | feedback | — | none | `<span>` | 277 | — | B2 |
| **Banner** | feedback | Button, Collapsible, Icon ; ~Layout | light: dismiss, expand (useCollapsible), slide-across action row on touch | in-flow `<div>`; caller supplies role=status/alert | 806 | edge compensation of action slots | B4 |
| **Blockquote** | typography | — | none | `<blockquote>` + optional citation | 97 | — | B2 |
| **BottomSheet** (BottomSheetSwitcher) | overlay | Layer ; ~Layout | heavy: drag-to-snap-points, stacking, keyboard avoidance, scroll lock | `<dialog>`.showModal() (scrim) or popover (no scrim); grab handle; ::backdrop | 3.8k (+4.5k ts) | UIKit springs/gestures; container-padding publisher | B5 |
| **Breadcrumbs** (BreadcrumbItem, BreadcrumbMenu*) | navigation | AppShell, DropdownMenu, Icon, Link, Popover | light (static); heavy only for the overflow menu | `<nav aria-label>` > `<ol>`; aria-current=page; overflow item = menu button | 923 | closes the AppShell mobile drawer on activate | B9 |
| **Button** | action | Icon, Layout, Link, Spinner, Tooltip, VisuallyHidden ; ~ButtonGroup, ~InputGroup, ~SizeContext | none (CSS :hover/:active); light: async Action/fire-once, tooltip, touch press | `<button type=button>` or `<a href>` (safeUrl); aria-busy, focusable aria-disabled | 1.0k | size cascade consumer; data-astryx-edge-comp (ghost); InputGroup addon marker | B3 |
| **ButtonGroup** | action | — ; ~SizeContext | light: roving tabindex, group disabled, touch slide-across | role=group; connected edges (one surface, one elevation) | 254 | size provider | B3 |
| **Calendar** (useCalendarDays) | selection | Button, Icon, VisuallyHidden | heavy: 2-D grid keyboard nav (useGridFocus), range selection | role=grid / row / columnheader / gridcell buttons | 1.5k (+1.4k ts) | in-house PlainDate + calendarSystem + Intl (non-Gregorian display) | B3 |
| **Card** | layout | — ; ~Layout | none | `<div>` surface; container-padding publisher (--astryx-card-padding*) | 339 | — | B1 |
| **Carousel** | media | Button, Icon, Layer ; ~SnapPaging | light: prev/next scrollBy, edge state (useScrollOverflow) | role=region aria-roledescription=carousel; slides role=group "N of M"; CSS scroll-snap | 858 | buttons overlaid via Layer (visual only) | B7 |
| **Center** | layout | — ; ~Layout | none | flex centering box | 238 | — | B1 |
| **Chat** (ChatComposer(+Drawer/Input/TokenElement), ChatDictationButton, ChatLayout(+ScrollButton), ChatMessage(+Bubble/List/Metadata), ChatSendButton, ChatSystemMessage, ChatTokenizedText, ChatToolCalls) | chat/content | Badge, Button, Divider, HoverCard, Icon, Layer, Popover, Spinner, VisuallyHidden | heavy: contenteditable composer, trigger menus, tokens, history, stream scroll, dictation | role=log list; composer role=textbox (contenteditable); trigger menu combobox/listbox (activedescendant) | 6.5k (+2.2k ts) | Web Speech API (dictation), Clipboard, AudioContext | B7 |
| **CheckboxInput** | selection | Field, FieldStatus, Indicator, Spinner, Tooltip | none (native); light: indeterminate property, touch press/box-hold | visually hidden `<input type=checkbox>` + Indicator; ring drawn on the indicator | 692 | — | B5 |
| **CheckboxList** (CheckboxListItem) | selection | CheckboxInput, Field, List, Tooltip ; ~Item | none | role=group of items via Field + List | 849 | Field-composed (FR10 prop targets) | B6 |
| **Citation** | chat/content | — | none | inline link/marker with source info | 290 | safeUrl | B6 |
| **ClickableCard** | action | Card, Link | light: whole-surface click delegation with nested interactives (useClickableContainer), or a CSS stretched link | Card + primary `<a>`/`<button>` | 503 | safeUrl; modifier/middle-click handling | B7 |
| **Code** | typography | — | none | `<code>` | 132 | — | B2 |
| **CodeBlock** (Code) | chat/content | Icon, IconButton | light: copy (Clipboard), expand/collapse | `<pre><code>` in role=group; copy `<button>` | 1.4k (+1.9k ts) | in-house tokenizer + grammars (~24 built-in languages, 9 opt-in modules); SyntaxTheme tokens | B8 |
| **Collapsible** (CollapsibleGroup, useCollapsible) | layout | Icon | light: toggle open (button + aria-expanded); group single/multiple | `<button aria-expanded aria-controls>` + region (display:none when closed) | 979 | FLIP height animation via motion/animatedLayout | B4 |
| **CommandPalette** (CommandPalette{Empty,Footer,Group,Input,Item,List}) | overlay | Dialog, Icon, Kbd, Layout, Selector, Spinner ; ~Field | heavy: combobox filtering, activedescendant nav, Dialog | `<dialog>`.showModal() + input role=combobox + listbox/option groups | 1.8k | uses Selector.useCombobox | B9 |
| **ComplexSelector** | selection | Field, Icon, Popover, Spinner | heavy: anchored popover (dialog), focus management | button role=combobox (aria-haspopup=dialog) + popover role=dialog | 999 | — | B5 |
| **ContextMenu** (ContextMenu{Item,CheckboxItem,RadioItem,RadioGroup,Group,Divider,SubMenu}) | overlay | Button, DropdownMenu, Heading, Icon, Layer | heavy: right-click/long-press at pointer, menu keyboard nav | popover=manual role=menu at fixed coords; local outside mousedown | 927 | Item rows; adaptive sheet on touch | B6 |
| **DateInput** | form input | BottomSheet, Button, Calendar, Field, Icon, IconButton, Layer, Popover, Spinner, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | heavy: segmented typed entry, calendar popover, touch wheels | typed field (text/segments) + Calendar in a manual popover; touch: native `<input type=date>` or wheel listbox; role=alert errors | 5.9k (+2.6k ts) | in-house calendarDateParser, PlainDate, Intl; UIKit picker motion | B8 |
| **DateRangeInput** | form input | Calendar, Field, Icon, Popover, Spinner, Tooltip, VisuallyHidden ; ~SizeContext | heavy: dual-month calendar popover + presets | trigger button + popover with 2 Calendars; presets role=group | 971 | — | B6 |
| **DateTimeInput** | form input | BottomSheet, Button, Calendar, DateInput, Field, Icon, IconButton, Layer, Popover, SegmentedControl, Spinner, Tooltip, VisuallyHidden ; ~SizeContext, ~TimeInput | heavy: date+time segments, popover, touch sheet | DateInput + time segments/listbox; SegmentedControl on touch | 4.3k | — | B8 |
| **Dialog** (DialogHeader, useImperativeDialog) | overlay | Button, Heading, Icon, Layer, Layout, Text | heavy per the taxonomy, but native `<dialog>` gives trap, top layer and Esc. JS: open sync, backdrop-press rule, scroll lock | `<dialog>`.showModal() (or inline); optional role=alertdialog; ::backdrop; @starting-style entry | 1.3k | container-padding publisher; ModalAnnounceProvider | B4 |
| **Divider** | layout | — | none | role=separator `<div>` (optional label) | 217 | bleed consumer (isFullBleed) | B1 |
| **Drawer** (DrawerHeader) | overlay | Button, Heading, Icon, Layer, Layout, Text | heavy (native-backed): showModal or showPopover, slide, backdrop press | `<dialog>`.showModal() (hasScrim) / popover=manual (no scrim); inline-start/end | 921 (+301 ts) | container-padding publisher | B4 |
| **DropdownMenu** (DropdownMenu{Item,CheckboxItem,RadioItem,RadioGroup,Group,Divider,SubMenu}) | overlay | BottomSheet, Button, Divider, Heading, Icon, Indicator, Item, Layer, Link, List, Popover, Spinner | heavy: anchored auto popover, menu roving + typeahead, submenus, press-drag-release | trigger aria-haspopup=menu + popover=auto role=menu; menuitem / menuitemcheckbox / menuitemradio; submenus popover=manual | 5.1k (+570 ts) | adaptive BottomSheet presentation on touch | B6 |
| **EmptyState** | feedback | — | none | `<div>` icon + heading + description + actions; announces its rendered text | 212 | — | B5 |
| **Field** (FieldLabel, InputClearButton, PanelSearchInput) | form input | Button, FieldStatus, Icon, InfoTip, Text, VisuallyHidden ; ~FormLayout, ~InputGroup | none; light: clear button, char count | `<label for>`, description, status; aria-describedby wiring | 1.2k (+434 ts) | FR10 prop routing; aware of FormLayout and InputGroup | B5 |
| **FieldStatus** | feedback | Icon | none (persistent live regions rendered SSR) | assertive (error) / polite live regions; attached/detached message box | 263 | — | B2 |
| **FileInput** | form input | Field, Icon, Spinner, Tooltip, VisuallyHidden | light: drag-and-drop dropzone, file list, validation announce | hidden `<input type=file>` + button or dropzone | 1.0k | Intl.ListFormat | B5 |
| **FormLayout** | layout | — | none | grid/flex form arrangement (vertical / horizontal / horizontal-labels) | 179 | FormLayoutContext (direction, defaultOptionality) | B2 |
| **Grid** (GridSpan) | layout | — | none | CSS grid (fixed, or minWidth/max auto-fill) | 591 | — | B1 |
| **HStack** | layout | Stack | none | flex row | 89 | — | B1 |
| **Heading** | typography | Text | none (light: truncation tooltip) | `<h1>`–`<h6>` by level; type axis | 341 | theme-extensible type axis | B1 |
| **HoverCard** (useHoverCard) | overlay | Layer | heavy: anchored manual popover, hover-intent delays, focus/touch triggers | popover=manual, CSS anchor positioning; trigger aria-expanded | 1.3k | — | B3 |
| **Icon** (useIcon) | media | — | none | `<svg>` (inside `<span>` for named icons); aria-hidden, or role=img + aria-label | 1.4k | theme icon registry (themes use lucide-react); componentIcons slots | B1 |
| **IconButton** | action | Button | none (as Button) | square `<button aria-label>` | 55 | — | B3 |
| **Indicator** (CheckIndicator, CheckboxIndicator, RadioIndicator) | utility | Icon | none | decorative `<svg>` marks: check / checkbox box / radio | 634 (+358 ts) | replaceable per theme via defineTheme({indicators}) | B2 |
| **InfoTip** | feedback | Icon, Tooltip | via Tooltip (pinnable on press) | `<button aria-label>` "i" + Tooltip | 221 | — | B3 |
| **InputGroup** (InputGroupText) | form input | Field ; ~SizeContext | none | role=group connected row; members drop their own outer radius/border | 352 | size provider | B5 |
| **Item** | data display | Link | none (static); light: href/onClick rows; heavy: swipe actions (touch) | row primitive `<div>`/`<button>`/`<a>` with start/label/description/end | 1.5k (+725 ts) | Item inset var (--_item-inset-inline); list-row press layer | B4 |
| **Kbd** | typography | — | none (light: Apple vs other modifier glyphs) | `<kbd>` key badges | 232 | isApplePlatform | B3 |
| **Layer** (LayerProvider, LayerDepthProvider, useLayer, re-exports Popover/Tooltip/HoverCard) | utility | — ; ~Layout | heavy: positioning runtime, popover lifecycle, dismissal stack, outside press | Popover API + CSS anchor positioning; `<template>` marker for corrective portals | 2.5k (+4.5k ts) | no JS positioner | B2 |
| **Layout** (LayoutHeader, LayoutContent, LayoutFooter, LayoutPanel, re-exports Stack/Section/Card) | layout | — ; ~Resizable, ~Stack | none; heavy only for resizable panels | 5-slot grid (header/start/content/end/footer); optional landmark roles; LayoutContent owns scrolling | 1.5k | owner of the container/layout padding protocol | B1 |
| **Lightbox** (useLightbox) | media | Icon, IconButton, Layer ; ~Layout | heavy: gallery nav, pinch/double-tap zoom, swipe, focus trap | `<dialog>`.showModal(); `<img>`/`<video>` | 1.2k (+1.3k ts) | UIKit zoomMedia/coast/gestures | B3 |
| **Link** (LinkProvider, useLinkComponent) | navigation | Icon, Text, Tooltip, VisuallyHidden | none | `<a href>` (safeUrl-gated); external icon; LinkProvider router swap | 796 | useLinkComponent seam | B3 |
| **List** (ListItem) | data display | CheckboxInput, Item | none | `<ul>`/`<ol>` + ListItem (Item); density/dividers/edge | 947 | edge=outset/bleed consumer | B6 |
| **Markdown** | chat/content | Blockquote, Button, CheckboxList, Citation, CodeBlock, Icon, Link, List, Table | none (SSR render); light: copy buttons, streaming reveal | HTML via Astryx components; role=document | 2.9k (+11.5k ts) | in-house parser (parser.ts ~5.3k LOC, pure TS) + plugins; optional remark adapter; math via a caller component | B8 |
| **MetadataList** (MetadataListItem) | data display | — | light: "show more" collapse | `<dl>` (columns/orientation) | 573 | — | B6 |
| **MobileNav** (MobileNavToggle) | navigation | AppShell, Button, Heading, Icon, Layer ; ~Layout | heavy (native-backed): drawer dialog, focus trap, scroll lock | `<dialog>`.showModal() side drawer containing `<nav>` | 909 | AppShell mobile context | B9 |
| **MoreMenu** | action | DropdownMenu, Icon ; ~SizeContext | via DropdownMenu | IconButton (moreHorizontal) + DropdownMenu | 191 | — | B6 |
| **MultiSelector** | selection | Badge, CheckboxInput, Divider, Field, Icon, Layer, Selector, Spinner, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | heavy: multi-select listbox popover, search, keyboard highlight | button role=combobox + listbox (aria-multiselectable) of checkbox options; search row | 2.8k (+414 ts) | — | B7 |
| **NavIcon** | navigation | — | none | decorative circular icon container | 93 | — | B9 |
| **NavItem** | navigation | — | none (style module only) | shared nav-row StyleX styles (navItemStyles.stylex.ts) | 0 | no component | B9 |
| **NavMenu** (NavHeadingMenu, NavHeadingMenuItem) | navigation | DropdownMenu, Link, Text | heavy: menu roving focus, typeahead, press-drag | role=menu / menuitem in nav heading popovers | 517 | — | B7 |
| **NumberInput** | form input | Field, Icon, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | light: spinbutton keys, stepper press-and-hold, locale parse/format | `<input type=text role=spinbutton>` + stepper `<button>`s + hidden `<input>` for the form value | 1.4k (+468 ts) | unicodeDigits / locale-aware parsing | B5 |
| **Outline** (useOutlineFromMarkdown) | navigation | Link ; ~Markdown | light: scroll-spy, sliding indicator | `<nav>` > `<ul>` of anchor links; aria-current | 485 (+649 ts) | parseOutlineFromMarkdown | B8 |
| **OverflowList** | layout | — | light: measure and hide overflowing items (ResizeObserver) | flex row + "+N" indicator | 420 | computeOverflow pure helper | B2 |
| **Overlay** (useOverlay) | media | — | none/light: CSS :hover/:focus-within reveal; JS only in controlled mode | scrim over a media/card surface (not top layer) | 686 | MediaTheme inverted surface | B7 |
| **Pagination** | navigation | Button, Icon, NumberInput, Selector, Text | light: page state/keys (none if links) | `<nav>` + buttons; page-number radiogroup variant; NumberInput/Selector variants | 923 | — | B7 |
| **Popover** (usePopover) | overlay | Button, Layer ; ~BottomSheet, ~InteractiveRoleContext, ~Layout | heavy: anchored popover=auto, focus trap/return, adaptive sheet | trigger button (aria-haspopup=dialog, aria-expanded) + popover=auto role=dialog; CSS anchor positioning | 1.8k (+740 ts) | UIKit popover grow motion; BottomSheet on compact touch | B4 |
| **PowerSearch** (PowerSearchFilterEditor, PowerSearchToken) | form input | Avatar, BottomSheet, Button, DateInput, DateRangeInput, EmptyState, Field, HStack, Heading, Icon, IconButton, Indicator, List, NumberInput, Popover, RadioList, Selector, Stack, Text, TextInput, TimeInput, Token, Tokenizer, Tooltip, TreeList, Typeahead ; ~Layout, ~SizeContext | heavy: filter-token bar, field typeahead, value editors in popovers | role=searchbox input + tokens + edit popovers/sheet | 6.7k (+2.3k ts) | date/number/list value editors | B9 |
| **ProgressBar** | feedback | Tooltip, VisuallyHidden | none (CSS fill); light: tooltip, min-length measure | role=progressbar (aria-valuenow/min/max) or indeterminate | 831 | UIKit progress timing | B4 |
| **RadioList** (RadioListItem) | selection | Field, Indicator, Item, Tooltip | none (native radios) | role=radiogroup + `<input type=radio>` + Indicator | 920 | Field-composed | B5 |
| **Resizable** (ResizeHandle, useResizable, createResizable) | layout | — | heavy: pointer drag + keyboard resize, persistence, collapse | role=separator (aria-valuenow/min/max, aria-controls) pill grip | 768 (+2.7k ts) | framework-free createResizable core | B2 |
| **ScrollableArea** (useScrollableArea) | layout | — ; ~Layout | light: tabindex only while scrollable, live edge state | overflow container (logical axes) | 264 | container-padding participant (isFullBleed) | B2 |
| **Section** | layout | — ; ~Layout | none | `<section>`/`<div>` painted region; divider edges | 365 | container-padding publisher + consumer (--astryx-section-padding*) | B1 |
| **SegmentedControl** (SegmentedControlItem) | selection | Tooltip ; ~SizeContext | light: radiogroup roving + sliding indicator; heavy only for touch drag | role=radiogroup of `<button role=radio>`; selected indicator | 816 (+2.0k ts) | size consumer; UIKit segmented spring | B6 |
| **SelectableCard** | selection | Card | none (CSS :has(:checked)) | card with a visually hidden `<input type=checkbox/radio>` | 615 | — | B7 |
| **Selector** (SelectorOption, useCombobox) | selection | Divider, DropdownMenu, Field, Heading, Icon, Indicator, Item, Layer, Popover, Section, Spinner, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | heavy: listbox popover, activedescendant, typeahead, search row | `<button role=combobox aria-haspopup=listbox>` + popover=auto listbox/option | 2.6k (+1.1k ts) | size consumer; adaptive sheet | B7 |
| **SideNav** (SideNav{CollapseButton,Heading,Item,Section}) | navigation | AppShell, Button, DropdownMenu, Icon, Link, MobileNav, Popover, Resizable, Tooltip, VisuallyHidden ; ~NavItem, ~NavMenu, ~SizeContext | heavy: collapsible rail, flyout popovers/menus, resizable, mobile handoff | `<nav>` rail; items role=link/menuitem; collapsed flyouts | 3.5k (+342 ts) | NavItem styles; Resizable | B9 |
| **Skeleton** | feedback | — | none | aria-hidden shimmer block (CSS animation) | 252 | — | B2 |
| **Slider** | form input | Field, Tooltip, VisuallyHidden | heavy: pointer drag, keyboard steps, range thumbs, marks | div[role=slider] thumbs (+ hidden `<input>` for forms); role=group for ranges | 1.9k (+1.4k ts) | UIKit slider motion | B5 |
| **SnapPaging** (useSnapPaging) | utility | — | heavy (UIKit paging physics) / light with CSS scroll-snap | hook only, no DOM | 0 (+497 ts) | createPager framework-free core | B7 |
| **Spinner** | feedback | Text | none (CSS rotation) | `<svg>` role=progressbar/status with label; announces | 596 | — | B2 |
| **Stack** (StackItem, re-exports HStack/VStack) | layout | — ; ~Layout | none | flex column/row with SpacingStep gap/padding | 473 | — | B1 |
| **StatusDot** | feedback | Tooltip | none (tooltip optional) | `<span role=img aria-label>` | 257 | — | B9 |
| **Stepper** (Step) | navigation | Icon, IconButton, VisuallyHidden | light: step buttons, connector measure | `<ol>` of steps; aria-current=step | 2.5k | density context | B6 |
| **Switch** | selection | Field, FieldStatus, Spinner, Tooltip | none (native checkbox); heavy only for touch thumb drag | `<input type=checkbox role=switch>` | 1.1k (+1.4k ts) | UIKit switch springs | B5 |
| **TabList** (Tab, TabMenu) | navigation | DropdownMenu, Icon, Layout, Link, Popover ; ~SizeContext | light to heavy: tablist roving focus, overflow TabMenu, indicator | role=tablist/tab (opt-in) or `<nav>` of links; overflow menu (menuitemradio) | 1.7k | size consumer; bleed (isFullBleed → edge) | B7 |
| **Table** (TableBody/Cell/Footer/Header/HeaderCell/Row, TableSelectionToolbar, useTable* plugins) | data display | Button, CheckboxInput, ContextMenu, DateInput, EmptyState, Icon, MultiSelector, NumberInput, Pagination, Popover, Selector, Text, TextInput, TimeInput, Tokenizer, Toolbar, Tooltip, VisuallyHidden | none (static); heavy with plugins: sort, select, resize, sticky, tree, filter, grouping, pagination | `<table>`/`<thead>`/`<tbody>`; aria-sort; selection checkboxes; resize separators | 10.5k (+2.0k ts) | plugin hooks (useTable*); bleed consumer | B8 |
| **Text** | typography | — | none (light: truncation detection → tooltip) | `<span>`/`<p>`/… (as) with type-based tokens | 347 | — | B1 |
| **TextArea** | form input | Field, Icon, Spinner, Tooltip ; ~SizeContext | none (light: char count) | `<textarea rows>` | 745 | Field-composed | B5 |
| **TextInput** | form input | Field, Spinner, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | none (light: clear, char count) | `<input>` (text/email/search/…) | 632 | Field-composed; iOS 16 px focus-zoom floor | B5 |
| **Thumbnail** | media | Button, Icon, Skeleton, Spinner, Tooltip | light: remove/retry actions, reveal on hover | square `<button>`/`<img>` + Skeleton/Spinner states; role=group | 570 | — | B6 |
| **TimeInput** | form input | BottomSheet, Button, DateInput, DateTimeInput, Field, Icon, Spinner, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | heavy: segmented typed time, listbox popover; native picker on touch | typed segments / native `<input type=time>` on touch; listbox | 1.8k (+352 ts) | timeParser/timeFormat (locale hour cycle) | B8 |
| **Timer** | data display | Text | light: interval-driven DOM text updates | `<time>` elapsed/stopwatch | 259 | — | B8 |
| **Timestamp** | data display | HoverCard, Icon, IconButton, Text, VisuallyHidden | light: live relative updates, copy in HoverCard | `<time datetime>` + HoverCard multi-zone rows (`<dl>`) | 812 (+586 ts) | Intl.DateTimeFormat/RelativeTimeFormat, Clipboard | B8 |
| **Toast** (ToastViewport, useToast) | feedback | Button, Icon, Layer | heavy: imperative queue, timers, stacking, swipe, top-layer handoff into open modals | viewport popover=manual role=region; rows role=status / role=alert | 1.6k (+618 ts) | createToastQueue; react-dom/client root when there is no provider | B4 |
| **ToggleButton** (ToggleButtonGroup) | action | Button | light: aria-pressed toggle; group selection | `<button aria-pressed>`; ToggleButtonGroup role=group | 646 | — | B3 |
| **Token** | data display | Icon, Link | none (light: remove/click) | `<span>`/`<button>`/`<a>` chip + remove `<button>` | 757 | 11 colors, 3 sizes | B3 |
| **Tokenizer** | selection | BottomSheet, Button, EmptyState, Field, Icon, Indicator, Layer, OverflowList, Spinner, Text, Token, Tooltip, Typeahead, VisuallyHidden ; ~SizeContext | heavy: typeahead + token chips + overflow + touch sheet | input role=combobox + role=list of tokens + listbox | 3.1k | BaseTypeahead engine | B8 |
| **Toolbar** | action | Section ; ~Layout, ~SizeContext | light: roving focus | role=toolbar with start/center/end lanes over Section | 396 | size provider; edge compensation | B3 |
| **Tooltip** (useTooltip) | overlay | Layer | heavy: anchored manual popover, hover/focus/touch triggers, keep-clear fallbacks | popover=manual role=tooltip; trigger aria-describedby; CSS anchor positioning | 1.4k | touchTrigger auto/pin | B3 |
| **TopNav** (TopNav{Heading,Item,Menu,MegaMenu,MegaMenuItem,MegaMenuFeaturedCard}) | navigation | AppShell, Divider, DropdownMenu, Grid, Icon, Link, MobileNav, Popover ; ~NavItem, ~NavMenu | heavy: menus, mega menu, mobile handoff | `<header>`/`<nav>` bar; menus (role=menu); mega menu role=group | 3.2k | NavItem styles | B9 |
| **TreeList** (TreeListItem) | data display | Icon, Link | heavy: APG tree keyboard (useTreeFocus), expand/collapse | role=tree / treeitem / group (or link rows) | 1.6k | branch lines; FLIP expand | B6 |
| **Typeahead** (BaseTypeahead, TypeaheadItem) | selection | Field, Icon, Layer, Popover, Spinner, Token, Tooltip, VisuallyHidden ; ~InputGroup, ~SizeContext | heavy: async search, combobox listbox, outside-press watch | `<input role=combobox aria-autocomplete=list>` + popover=manual listbox (activedescendant) | 3.1k (+239 ts) | BaseTypeahead engine | B5 |
| **VStack** | layout | Stack | none | flex column | 88 | — | B1 |
| **VisuallyHidden** | utility | — | none | sr-only `<span>` | 142 | — | B1 |

**Contexts (no DOM)**

| Name | Provides | Consumers | Astro translation |
|---|---|---|---|
| **SizeContext** (`useSize`, `SizeProvider`; 53 ts) | `'sm'\|'md'\|'lg'\|null`, resolved explicit → nearest provider → default | Providers: ButtonGroup, InputGroup, Toolbar, SideNav footer. Consumers: Button, ButtonGroup, InputGroup, TextInput, TextArea, NumberInput, Selector, MultiSelector, Typeahead, Tokenizer, DateInput, DateRangeInput, DateTimeInput, TimeInput, SegmentedControl, TabList, MoreMenu, PowerSearch | `data-astryx-size` on the provider + an `@scope` CSS cascade (§5) |
| **InteractiveRoleContext** (53 ts) | Role override (`'button'`) for optionally interactive trigger children | Triggers of Popover and DropdownMenu; read by Link, Token, Thumbnail via useInteractiveRole | The trigger slot must be a real `<button>`; otherwise a `role` prop |
| Component-local contexts | AvatarGroup, ButtonGroup, InputGroup (+Internal), FormLayout, CollapsibleGroup, List, TabList, SegmentedControl, Stepper, Chat, Table, DropdownMenu, AppShellMobile, Layout Area/Slots/Divider, IconDefaultSize, AvatarSize, Layer/LayerDepth | — | §5 "context-free cascade" |

Some directories are infrastructure rather than components:
- `Layer`: positioning and dismissal runtime.
- `NavItem`: StyleX styles only.
- `SnapPaging`: a hook only.
- `Resizable`: hook, ResizeHandle and createResizable.

---

## 2. Dependency-ordered batch plan

I checked the order with a script over the import graph. No batch has a hard dependency (a rendered component or a used hook) on a later batch. Soft dependencies were excluded from the check and are deferred explicitly below. The plan covers 107 components (contexts excluded), pulls heavy components as early as their dependencies allow, and uses dependency-free light components to fill the later batches.

**B0 (prerequisite, not counted): shared infrastructure**
- Stylesheets:
  - `reset.css`.
  - Token CSS (`tokens.stylex.ts` → `:root` vars).
  - The `@layer reset, astryx-base, astryx-theme` order.
- Theming: theme CSS loader and compiler adapter, `themeAttrs()` helper.
- Shared CSS: focus ring and interaction-overlay CSS, size/density `@scope` cascades.
- Helpers: i18n `t()`, icon registry, `safeUrl`.
- Client runtime singletons:
  - `modality`, `announce`, `layer-stack`.
  - `anchor`, `roving`, `typeahead`.
  - A shared ResizeObserver.

| Batch | Name | # | Components | Heavy |
|---|---|---|---|---|
| B1 | Foundations: type, icons, layout primitives | 13 | Icon, Text, Heading, VisuallyHidden, Stack, HStack, VStack, Grid, Center, Divider, Section, Card, Layout | — |
| B2 | Layer runtime & static status | 12 | Layer, Resizable, Spinner, Skeleton, Badge, Indicator, FieldStatus, FormLayout, ScrollableArea, OverflowList, Code, Blockquote | Layer, Resizable |
| B3 | Anchored hints & core actions | 13 | Tooltip, HoverCard, InfoTip, Link, Button, IconButton, ToggleButton, ButtonGroup, Toolbar, Token, Kbd, Calendar, Lightbox | Tooltip, HoverCard, Calendar, Lightbox |
| B4 | Popover, modal surfaces & notices | 11 | Popover, Dialog, AlertDialog, Drawer, Toast, Banner, Collapsible, ProgressBar, Item, Avatar, AvatarGroup | Popover, Toast (+ Dialog, AlertDialog, Drawer, native-backed) |
| B5 | Form fields & first comboboxes | 14 | Field, InputGroup, TextInput, TextArea, NumberInput, CheckboxInput, RadioList, Switch, FileInput, Slider, Typeahead, ComplexSelector, EmptyState, BottomSheet | Slider, Typeahead, ComplexSelector, BottomSheet |
| B6 | Menus, lists & range picking | 12 | List, CheckboxList, DropdownMenu, MoreMenu, ContextMenu, TreeList, DateRangeInput, SegmentedControl, MetadataList, Stepper, Citation, Thumbnail | DropdownMenu, ContextMenu, TreeList, DateRangeInput |
| B7 | Selection, tabs & chat | 11 | Selector, MultiSelector, NavMenu, TabList, Pagination, Chat, Carousel, SnapPaging, ClickableCard, SelectableCard, Overlay | Selector, MultiSelector, NavMenu, Chat, SnapPaging (TabList medium) |
| B8 | Date/time, tokens, table & content | 11 | DateInput, TimeInput, DateTimeInput, Tokenizer, Timestamp, Timer, CodeBlock, Table, Markdown, Outline, AspectRatio | DateInput, TimeInput, DateTimeInput, Tokenizer, Table plugins |
| B9 | App shell & compositions | 10 | MobileNav, SideNav, TopNav, AppShell, Breadcrumbs, NavIcon, NavItem, CommandPalette, PowerSearch, StatusDot | MobileNav, SideNav, TopNav, AppShell, CommandPalette, PowerSearch |

Deferrals and caveats:
- **Layout (B1)** soft-depends on Resizable (B2): `LayoutPanel resizable` is wired up in B2.
- **Popover (B4)** soft-depends on BottomSheet (B5) for the adaptive compact-touch presentation. Ship the popover-only path first and add the sheet path (`presentation` prop) in B5. The same deferral applies to DropdownMenu, Selector, Tokenizer and DateInput.
- **AppShell / MobileNav / SideNav / TopNav / Breadcrumbs** form a cycle through AppShell's mobile context (`useAppShellMobile`, `useCloseMobileDrawerOnActivate`). Port them together in B9 and turn the context into an attribute and event contract: AppShell sets `data-astryx-shell-mobile`, and nav items dispatch `astryx:navigate`, which closes the drawer.
- **Table (B8).**
  - The core (BaseTable plus Header/Row/Cell, static rendering) needs no JS.
  - The plugins are the heavy part: sort, selection, column resize, sticky columns, filtering with DateInput/MultiSelector/Tokenizer editors, grouping, tree, pagination, row expansion and row status.
  - The plugins can be split into a B9b sub-batch.
- **Touch-only extras** can land after B9: slide-across action groups, press/box-hold, Switch thumb drag, Item swipe actions, wheel pickers and keyboard riding.

---

## 3. Shared internals → vanilla translation

### 3a. `hooks/` (≈16.7k LOC)
| Module | What it does | Used by | → Astro / vanilla |
|---|---|---|---|
| useMergedRefs, useIsomorphicLayoutEffect, useIsHydrating, useRenamedProp, useDevWarning, useAttachment, useSettledOpen | React plumbing: ref merging, layout effects, hydration flag, prop renames, dev warnings, element attach/detach, "open since mount" | many | Drop. Custom-element connected/disconnected callbacks replace attach. Dev warnings go in frontmatter behind `import.meta.env.DEV`. `@starting-style` replaces useSettledOpen |
| useFocusTrap (+EscapeShim) | Tab containment; joins the Escape stack via onEscape | Dialog, Drawer, BottomSheet, Lightbox, MobileNav, Popover, DropdownMenu, SideNav | Modals: native `showModal()` (outside becomes inert). Popover dialogs: a small trap only when `aria-modal`. Menus use roving focus, not a trap |
| useListFocus | 1-D roving tabindex (arrows, Home/End, RTL, wrap, orientation) | Toolbar, ButtonGroup, TabList, SegmentedControl, DropdownMenu, ContextMenu, NavMenu, TopNav, Breadcrumbs, Pagination, AvatarGroup, PowerSearch | One shared `roving.js` driven by a `data-astryx-roving` attribute |
| useGridFocus / useTreeFocus | 2-D grid keyboard (Calendar) / APG tree keyboard (TreeList) | Calendar / TreeList | `grid-focus.js` / `tree.js` |
| useTypeahead | Type-to-select | menus, Selector, MultiSelector, NavMenu, TopNav, Breadcrumbs | `typeahead.js`; port the pure `utils/typeaheadMatch` |
| useMenuPress, menuPressGesture (pure reducer), menuPressMarker, menuPressValues, menuPressOnItems | Press-drag-release menus with edge autoscroll | DropdownMenu, ContextMenu, Selector, TabList, NavMenu, TopNav, SideNav, Breadcrumbs | v1: click and keyboard only. v2: port the pure `menuPressStep` reducer into `menu.js` |
| useMenuHover | Hover-opened nav menus with a native invoker link | DropdownMenu submenus, TopNav, SideNav | `menu-hover.js`; progressive `interestfor` |
| actionGroupTracker, useActionGroupTracking, useGroupPressTracking, pressGroupContext | Touch slide-across press over sibling actions | AlertDialog, ButtonGroup, ToggleButtonGroup, Toolbar, SegmentedControl, Banner/Toast rows | Optional `press-group.js` for coarse pointers; defer |
| usePressFeedback | Touch press controller writing `data-astryx-press=on\|fading` | 27 pressables | CSS `:active`; optional `press.js` for coarse pointers |
| useLongPress, longPressDetector | Long press (framework-free `createLongPressDetector`) | ContextMenu, useMenuPress | Port the core |
| useAnnounce, modalAnnounce, ModalAnnounceProvider | Polite and assertive live regions, routed into the open native modal | 21 components + modals | `announce()`: render body regions plus one region inside each `<dialog>`; target `dialog:modal` first |
| useAnnounceRenderedText, AnnounceRenderedText | Announce an element's rendered text | Spinner, Tooltip, comboboxes, Chat, CommandPalette, PowerSearch, EmptyState | `announceText(el)`; `data-astryx-announce` |
| useBusyAnnouncement | Announce each busy start once | 17 | Announce when `aria-busy` flips |
| useClickableContainer | Whole-surface activation that skips nested interactives, handles modifier/middle click, applies safeUrl | ClickableCard, SelectableCard, Item, Token, TreeList, Table, Toast, Tokenizer, Overlay, FileInput | CSS stretched link (`a::after{inset:0}`); otherwise a delegated `<astryx-clickable>` element |
| useInputContainer | Click on the control box focuses the input | Field, TextInput, TextArea, NumberInput, TimeInput, DateTimeInput | Wrap in `<label>`, or a delegated pointerdown that calls `input.focus()` |
| useInputStatusIcon | Status icon + tooltip + describedby | 9 inputs | SSR markup |
| useIndicatorFocusRing | Draw the ring on the indicator | CheckboxInput, RadioList | CSS `:has(input:focus-visible) .indicator` |
| useResolvedRequired | `aria-required` from FormLayout optionality | 15 inputs | Explicit prop or slot stamping (§5) |
| useInteractiveRole | Picks div, button or link | Link, Token | Decide from props in frontmatter |
| useScrollLock, rootScrollStyles, scrollbarGutter, scrollLockTouchGuard | Page scroll lock behind modals | Dialog, Drawer, BottomSheet, Lightbox, MobileNav | CSS `:root:has(dialog:modal){overflow:hidden;scrollbar-gutter:stable}` + `overscroll-behavior:contain` |
| useScrollableArea, scrollGeometry, scrollKeyboardDelegation, scrollOwnerRegistry, useScrollRegionProps, StackItemScrollRegion | Logical scroller, tabindex while overflowing, edge flags | ScrollableArea, CodeBlock, Table, BottomSheet, Layout, StackItem, AppShell | `<astryx-scroll-area>` (ResizeObserver toggles tabindex and `data-at-start/end`); `animation-timeline: scroll()` for edge fades |
| useScrollOverflow | Edge overflow flags | Carousel, TabList | Same element / scroll-driven CSS |
| useOverflow, computeOverflow (pure) | Fit N items + "+N" | OverflowList, Tokenizer | Port computeOverflow + ResizeObserver |
| useHighlightedOptionScroll | Keep the active option in view | comboboxes, Chat | `scrollIntoView({block:'nearest'})` |
| useKeyboardHighlight, useFocusReturnVisibility | Modality-aware highlight and ring after focus return | Selector, MultiSelector, DropdownMenu | Read `modality.js` |
| useKeyboardHint | Ephemeral arrow-key hint | SegmentedControl, TabList, Toolbar | Drop in v1 |
| useAdaptivePresentation | Popover vs sheet under compact + coarse; the `presentation` prop wins | Popover, DropdownMenu, ContextMenu, Selector, MultiSelector, Tokenizer, PowerSearch | `presentation` prop + CSS media restyle of the same popover element |
| useMediaQuery | matchMedia | 14 | CSS media queries / `matchMedia` |
| usePager (createPager) | UIKit-style paging | SnapPaging | CSS scroll-snap |
| useAnimatedLayout | FLIP size changes | AppShell, public | `interpolate-size: allow-keywords` / View Transitions |
| useAnimator, useDragToSnapPoints, usePanGesture | React faces of createAnimator / createDragToSnapPoints / createPanGesture | public | Use the framework-free cores |
| useEntryAnimation | Mount-only entry animation | FieldStatus | `@starting-style` |
| useContainerReveal, containerReveal.stylex | Hover/focus reveal with dwell | Thumbnail, Markdown | CSS `:hover`/`:focus-within` + `transition-delay` |
| useClipboard | Copy + timed "copied" state | CodeBlock, Timestamp, Markdown | `<astryx-copy>` |
| useStreamingText | Smooths streamed text | Markdown | Client streaming only |
| useHotkeys | Global shortcuts | public | `hotkeys.js` |
| useImageMode, useAutoMediaMode | Image luminance for MediaTheme auto | MediaTheme | Optional |
| focusableSelector, isRtlElement | Selector constant; computed direction | traps, roving | Copy; `el.matches(':dir(rtl)')` |

### 3b. `utils/` (≈12.5k LOC)
| Module | What it does | Used by | → Astro / vanilla |
|---|---|---|---|
| themeProps, parseStyleKey | `astryx-<name>` class + data-* reflection; theme style key → selector | ~96 components; theme compiler | `themeAttrs()` helper; reuse parseStyleKey in the theme adapter |
| focusOutline.stylex | The one ring definition (`--focus-outline-*` longhands) with variants: `:focus-visible`, `:has(:focus-visible)`, `:has(> :first-child:focus-visible)`, `:has(> [role=combobox]:focus-visible)`, suppressed | 48 | Global CSS utilities; keep longhands so variants can recolor |
| interactionOverlay.stylex | Hover and pressed overlay paint (`--color-overlay-hover/-pressed`, as bg-color or a gradient layer), disabled guard `:where(:not(:disabled,[aria-disabled=true]))`, `(hover:hover)` gating, coarse-pointer arms via `--astryx-press-alpha` | 28 | Shared CSS mixin, or a `::before` overlay layer |
| pressFeedback, pressGesture, pressClaim, pressDisabled, boxHold, browserClickWait, clickGuard | Touch press controller; swallows the click after a gesture | pressables, Switch, CheckboxInput, RadioList, menus | Optional `press.js`, else drop |
| interactionModality, inputStream | Last-input modality; shared input-listener hub | 21 / 13 | `modality.js` → `<html data-astryx-modality>` |
| touchPresentation(+stylex), touchQueries, coarsePointer | Touch / compact / iOS gates (compact = width < md or height < 500) | 17 | Media queries |
| hitArea, touchHitArea(+stylex) | 44 px coarse-pointer hit areas, clamped against neighbours | CheckboxInput, RadioList, List, InfoTip, SegmentedControl, ButtonGroup, Switch | `::before` negative inset under `(pointer:coarse)`; drop the clamping |
| disabledInteraction | aria-disabled controls cancel click and Enter/Space (AST-085) | 16 | One capture-phase document listener |
| safeUrl | Blocked schemes (`javascript:`, `vbscript:`, `data:text/html`) | Link, Citation, Markdown, TopNav, clickable containers | Run **server-side** for every href; a rejected href becomes an inert element |
| focusReturn, isFocusDetached, useFocusAcrossSwap, useFocusLeavingChange | Focus return without scroll; keep focus across swaps and collapses | overlays, Collapsible, TreeList, SideNav, Layout | `opener.focus({preventScroll:true})` |
| plainDate, calendarSystem, calendarDateParser, dateParser, dateTypes, timeParser, timeFormat, unicodeDigits, standaloneMonthCapitals | Pure date/time/number logic | date components, Timestamp, NumberInput, Table | **Port verbatim** |
| characters | Grapheme-aware counting and truncation | Avatar, TextArea, PowerSearch, Table | Port (`Intl.Segmenter`) |
| inputAria, inputPresentation | ARIA id composition; picker surface choice | inputs | Astro helper; presentation becomes a prop |
| ime | `isImeKeyEvent` | 11 | Copy into key handlers |
| accessibleName, getNodeText, groupItems, getKey, isRenderable | Accessible name, text content, option grouping, list keys, slot emptiness | menus, Table, Toast, CommandPalette | Port accessibleName and groupItems; `Astro.slots.has()` |
| mergeProps, mergeRefs, chain/composeEventHandlers, types | Prop composition | 74+ | Drop (`class:list`, `...rest`) |
| rtlStyles | Mirror directional icons in RTL | 19 | `[data-directional]:dir(rtl){transform:scaleX(-1)}` |
| sharedResizeObserver / sharedMutationObserver | Pooled observers | 14 / 7 | One pooled observer |
| triggerFocus, primaryClick, isApplePlatform | "Focus counts as trigger focus"; primary-click check; ⌘ vs Ctrl | Tooltip, HoverCard, Slider, Kbd | Keep |
| layoutViewport, flatTree, nodeType, scrollView, selectionLock, edgeAutoscroll, devWarning, color | Viewport, shadow-DOM, scroll and selection helpers; dev logging; color math | keyboard, gestures, theme | Drop with the touch stack; color belongs to the theme build |

### 3c. `internal/`, `privateAttributes/`, `keyboard/`, `animator/`, `dragToSnapPoints/`
| Module | What it does | Used by | → Astro / vanilla |
|---|---|---|---|
| internal/calendar-system, dialog-context, selectable-card, spinner-rotor, touch | Internal entries for other Astryx packages | lab, richtext | Not needed |
| internal/SheetConfirmation, sheetDraft, useDismissSearchOnTouchDrag | Touch-sheet confirm, draft diff, keyboard dismiss | Tokenizer, PowerSearch | Defer |
| internal/indicatorPress.stylex | Press scope for replacement indicators | CheckboxInput | CSS marker |
| privateAttributes/* (one owner module per `data-astryx-*` attribute) | focusOwner, layerRoot, menuPressLit, popoverExit, press, pressBox, pressGroupItem, pressHoldsDrag, hapticSwitch, reducedMotion, segmentDisabled, segmentTitle | Carousel, Selector, Layer, SelectableCard, DropdownMenu, Popover, Button, Item, lists, CheckboxInput, RadioList, Switch, SegmentedControl | Keep `data-astryx-layer-root` (scope and event boundary), `data-astryx-reduced-motion`, focus-owner and segment states. Replace popoverExit copies with CSS allow-discrete exit transitions. Drop haptic, hold and press-group attributes |
| keyboard/keyboardHeight, keyboardLayoutGuide, keyboardModel, rideKeyboard, useMobileKeyboard | On-screen keyboard tracking and riding | BottomSheet, Layer | v1: viewport meta `interactive-widget=resizes-content` + scrollIntoView on focus |
| animator/createAnimator | Public spring/coast animator | useAnimator | Reuse, or WAAPI with `linear()` easing |
| dragToSnapPoints/createDragToSnapPoints | Public pan-and-snap | useDragToSnapPoints | Reuse for BottomSheet, or a scroll-snap sheet |

### 3d. `motion/` (≈14k) and `gestures/` (≈11k)
| Module(s) | What it does | Used by | → Astro / vanilla |
|---|---|---|---|
| motion/animator (4k), presentation, frameBlock, reducedMotionPlan | Compositor spring/curve animator | BottomSheet, DateInput, Lightbox, Popover, SegmentedControl, Slider, SnapPaging, Switch | WAAPI with `--ease-*`/`--duration-*` |
| spring, bezier, decay, coast, projection, rubberBand, paging, progress, resolveSnapPoint | Pure motion math | same | Port only for drag, sheet and wheel components |
| animatedLayout (3.3k), LayoutChangeSnapshot | FLIP size changes | Collapsible, TreeList, SideNav, Table, AppShell | `interpolate-size` / `::details-content` / View Transitions |
| transientCopy, carryAnimations | Exit and handoff copies | Layer, animatedLayout | Drop; CSS exit transitions |
| reducedMotion(+stylex) | No travel under reduced motion; cross-fade instead | Layer, Selector, Switch, press | Reduced-motion media query + `[data-astryx-reduced-motion]` |
| resolveMotion, roles, roleValue, themeTempo, themeTiming | Motion roles at the theme's tempo | ProgressBar, Popover, SegmentedControl | CSS vars |
| uikit/* tables (springs, scroll, timing, paging, alert, progressBar, popover, gestures, picker, segmented, switch, slider, datePicker, navigation, zoomMedia, longPress), android/keyboard | Measured constants | all of the above | Copy only the values used |
| gestures/GestureArena, GestureHost (4.3k), GestureRecognizer, recognizerInternals, hostRegistry, gestureSync, types, geometry | UIKit-style recognizer system | DateInput, Slider, Switch, Lightbox, SegmentedControl, Toast, usePager | Pointer Events + `setPointerCapture` + `touch-action` |
| Tap / LongPress / Pan / Pinch / Swipe / ScreenEdgePan recognizers, PressTracker, usePressTracker, useGestureRecognizer | Individual recognizers | Lightbox, Slider, Switch, DateInput, Toast, SegmentedControl | Per-element handlers; pinch only for Lightbox |
| VelocityTracker | The single release-velocity filter (INV10) | pan, pinch | Port for flick-driven sheets and lightbox |
| createPanGesture (public) | Framework-free pan | dragToSnapPoints | Reuse |
| fingerScroll, useFingerScroll, nativeScroll, pageHold, touchAction(+Rule), wheelSegmenter, selectionLock, haptics | Scroll and touch-action negotiation, haptics | GestureHost, useScrollLock | Drop |

---

## 4. Overlay / positioning system

**Astryx mechanism (`Layer/*`, ≈7.5k LOC)**
- **Hosting.**
  - Layers render inline at their JSX position.
  - A *corrective portal* is used only past the outermost unsafe ancestor (e.g. inside `<p>` or `<button>`), leaving a `<template>` marker.
  - Rendering inline keeps CSS-var inheritance.
- **Promotion.**
  - `popover="auto"` gives light dismiss and the browser's auto stack. `popover="manual"` gives neither and is the default for the public `useLayer`; the Popover family picks auto.
  - Modals use `<dialog>.showModal()`.
  - Without `showPopover` the fallback toggles `display`, with no top layer or positioning.
- **Positioning modes.** There are three:
  - *anchor*: the trigger gets a unique `anchor-name`. The names are kept in a list so several layers can share a trigger, and the name exists only while the layer is shown. The surface gets `position-anchor`, a logical `position-area` (e.g. `self-block-start span-self-inline-end`), and `position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline`. Generated `@position-try` "slide" rules are installed once in `<head>`.
  - *custom*: the caller supplies the geometry.
  - *fixed*: x/y coordinates (ContextMenu).
- **Viewport gutter and caps.**
  - The gutter is `max(--spacing-4, env(safe-area-inset-*))` plus `--astryx-layer-inset-<edge>` (from `LayerProvider inset`).
  - The layer box is capped to the viewport minus the gutters.
  - Tooltip keeps a second fallback list (beside-end, beside-start …) so it never covers its anchor.
  - IntersectionObservers follow anchor movement; there is no polling and no scroll listener.
- **Dismissal.**
  - `layerStack` holds one document Escape listener. It runs in the bubble phase and stands down when content has already handled the event. Ordering is logical depth (`LayerDepthProvider`) → DOM containment → registration order.
  - `useLayerDismissal` adapts dialog `cancel` / CloseWatcher, with an IME guard.
  - The `toggle` event reconciles closes the browser initiates. `gestureCounter` stops the dismissing press from reopening the layer.
  - `outsidePress` closes manual popovers (Typeahead, DateInput, the DateTimeInput time list, the chat trigger menu) when a press both starts and ends outside. A per-document count lets a modal backdrop ignore a press that closed a child layer.
- **Toasts.** `modalOutlet` lets each open modal supply its `<dialog>` as an outlet. `ToastViewport` (`popover=manual`) moves its host into the latest outlet so toasts paint above modals.
- **Content boundary.**
  - The layer root resets text (`layerTextReset`) and structural vars (`layerStructureReset`), and zeroes the inherited container padding (`overlayPaddingReset`).
  - It ends group-context membership (`createLayerScopedContext`).
  - Clicks stop propagating at the layer root.

| Component | Astryx host & ARIA | Position | Dismiss / focus | Vanilla recommendation |
|---|---|---|---|---|
| Layer / useLayer | popover auto\|manual; `<template>` marker | CSS anchor | Escape stack, toggle reconciliation | `anchor.js` (~150 LOC): stamp `anchor-name` on the trigger and `position-anchor` on the layer. Static CSS per `data-placement`/`data-align` provides `position-area`, fallbacks, gutter margins and `max-*-size` caps. If `CSS.supports('anchor-name: --a')` fails, use the `@oddbird/css-anchor-positioning` polyfill or a minimal rect positioner |
| Popover | trigger `aria-haspopup=dialog` + `aria-expanded`; `popover=auto role=dialog` | anchor | light dismiss + Escape; focus into the content and back to the opener | `<button popovertarget=id>` + `<div popover=auto role=dialog>`. Open, close, Escape and light dismiss need **zero JS**. JS only syncs `aria-expanded`, sets initial focus and assigns the anchor |
| Tooltip | `popover=manual role=tooltip`; SSR `aria-describedby` | anchor + keep-clear list | hover/focus loss; never focusable; an unpinned tooltip takes Escape only when it is the only layer | `popover="hint"` where supported, else manual. `tooltip.js` handles hover intent (delays, group handoff), focus-visible and Escape. Progressive `interestfor` |
| HoverCard | `popover=manual`, interactive | anchor | hover intent + focus + Escape + touch outside | The Tooltip engine with interactive content and an exit grace period |
| DropdownMenu, ContextMenu, MoreMenu, NavMenu, TabMenu, Breadcrumb menu | trigger `aria-haspopup=menu`; `popover=auto role=menu`; submenus `popover=manual`; ContextMenu `popover=manual` at x/y | anchor / fixed | light dismiss; submenu close chain; roving focus + typeahead; focus return | `<button popovertarget>` + `<div popover=auto role=menu>`. A nested auto popover stays open when its invoker is inside the parent popover. `menu.js` handles roving, typeahead and submenus. ContextMenu: `contextmenu` event → `showPopover()` + fixed left/top |
| Selector, MultiSelector, ComplexSelector | `button role=combobox` + auto-popover listbox (activedescendant) or dialog | anchor; min width = trigger | light dismiss | Shared `combobox.js`; `min-inline-size: anchor-size(width)`. `appearance: base-select` is a future Chromium-only path for Selector |
| Typeahead, Tokenizer, DateInput, TimeInput, DateTimeInput, Chat trigger menu | A text input cannot be an invoker, so `popover=manual` + outside-press watch | anchor | outside press (start and end outside); Escape via the stack; focus stays in the input | Manual popover + `outside-press.js` |
| Dialog, AlertDialog, CommandPalette | `<dialog>.showModal()` (or inline); `role=alertdialog`; `::backdrop` | centered | `cancel` → shared stack; backdrop press only for `purpose="info"`, and only if the press starts and ends on the backdrop; initial focus and return; scroll lock | `<dialog>` + `commandfor`/`command="show-modal"` (progressive) + `dialog.js` (open sync, backdrop rule, `closedby` where supported). Scroll lock via `:root:has(dialog:modal)`. Entry and exit via `@starting-style` + `transition-behavior: allow-discrete` |
| Drawer, MobileNav | `<dialog>.showModal()` with scrim; `popover=manual` without | fixed inline-start/end | Escape, scrim press; trap when modal | Same as Dialog with side-sheet CSS; non-modal uses `popover=manual` |
| BottomSheet (+Switcher) | `<dialog>` showModal (scrim) or popover; sheet stack; snap points | fixed bottom | swipe, scrim, Escape; covered sheets report as absent | `<dialog>` + Pointer Events + ported `createDragToSnapPoints`, or a scroll-snap sheet. Defer stacking |
| Lightbox | `<dialog>` showModal | fullscreen | Escape; gestures | `<dialog>` + `lightbox.js` |
| Toast / ToastViewport | viewport `popover=manual role=region`; rows `role=status/alert`; `createToastQueue`; moves into the latest modal outlet | fixed corner + inset vars | timers, swipe, close; never steals focus | `<astryx-toast-viewport popover=manual>` + a global `toast()`. When a modal opens, call `hidePopover()` then `showPopover()` to re-raise it (top layer = last shown), or move it into the open `dialog:modal` |
| Overlay | In-flow scrim over media (no top layer) | — | hover/focus-within | Pure CSS |
| LayerProvider | Toast config + inset (not a portal host) | — | — | `:root{--astryx-layer-inset-*}` + config attributes |

**Porter rules**
1. Render popover markup as a **sibling** of its trigger, never inside `<button>`, `<a>` or phrasing-only parents. The top layer makes portals unnecessary.
2. Keep one document Escape stack: topmost layer only, skip when `defaultPrevented`, ignore IME composition. Apply start-and-end outside checks. The topmost layer consumes its outside press.
3. Return focus with `preventScroll:true`, showing the ring per the last modality.
4. Mark every layer root with `data-astryx-layer-root` and reset the container padding vars there. The attribute is the `@scope … to (…)` lower boundary that stops size and group cascades.

**Browser support notes** (verify at implementation time):
- Baseline: Popover API, `@starting-style`, allow-discrete transitions, `:has()`, `light-dark()`.
- Anchor positioning: Chromium 125+ and Safari 26+. Firefox support is recent, so confirm it.
- Chromium-first: `popover=hint`, `interestfor`, `base-select`, `interpolate-size`, `scroll-state()`.
- `@scope` is already required by Astryx theme CSS.

---

## 5. Theming mechanics a CSS-only component must honor

| Mechanism | How Astryx does it | What the Astro component emits / reads |
|---|---|---|
| Layers | `@layer reset, astryx-base, astryx-theme;` declared in every stylesheet. Component CSS → astryx-base, themes → astryx-theme, unlayered consumer CSS wins. The reset uses `:where()` | All component CSS in `@layer astryx-base` |
| Stable targets | Class `astryx-<kebab>` on the **painted** element. `data-<kebab-prop>="<literal>"` for visual props (`data-variant`, `data-size`, `data-level="1"`) and states (`data-open="open"`, `data-disabled="disabled"`). ~270 targets, listed in each `.doc.mjs` → `theming.targets[{className, visualProps, states, guaranteedProperties}]` + `vars` + `derived` | A `themeAttrs()` helper with identical output; generate the contract from `.doc.mjs`. The public prop, the rendered attribute and the theme visual prop must agree |
| Theme scope | `Theme` writes `data-astryx-theme="<name>"`, plus `data-theme="light\|dark"` unless the mode is `system`. The root Theme also writes them on `<html>`. Theme CSS: `@scope ([data-astryx-theme="x"]) to ([data-astryx-theme]) { :scope{tokens} .astryx-*[data-*]{…} }`; prose defaults go in `@layer reset` | `Theme.astro` wrapper; set the root attributes on `<html>` at SSR; reuse the built `theme.css` |
| Color scheme | Tokens use `light-dark()`. `reset.css` maps `html[data-theme]` to `color-scheme` (absent = `light dark`). `MediaTheme` marks `data-astryx-media="dark\|light"` surfaces, which flip color-scheme and apply onDark/onLight rules | Only `var(--color-*)`. Emit `data-astryx-media` on inverted surfaces (Toast, Overlay) |
| Tokens | `--color-*` (semantic, status, 10 hues), `--spacing-0…12` (rem), `--size-element-sm/md/lg` (28/32/36 px), `--radius-{none,inner,element,container,page,chat,full}`, `--shadow-*`, `--border-width`, `--focus-outline-*`, `--duration-*`, `--ease-*`, `--font-*`, `--text-<role>-{size,weight,leading}` | Use only these names; numeric spacing props map to `--spacing-N` |
| Private derived vars | A theme `components.<target>.<key>.<cssProp>` emits the property **plus** private vars from `derivedVarRegistry` | Painters must read them with fallbacks, e.g. `var(--_button-radius, var(--radius-element))` |
| Public semantic vars | Container padding `--astryx-{card,section,dialog,drawer,bottom-sheet,number-input}-padding[-inline\|-block][-start\|-end]` (theme `padding`, expand:'container'). Also `--astryx-layer-inset-*`, `--astryx-press-alpha`, `--astryx-hit-inset-*`, and component vars such as `--button-focus-offset` and `--button-icon-only-aspect` | Same fallback chains as `Layout/container.stylex.ts`: edge → axis → shorthand → `--spacing-4` |
| Size cascade | `sm\|md\|lg`. Explicit prop > nearest provider > component default; a null provider resets; only enrolled consumers inherit. Button sets the default Icon size (sm for sm/md, md for lg) | See the size-cascade recipe below |
| Density | Per-component prop passed to children by context (List/ListItem, TreeList, Outline, Stepper, Collapsible(Group), Chat), reflected as `data-density` | Emit `data-density` on the parent and select children by scope |
| mergeComponents | `deepMergeComponents()` merges per style key (restating one property keeps the rest). Used by `extends`, type-scale rules and onDark/onLight surfaces | Only matters if you port the theme compiler |
| Adaptations & width points | Ordered `@media` adaptation blocks (touch, compact). Named width points `sm…2xl`; compact = width < md or height < 500 | Generate media queries from the theme at build time |
| Hover guard | Theme `:hover` rules get `:where(:not(:disabled,[aria-disabled="true"]))` | Use the same guard in base CSS |
| Reduced motion | `prefers-reduced-motion` → no travel. A theme with `reducedMotion:'always'` writes `data-astryx-reduced-motion` | Write each travel-free rule under both conditions |

Private vars the shipped themes write (painters must read these names):
- **Radius:** `--_button-radius`, `--_card-radius`, `--_dialog-radius`, `--_popover-radius`, `--_hovercard-radius`, `--_field-radius`, `--_avatar-radius`, `--_banner-radius`.
- **Radius and padding pairs:** `--_dropdown-menu-radius/-padding` (also used by context-menu), `--_segmented-control-radius/-padding`, `--_chat-composer-radius/-padding`.
- **Other:** `--_item-inset-inline`, `--_textarea-inline-padding`, `--_icon-width/-height`, `--_progressbar-mark-width/-height`.

**Size cascade recipe (visual)**
- The provider emits `data-astryx-size`. Consumers emit `data-size` only when the size is explicit.
- Base CSS: `@scope ([data-astryx-size="sm"]) to ([data-astryx-size],[data-astryx-layer-root]) { .astryx-button:not([data-size]){--_h:var(--size-element-sm)} }`. The lower boundary gives nearest-provider-wins and the null reset with no extra work.
- The theme adapter must recompile `size:*` keys into the same scoped form so theme rules reach inherited sizes.
- Alternative: the provider post-processes its slot HTML (`await Astro.slots.render()`) and stamps `data-size` on unmarked consumers.

**Context-free cascade strategy**

| Cascade | Kind | Mechanism |
|---|---|---|
| Size, density, orientation, ButtonGroup connected geometry, InputGroup member geometry (`InputGroup/groupStyles.ts` already uses `:first-child` / `:nth-last-child(1 of …)`) | Visual | Data attribute + `@scope`/`:where()` |
| ButtonGroup disabled, FormLayout optionality → `aria-required`, InputGroup labelID/describedBy, RadioList `name` | Semantic | (a) explicit child props (recommended for v1); (b) slot-HTML stamping (`Astro.slots.render` + ultrahtml/parse5), which costs streaming for that subtree; (c) a client stamp element, as a last resort |
| Locale, theme name, Link component, Toast config | Request-global | `Astro.locals` set in middleware |

---

## 6. i18n

| Aspect | Astryx | Astro recommendation |
|---|---|---|
| Catalog | `packages/core/locales/<tag>.json`: 30 catalogs (af-ZA … zh-TW, including `en`) plus a generated pseudo locale. **614 keys** named `@astryx.<component>.<id>`, each `{defaultMessage, description}`, in **ICU MessageFormat 1** (e.g. `Go back {step, number} {step, plural, one {page} other {pages}}`). Generated `<tag>.generated.js` string maps; per-module English maps in `i18n/generated-english/` | Copy the JSON catalogs (MIT) so the keys stay compatible |
| Access | `useComponentTranslator()` returns `t(key, values)`. Each module calls `registerEnglishFallback(map)` for only its keys. 59 components use it | A server-only `createTranslator(locale, {catalogs, overrides})` built on `intl-messageformat`, or ICU precompiled at build time |
| Resolution | Per-locale overrides → supplied catalogs → shipped English, walking exact → parent locale. No provider = deterministic English | Same order. Locale from `Astro.currentLocale` or `Astro.locals.astryx.locale` |
| Overrides | A consumer content prop wins where one exists (few do, e.g. Pagination `pageLabel`) | Make **every** Astryx-owned string a prop defaulting to `t(key)`, e.g. `closeLabel = t('@astryx.dialog.close')` |
| Formatting | `Intl.*` calls receive the provider locale explicitly; no host-locale reads. PlainDate stays Gregorian; the display calendar comes from `useCalendarSystem` | Pass the locale to every Intl call, both in frontmatter and in client elements (`data-locale`) |
| Direction | Read from the DOM; the provider never changes `dir` | Set `<html dir>`; use logical CSS and `:dir()` |
| Client strings | Rendered in React | Pre-translated `data-*` attributes (e.g. `data-copied-label`), or a page-level JSON `<script type="application/json">` with just the needed keys. Runtime plurals via `Intl.PluralRules` |
| Review rules | No literal, concatenated or hand-pluralized Astryx text; never edit generated files | Keep them |

---

## 7. Icons

| Aspect | Astryx | Astro recommendation |
|---|---|---|
| Component | `Icon` props: `icon` (`IconName`, a namespaced key like `'numberInput:stepperDown'`, or an SVG component), `size`, `color`, `variant`, `label`. Named icons render inside `<span class="astryx-icon" data-size data-color>`. `aria-hidden="true"` by default; a non-empty `label` gives `role="img"` + `aria-label` | `Icon.astro` with the same props, accepting a name, an SVG string or an Astro component |
| Names | 29: close, chevronDown/Left/Right, chevronsLeft/Right, check, success, error, warning, info, calendar, clock, externalLink, menu, moreHorizontal, search, upload, arrowUp, arrowDown, arrowsUpDown, funnel, eyeSlash, viewColumns, copy, checkDouble, wrench, stop, microphone | Same union |
| Resolution | Theme `icons[name]` → `registerIcons()` → `defaultIcons` (minimal 24×24 inline SVGs, stroke 1.5, currentColor, ~1.4 KB). An entry is a node or a **pure** `({size, variant}) => node`; a function's null result is final | Server-side resolver: theme map → registry → defaults ported as SVG strings |
| Theme sets | `packages/themes/{butter,chocolate,gothic,matcha,neutral,stone,y2k}/src/icons.tsx` map the names to **lucide-react** components with `size="1em"` and `aria-hidden` | Equivalent maps using `lucide-static` SVG strings or `@lucide/astro` |
| Sizes | xsm/sm/md/lg = 0.75/1/1.25/1.5 rem. Themes can set width/height on `components.icon['size:*']` (→ `--_icon-width/-height`). Size resolves explicit → owner default (IconDefaultSizeContext) → md | The owning component passes `size`; CSS fallback `.astryx-button .astryx-icon:not([data-size])` |
| Color | `--color-icon-*` tokens, or `inherit` (default) | Same tokens |
| Component slots | `componentIcons` maps slot → name, null or a request, optionally a pure function of state. Core slots: `code-block-copy {copied}`, `timestamp-copy {copied}`, `table-sort-indicator {direction}`, `table-row-expand {expanded}`. Precedence: instance prop > theme slot > fallback | Same 3-step resolver on the server. For states that change on the client, render every state and toggle with `data-*` |
| Indicators | Check, checkbox and radio marks are separate from icons and replaced via `defineTheme({indicators})` | A separate `Indicator.astro` registry |

---

## 8. Cross-component contracts to respect

Sources are the `docs/families/*` contracts (all authority: current) and `docs/architecture/*`.

| # | Rule | Source |
|---|---|---|
| 1 | Every control has an accessible name. Icon-only controls use `aria-label`. Default is native `<button type=button>`; `href` means navigation | buttons FR1–2 |
| 2 | Disabled means focusable and inert. Use `aria-disabled="true"` (AST-085) and cancel click and Enter/Space. Group disabled overrides members. Button keeps native `disabled` unless busy or showing a tooltip | buttons FR3; input-fields FR4 |
| 3 | Pending keeps geometry and name: `aria-busy` + Spinner. Fire-once actions dedupe. ToggleButton exposes `aria-pressed` and is reversible | buttons FR4–6 |
| 4 | sm/md/lg map to one height contract (`--size-element-*`). Icon-only controls are square. Icon slot defaults to sm (sm/md) or md (lg). State never changes outer size | buttons FR7 |
| 5 | Elevation belongs to the painted surface. A connected ButtonGroup owns one shadow and its members paint none. ToggleButtonGroup is spaced and its wrapper has no shadow. State never changes elevation | buttons FR8–12 |
| 6 | Touch-only slide-across: the action under the lift acts. Applies to menus, ButtonGroup, ToggleButtonGroup, Toolbar, AlertDialog, DateRangeInput presets, and Banner/Toast rows; SegmentedControl is exempt. A mouse behaves like a native button. Keyboard and AT unchanged. Port as an optional enhancement | action-groups FR1–5, DEC-1 |
| 7 | Inputs: stable inline size across states; end controls own non-overlapping space; `isLoading` describes the value; status placement detached/tooltip everywhere, attached only on fixed-height bordered controls; iOS-only 16 px floor | input-fields FR1–2, 5, 8–9 |
| 8 | Field-composed routing: base props (`id`, `ref`, `aria-*`, `data-*`, events) go to the **native control** (or the group element for lists). No root class/style. `containerClass/Style` → Field box; `controlClass/Style` → bordered control box | input-fields FR10 |
| 9 | InputGroup admission: adopt the group height; drop the member's own border, radius and surface; the group paints the outer border, radius and focus; single row; keep names. The focused member raises its z-index | input-fields FR3; `InputGroup/groupStyles.ts` |
| 10 | The clear tooltip is the generic "Clear"; its name is contextual. Search inputs set `enterkeyhint="search"` and `autocorrect="off"`. Fields stay above the on-screen keyboard | input-fields FR11–13 |
| 11 | Size: explicit > nearest provider > default; null resets; only enrolled consumers; rendered `data-size` = effective size | component-size-cascade INV1–9 |
| 12 | Layout primitives: `SpacingStep` maps to tokens; `SizeValue` number = px, string = CSS; logical start/end; padding precedence edge > axis > uniform; gap ≠ padding; Stack/Center padding does not publish bleed | layout-primitives FR1–9 |
| 13 | Layout regions: inset comes from slot presence; no wrapper for missing slots; explicit landmarks only; LayoutContent/LayoutPanel own scrolling; set `hasDivider={false}` when a ResizeHandle draws the divider; AppShell keeps main content mounted across breakpoints | layout-regions FR1–12 |
| 14 | Container padding protocol: publishers (Card, Section, Dialog, Drawer, BottomSheet, ScrollableArea, Layout regions) set `--container-padding-{inline,block}-{start,end}` equal to the applied padding. Bleed consumers (Section, Divider, Table, TabList, List `edge=bleed`, ScrollableArea `isFullBleed`) subtract it on their contracted edges. Layer roots and the AppShell root reset it. Edge vocabulary: `padded\|flush\|outset\|bleed` | container-padding INV1–11 |
| 15 | Slot edge compensation: ghost Buttons and Tabs set `data-astryx-edge-comp`; containers (Toolbar, Banner, headers) use `:has(> [data-astryx-edge-comp]:first-child/:last-child)` with a negative margin | `Layout/edgeCompensation.stylex.ts` |
| 16 | Navigation safety: apply the blocked-scheme rule to every destination (Link, Button `href`, Item, Token, ClickableCard, Citation, Markdown, TopNav). A rejected link is inert, not disabled. `_blank`, modifier and middle clicks get the same decision | navigation-destinations FR1–8 |
| 17 | Dismissal: one topmost layer per Escape or close request; content may claim Escape first; IME never dismisses; one stack per document; a backdrop press must start and end on the backdrop; the topmost layer consumes the outside press; focus returns without scrolling | overlay-dismissal FR1–11 |
| 18 | Layer runtime: inline when safe; native promotion only; anchor names compose and exist only while shown; flips keep clearance; one gutter definition; the first painted frame is final (no measure-then-move); clicks stop at the layer root; the layer root resets text and structural vars | layer-runtime INV1–18 |
| 19 | Modality: one shared last-input state; programmatic focus shows the ring only after keyboard input; hover only under `(hover:hover)` and never the only path; one ring per focus move (a focus-owner wrapper paints for its first child); newer intent supersedes stale async work | interaction-modality INV1–9 |
| 20 | Press paint: one overlay definition with a disabled guard; persistent selection wins over press; paint the surface being manipulated; restore after release | interactionOverlay; user-states DR1–5 |
| 21 | CSS before JS for anything CSS can derive. Scope relational state so outer `:hover`/`:focus-within` never leaks into inner form controls. Minimal DOM: one element per role or themable part, pseudo-elements for decoration, no hidden measuring copies, one mounted presentation per open layer | component-style-authoring INV2, INV4–7 |
| 22 | Theming targets sit on painting elements; state is attributes on the owning target; `--_*` vars are never public; only canonical target names | component-theming-surface INV1–15 |
| 23 | Group contexts to reproduce:<br>- ButtonGroup: orientation, disabled, size, connected<br>- ToggleButtonGroup: selection by `value`; member callbacks ignored<br>- InputGroup: labelID, describedBy<br>- FormLayout: direction, optionality<br>- CollapsibleGroup: open set, dividers, density, chevron<br>- RadioList / CheckboxList: name, Field<br>- SegmentedControl / TabList: value, size<br>- List: density, dividers, edge, marker<br>- AvatarGroup: size, overlap<br>- Stepper / Chat: density<br>- Toolbar: size<br>- AppShell: mobile state<br><br>All of them end at layer boundaries | AST-038 |
| 24 | Announcements use persistent live regions. Inside an open modal, use the modal's own region | AST-086 FR14 |
| 25 | Bidirectionality: preserve meaning, not coordinates; mirror directional art once; resolve left/right at interaction time. Reduced motion: no travel (cross-fade); `reducedMotion:'always'` applies to everyone | design/bidirectionality, design/reduced-motion |
| 26 | A `presentation` prop must always let the caller keep the fine-pointer surface. Compact has one definition (width < md or height < 500) | public-component-api INV16–17 |
| 27 | Interaction utilities have framework-free `create…` cores to seed custom elements: createResizable, createToastQueue, createPager, createLongPressDetector, createPanGesture, createAnimator, createDragToSnapPoints, createActionGroupTracker, createAnimatedLayout | public-component-api INV22 |

---
Possible memory item (source: this task): Danilo is planning a port of Meta's Astryx design system to Astro components with vanilla light-DOM custom elements.
