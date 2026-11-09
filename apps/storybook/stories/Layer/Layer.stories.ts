import Layer from 'astryx-astro/components/Layer/Layer.astro';
import Demo from 'astryx-astro/components/Layer/Layer.demo.astro';
import demoSource from 'astryx-astro/components/Layer/Layer.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import LayerPlacement from './LayerPlacement.astro';
import placementSource from './LayerPlacement.astro?raw';
import LayerProviderStory from './LayerProviderStory.astro';
import providerSource from './LayerProviderStory.astro?raw';
import LayerStory from './LayerStory.astro';
import layerSource from './LayerStory.astro?raw';

const meta = {
  title: 'Utility/Layer',
  component: Layer,
  ...astryx('Layer'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Layer.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['mode', 'placement', 'alignment', 'positioning', 'offset', 'x', 'y', 'role', 'label', 'lightDismiss', 'escape', 'hasMotion', 'isDefaultOpen', 'style'],
  source: layerSource,
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const layerOf = (root: HTMLElement) => root.querySelector<HTMLElement>('ax-layer')!;

/**
 * `lightDismiss`: a `popover="auto"` layer anchored above its `popovertarget` trigger, with an
 * offset and the shared motion. The trigger toggles it, Escape closes it, and
 * `astryx-open-change` reports each change.
 */
export const Default = composed(LayerStory, {
  args: {lightDismiss: true, role: 'dialog', label: 'Quick note', offset: 4, hasMotion: true},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement, step}) => {
    const trigger = canvas.getByRole('button', {name: 'Show layer'});
    const layer = layerOf(canvasElement);
    const changes = recordEvents<{isOpen: boolean; reason: string}>(canvasElement, 'astryx-open-change');
    await expect(layer).toHaveAttribute('popover', 'auto');

    await step('The trigger opens it, anchored to the trigger', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(canvas.getByRole('dialog', {name: 'Quick note'})).toBe(layer);
      // Above the trigger, or flipped below it where the viewport has no room above.
      await waitFor(() => {
        const t = trigger.getBoundingClientRect();
        const l = layer.getBoundingClientRect();
        expect(l.bottom <= t.top + 1 || l.top >= t.bottom - 1).toBe(true);
      });
    });

    await step('Escape closes it', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(changes.at(-1)?.detail).toEqual({isOpen: false, reason: 'escape'});
    });

    await step('The trigger toggles it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });
    await expect(changes.map((e) => e.detail.isOpen)).toEqual([true, false, true, false]);
    // Known limitation: the light-dismiss press outside is the browser's own (popover="auto")
    // and needs a trusted pointer press, which a play function cannot send.
  },
}, options);

const placementOptions = {controls: ['placement'], source: placementSource};
const placementPlay = (placement: string): Story['play'] => async ({canvasElement}) => {
  const layers = [...canvasElement.querySelectorAll('ax-layer')];
  await waitFor(() => expect(layers.every(isShowing)).toBe(true));
  await expect(layers.map((l) => l.getAttribute('data-placement'))).toEqual([placement, placement, placement]);
};
const placementFrame = {layout: 'centered', docs: {story: {inline: false, height: '320px'}}};

/** `placement="above"` with each `alignment`: three layers open on load (`isDefaultOpen`). */
export const PlacementAbove = composed(LayerPlacement, {args: {placement: 'above'}, parameters: placementFrame, play: placementPlay('above')}, placementOptions);

export const PlacementBelow = composed(LayerPlacement, {args: {placement: 'below'}, parameters: placementFrame, play: placementPlay('below')}, placementOptions);

export const PlacementStart = composed(LayerPlacement, {args: {placement: 'start'}, parameters: placementFrame, play: placementPlay('start')}, placementOptions);

export const PlacementEnd = composed(LayerPlacement, {args: {placement: 'end'}, parameters: placementFrame, play: placementPlay('end')}, placementOptions);

/**
 * No light dismiss (`popover="manual"`) and `escape="block"`: neither Escape nor a press outside
 * closes it; its own Close button and the trigger do.
 */
export const Manual = composed(LayerStory, {
  args: {placement: 'end', escape: 'block'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Show layer'});
    const layer = layerOf(canvasElement);
    await expect(layer).toHaveAttribute('popover', 'manual');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-outside]')!);
    await sleep(300);
    await expect(isShowing(layer)).toBe(true);
    await userEvent.click(canvas.getByRole('button', {name: 'Close'}));
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/** `mode="fixed"`: placed at viewport coordinates (`x={24} y={24}`) instead of an anchor. */
export const FixedMode = composed(LayerStory, {
  args: {mode: 'fixed', x: 24, y: 24, lightDismiss: true},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const layer = layerOf(canvasElement);
    await userEvent.click(canvas.getByRole('button', {name: 'Show layer'}));
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    // Fixed mode sits at the viewport coordinates `x` / `y`, wherever the trigger is.
    await waitFor(() => {
      const r = layer.getBoundingClientRect();
      expect([Math.round(r.left), Math.round(r.top)]).toEqual([24, 24]);
    });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(isShowing(layer)).toBe(false));
  },
}, options);

/**
 * `positioning="custom"`: the anchor wiring stays, the position is the caller's (`anchor()`
 * insets in `style`); here the layer covers its trigger.
 */
export const CustomPositioning = composed(LayerStory, {
  args: {positioning: 'custom', lightDismiss: true, style: 'top:anchor(top);left:anchor(left);min-width:anchor-size(width);margin:0'},
  parameters: {layout: 'centered'},
  play: async ({canvas, canvasElement}) => {
    const trigger = canvas.getByRole('button', {name: 'Show layer'});
    const layer = layerOf(canvasElement);
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(layer)).toBe(true));
    await waitFor(() => {
      const t = trigger.getBoundingClientRect();
      const l = layer.getBoundingClientRect();
      expect([Math.round(l.left), Math.round(l.top)]).toEqual([Math.round(t.left), Math.round(t.top)]);
    });
    await userEvent.keyboard('{Escape}');
  },
}, options);

/**
 * LayerProvider at the app root: its `inset` keeps anchored layers clear of a 64px bar, and its
 * `toast` config renders the page's toast viewport, which `toast()` finds.
 */
export const WithLayerProvider = composed(LayerProviderStory, {
  parameters: {docs: {story: {inline: false, height: '320px'}}},
  play: async ({canvas, canvasElement, step}) => {
    const viewports = canvasElement.querySelectorAll('ax-toast-viewport');
    await expect(viewports).toHaveLength(1);
    const viewport = viewports[0]!;
    await expect(viewport).toHaveAttribute('data-position', 'topEnd');
    await expect(viewport).toHaveAttribute('data-max-visible', '2');

    await step('toast() shows the toast in the provider’s viewport, a named region', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Show a toast'}));
      await waitFor(() => expect(viewport).toHaveTextContent('Saved to the provider’s viewport'));
      await expect(viewport).toHaveAttribute('role', 'region');
      await expect(viewport).toHaveAccessibleName('Notifications');
    });

    await step('Its dismiss button removes it', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Dismiss notification'}));
      await waitFor(() => expect(viewport.querySelector('ax-toast')).toBeNull());
    });

    await step('The layer keeps the 64px gutter: it does not open under the bar', async () => {
      const layer = layerOf(canvasElement);
      await userEvent.click(canvas.getByRole('button', {name: 'Show layer'}));
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await waitFor(() => expect(layer.getBoundingClientRect().top).toBeGreaterThanOrEqual(64));
      await userEvent.keyboard('{Escape}');
    });
  },
}, {source: providerSource});
