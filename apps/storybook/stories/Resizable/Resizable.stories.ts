import ResizeHandle from 'astryx-astro/components/Resizable/ResizeHandle.astro';
import Demo from 'astryx-astro/components/Resizable/Resizable.demo.astro';
import demoSource from 'astryx-astro/components/Resizable/Resizable.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import ResizableLayout from './ResizableLayout.astro';
import layoutSource from './ResizableLayout.astro?raw';
import ResizableStory from './ResizableStory.astro';
import storySource from './ResizableStory.astro?raw';

const meta = {
  title: 'Layout/Resizable',
  component: ResizeHandle,
  ...astryx('Resizable'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Resizable.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {
  controls: ['direction', 'position', 'isReversed', 'isDisabled', 'hasDivider', 'isAlwaysVisible', 'pillPlacement', 'label', 'resizable', 'hasCustomGrip'],
  source: storySource,
};
const preview = {defaultSize: 220, minSize: 160, maxSize: 360};

type Canvas = {getByRole: (role: string, options: {name: string}) => HTMLElement; getByTestId: (id: string) => HTMLElement};
const handle = async (canvasElement: HTMLElement, canvas: Canvas, name: string) => {
  await upgraded(canvasElement, 'ax-resizable');
  return canvas.getByRole('separator', {name});
};
/**
 * A mouse drag on the handle's grab zone (where the element listens), by `dx` px. Dispatched
 * directly: user-event's pointer API targets the handle root, not the grab zone inside it.
 */
async function drag(separator: HTMLElement, dx: number) {
  const hit = separator.querySelector<HTMLElement>('.ax-resize-handle-hit')!;
  const box = hit.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const fire = (type: string, clientX: number, buttons: number) =>
    hit.dispatchEvent(new PointerEvent(type, {pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons, clientX, clientY: y, bubbles: true, cancelable: true, composed: true}));
  fire('pointerdown', x, 1);
  fire('pointermove', x + dx / 2, 1);
  fire('pointermove', x + dx, 1);
  fire('pointerup', x + dx, 0);
}
const width = (el: HTMLElement) => Math.round(el.getBoundingClientRect().width);
const height = (el: HTMLElement) => Math.round(el.getBoundingClientRect().height);

/**
 * A horizontal handle (a vertical separator) sizing the pane before it. Arrows step 10px (50px
 * with Shift), Home goes to the minimum, End to the maximum; every change reports
 * `astryx-size-change` and updates `aria-valuenow`. Dragging the handle resizes too.
 */
export const Default = composed(ResizableStory, {
  args: {label: 'Resize invoice preview', resizable: preview},
  play: async ({canvas, canvasElement, step}) => {
    const separator = await handle(canvasElement, canvas, 'Resize invoice preview');
    const pane = canvas.getByTestId('pane');
    const sizes = recordEvents<{size: number}>(canvasElement, 'astryx-size-change');

    await step('A window splitter with its value range', async () => {
      await expect(separator).toHaveAttribute('aria-orientation', 'vertical');
      await expect(separator).toHaveAttribute('aria-valuenow', '220');
      await expect(separator).toHaveAttribute('aria-valuemin', '160');
      await expect(separator).toHaveAttribute('aria-valuemax', '360');
      await expect(width(pane)).toBe(220);
    });

    await step('ArrowRight grows the pane by 10px, Shift+ArrowRight by 50px, ArrowLeft shrinks it', async () => {
      separator.focus();
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '230'));
      await expect(width(pane)).toBe(230);
      await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '280'));
      await userEvent.keyboard('{ArrowLeft}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '270'));
      await expect(sizes.map((event) => event.detail.size)).toEqual([230, 280, 270]);
    });

    await step('Home goes to the minimum, End to the maximum', async () => {
      await userEvent.keyboard('{Home}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '160'));
      await expect(width(pane)).toBe(160);
      await userEvent.keyboard('{End}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '360'));
      await expect(width(pane)).toBe(360);
      // Clamped: a further grow step stays at the maximum.
      await userEvent.keyboard('{ArrowRight}');
      await expect(separator).toHaveAttribute('aria-valuenow', '360');
    });

    await step('Dragging the grab zone resizes the pane', async () => {
      await drag(separator, -60);
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '300'));
      await expect(width(pane)).toBe(300);
      await expect(sizes.at(-1)?.detail.size).toBe(300);
    });
  },
}, options);

/** `hasDivider`: a 1px line is the handle, with a wider invisible grab zone. */
export const WithDivider = composed(ResizableStory, {args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true}}, options);

/** `isAlwaysVisible={false}`: the grip pill shows only on hover or keyboard focus. */
export const PillOnHover = composed(ResizableStory, {args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true, isAlwaysVisible: false}}, options);

/** `pillPlacement="start"`: the pill sits on the start side of the line. */
export const PillPlacementStart = composed(ResizableStory, {args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true, pillPlacement: 'start'}}, options);

/** `pillPlacement="end"`. */
export const PillPlacementEnd = composed(ResizableStory, {args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true, pillPlacement: 'end'}}, options);

/** `pillPlacement="center"`: the pill straddles the line. */
export const PillPlacementCenter = composed(ResizableStory, {args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true, pillPlacement: 'center'}}, options);

