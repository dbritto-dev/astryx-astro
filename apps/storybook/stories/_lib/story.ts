/**
 * Helpers every story file uses. See apps/storybook/STORIES.md.
 *
 * How stories render (@storybook-astro/framework 1.15, `renderMode: 'static'`):
 *  - `storybook build` pre-renders every story once, on the server, with its own args and
 *    decorators (globals and Controls cannot change the HTML afterwards). `storybook dev`
 *    renders on demand, so Controls work there.
 *  - Only `meta.component` is pre-rendered; a story that sets its own `component` is dropped
 *    from the static build. To render anything else (a docs demo, a composition of several
 *    components, Temporal values, a trigger with its overlay) a story uses a decorator that
 *    *replaces* the story with another .astro component: `overview()` and `composed()` below.
 *  - Each component in a story (the story itself, every component passed in `args.slots`,
 *    every decorator) is a separate Astro render, so subtree contexts (List → ListItem,
 *    TabList → Tab, providers …) only work inside one .astro file. Compositions therefore
 *    live in story wrappers (`stories/<Name>/*.astro`) rendered with `composed()`.
 */
import type {AstroRenderer} from '@storybook-astro/framework';
import type {Args, ComponentAnnotations, StoryAnnotations, StoryContext} from 'storybook/internal/types';
import {catalog, type ComponentName} from './catalog.generated';
import Frame from './Frame.astro';

export type Meta = ComponentAnnotations<AstroRenderer, Args>;
export type Story = StoryAnnotations<AstroRenderer, Args>;

/** An imported .astro component (a client-side stub in the browser, the real one on the server). */
type AstroComponent = unknown;

/**
 * The meta fields every story file spreads: the manifest description for the docs page and the
 * component's manifest name (`parameters.astryx.component`, for tooling).
 *
 *   const meta = {title: 'Action/Button', component: Button, ...astryx('Button')} satisfies Meta;
 */
export function astryx(name: ComponentName) {
  const entry = catalog[name];
  return {
    parameters: {
      astryx: {component: name},
      docs: {description: {component: entry.description}},
    },
  } satisfies Partial<Meta>;
}

/**
 * Replace the story with `Component`, rendered with `props` and an empty default slot. The
 * decorator never places `Story()`, so the meta component is not rendered at all (a documented
 * @storybook-astro/framework behaviour: "the decorator replaced the story rather than wrapping
 * it"). The meta component still drives the docs page (props table, description).
 */
function replaceWith(Component: AstroComponent, props: (ctx: StoryContext<AstroRenderer>) => Args) {
  return (_story: unknown, ctx: StoryContext<AstroRenderer>) => ({component: Component, props: props(ctx), slots: {default: ''}});
}

/**
 * The Overview story: the component's whole docs demo (`<Name>.demo.astro`) pre-rendered as one
 * story, with the demo's source as the story's code. Every story file starts with it.
 *
 *   import Demo from 'astryx-astro/components/Button/Button.demo.astro';
 *   import demoSource from 'astryx-astro/components/Button/Button.demo.astro?raw';
 *   export const Overview = overview(Demo, demoSource);
 */
export function overview(Demo: AstroComponent, source: string, story: Story = {}): Story {
  return {
    ...story,
    decorators: [replaceWith(Demo, () => ({})) as never, ...[story.decorators ?? []].flat()],
    parameters: {
      layout: 'padded',
      ...story.parameters,
      controls: {disable: true},
      docs: {source: {code: source, language: 'astro'}, ...story.parameters?.docs},
    },
  };
}

export interface ComposedOptions {
  /**
   * The args the wrapper takes as props: the story's args with these names are passed to it (and
   * nothing else, so meta-level args never leak in). Name them after the meta component's props
   * the wrapper forwards; in `storybook dev` these keep their Controls and every other control is
   * hidden. Omit when the wrapper takes no props: Controls are then hidden for the story.
   */
  controls?: string[];
  /** The wrapper's source (`import src from './X.astro?raw'`), shown as the story's code. */
  source?: string;
}

/**
 * A story rendered by a story wrapper (`stories/<Name>/<Wrapper>.astro`), in one Astro render.
 * Use it for compositions (slots holding other components), overlays with their trigger,
 * Temporal values, locales and anything else args can't express.
 *
 *   import DialogStory from './DialogStory.astro';
 *   import dialogSource from './DialogStory.astro?raw';
 *   export const Required = composed(DialogStory, {args: {purpose: 'required'}}, {controls: ['purpose'], source: dialogSource});
 */
export function composed(Wrapper: AstroComponent, story: Story = {}, options: ComposedOptions = {}): Story {
  const forwarded = options.controls ?? [];
  return {
    ...story,
    decorators: [
      replaceWith(Wrapper, (ctx) => Object.fromEntries(forwarded.filter((name) => name in ctx.args).map((name) => [name, ctx.args[name]]))) as never,
      ...[story.decorators ?? []].flat(),
    ],
    parameters: {
      ...story.parameters,
      controls: forwarded.length ? {include: forwarded, ...story.parameters?.controls} : {disable: true},
      ...(options.source ? {docs: {source: {code: options.source, language: 'astro'}, ...story.parameters?.docs}} : {}),
    },
  };
}

/**
 * A decorator that renders the story inside a box of the given size (Frame.astro): for
 * truncation, wrapping, overflow and scrolling stories. Works with plain args stories.
 *
 *   export const Truncated: Story = {args: {maxLines: 1}, decorators: [frame({width: 240})]};
 */
export function frame(size: {width?: number | string; height?: number | string}) {
  return () => ({component: Frame, props: size});
}
