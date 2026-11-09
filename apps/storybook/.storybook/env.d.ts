// @storybook-astro/renderer ships its browser entry untyped (it imports Vite virtual modules).
declare module '@storybook-astro/renderer/entry-preview' {
  import type {AstroRenderer} from '@storybook-astro/framework';
  import type {RenderContext} from 'storybook/internal/types';

  export function renderToCanvas(context: RenderContext<AstroRenderer>, canvasElement: AstroRenderer['canvasElement']): Promise<void | (() => void)>;
}