/**
 * `isReversed`: the handle sits before the pane it sizes (an end pane), so ArrowLeft grows it.
 */
// Known issue: a reversed handle without `controls` sizes its next element sibling, which is
// the handle's own <script> when it is the first ResizeHandle in the render (always in a story).
// The wrapper passes `controls` for reversed handles, so the pane is found by id.
export const Reversed = composed(ResizableStory, {
  args: {label: 'Resize inspector', resizable: {defaultSize: 200, minSize: 120, maxSize: 320}, isReversed: true, hasDivider: true},
  play: async ({canvas, canvasElement}) => {
    const separator = await handle(canvasElement, canvas, 'Resize inspector');
    separator.focus();
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '210'));
    await expect(width(canvas.getByTestId('pane'))).toBe(210);
  },
}, options);

/** `direction="vertical"` (a horizontal separator) with snap points: arrows move between snaps. */
export const VerticalWithSnaps = composed(ResizableStory, {
  args: {label: 'Resize terminal', direction: 'vertical', isReversed: true, hasDivider: true, resizable: {defaultSize: 90, minSize: 48, maxSize: 160, snaps: [48, 90, 130, 160]}},
  play: async ({canvas, canvasElement}) => {
    const separator = await handle(canvasElement, canvas, 'Resize terminal');
    const pane = canvas.getByTestId('pane');
    await expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
    separator.focus();
    // Reversed vertical: ArrowUp grows the bottom pane to the next snap point.
    await userEvent.keyboard('{ArrowUp}');
    await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '130'));
    await expect(height(pane)).toBe(130);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(separator).toHaveAttribute('aria-valuenow', '48'));
  },
}, options);

/** `isDisabled`: keeps its tab stop and announces aria-disabled; keys do nothing. */
export const Disabled = composed(ResizableStory, {
  args: {label: 'Resize invoice preview', resizable: preview, hasDivider: true, isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    const separator = await handle(canvasElement, canvas, 'Resize invoice preview');
    const sizes = recordEvents(canvasElement, 'astryx-size-change');
    await expect(separator).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    await expect(separator).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{End}');
    await expect(separator).toHaveAttribute('aria-valuenow', '220');
    await expect(sizes).toHaveLength(0);
  },
}, options);

/** `position="overlay"`: the handle sits inside the pane's edge (for panes that clip). */
export const Overlay = composed(ResizableStory, {
  args: {label: 'Resize sidebar', position: 'overlay', resizable: {defaultSize: 200, minSize: 120, maxSize: 320}},
  play: async ({canvas, canvasElement}) => {
    const separator = await handle(canvasElement, canvas, 'Resize sidebar');
    separator.focus();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(width(canvas.getByTestId('pane'))).toBe(210));
  },
}, options);

/** Custom handle content in the default slot replaces the pill. */
export const CustomGrip = composed(ResizableStory, {args: {label: 'Resize with custom grip', resizable: {defaultSize: 160, minSize: 100, maxSize: 280}, hasDivider: true, hasCustomGrip: true}}, options);

/**
 * In a Layout: a collapsible start panel and a reversed end handle. Enter (or a double-click)
 * collapses the panel: width 0, `inert`, `aria-valuetext="Collapsed"`, `astryx-collapse-change`;
 * only the grow arrow reopens it.
 */
export const CollapsibleInLayout = composed(ResizableLayout, {
  play: async ({canvas, canvasElement, step}) => {
    const separator = await handle(canvasElement, canvas, 'Resize file list');
    const files = canvas.getByRole('navigation', {name: 'Files'});
    const collapses = recordEvents<{isCollapsed: boolean}>(canvasElement, 'astryx-collapse-change');

    await step('Enter collapses the panel', async () => {
      separator.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed'));
      // While collapsed the value reports the minimum; the pane is 0 wide, inert and hidden.
      await expect(separator).toHaveAttribute('aria-valuenow', '140');
      await expect(width(files)).toBe(0);
      await expect(files.closest('[inert]')).not.toBeNull();
      await expect(collapses.map((event) => event.detail.isCollapsed)).toEqual([true]);
    });

    await step('The shrink arrow does nothing while collapsed; the grow arrow reopens it', async () => {
      await userEvent.keyboard('{ArrowLeft}');
      await expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed');
      await userEvent.keyboard('{ArrowRight}');
      await waitFor(() => expect(separator).not.toHaveAttribute('aria-valuetext'));
      await expect(Number(separator.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(140);
      await expect(collapses.map((event) => event.detail.isCollapsed)).toEqual([true, false]);
    });

    await step('A double-click toggles collapse too', async () => {
      await userEvent.dblClick(separator);
      await waitFor(() => expect(separator).toHaveAttribute('aria-valuetext', 'Collapsed'));
      await userEvent.dblClick(separator);
      await waitFor(() => expect(separator).not.toHaveAttribute('aria-valuetext'));
    });

    await step('The reversed end handle: ArrowLeft grows the inspector', async () => {
      const inspector = canvas.getByRole('separator', {name: 'Resize inspector'});
      inspector.focus();
      await userEvent.keyboard('{ArrowLeft}');
      await waitFor(() => expect(inspector).toHaveAttribute('aria-valuenow', '190'));
    });
  },
}, {controls: ['resizable', 'hasDivider'], source: layoutSource});
