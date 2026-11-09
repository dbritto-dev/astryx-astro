import Spinner from 'astryx-astro/components/Spinner/Spinner.astro';
import Demo from 'astryx-astro/components/Spinner/Spinner.demo.astro';
import demoSource from 'astryx-astro/components/Spinner/Spinner.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import SpinnerInserted from './SpinnerInserted.astro';
import insertedSource from './SpinnerInserted.astro?raw';
import SpinnerMatrix from './SpinnerMatrix.astro';
import matrixSource from './SpinnerMatrix.astro?raw';

const meta = {
  title: 'Feedback & Status/Spinner',
  component: Spinner,
  ...astryx('Spinner'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Spinner.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** Every size × shade, `onMedia` on a dark surface and `inherit` inside a coloured one. */
export const Matrix = composed(SpinnerMatrix, {}, {source: matrixSource});

const politeRegion = () => document.querySelector('[data-astryx-live-region="polite"]');

/** An indeterminate progressbar (no value) named "Loading". */
export const Default: Story = {
  play: async ({canvas}) => {
    const spinner = canvas.getByRole('progressbar', {name: 'Loading'});
    await expect(spinner).not.toHaveAttribute('aria-valuenow');
    // Not asserted: that a spinner present at page load stays silent. Storybook inserts every
    // story after the preview has loaded, so each standalone spinner here counts as inserted.
  },
};

export const Small: Story = {args: {size: 'sm'}};

export const Large: Story = {args: {size: 'lg'}};

export const ExtraLarge: Story = {args: {size: 'xl'}};

/** A lighter ring for secondary loading states. */
export const Subtle: Story = {args: {shade: 'subtle', size: 'lg'}};

/** A visible label below the ring also names the progressbar (aria-labelledby). */
export const WithLabel: Story = {
  args: {size: 'xl', label: 'Loading results'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('progressbar', {name: 'Loading results'})).toHaveAttribute('aria-labelledby');
  },
};

/** Rich content in the `label` slot; the name comes from `aria-label`. */
export const LabelSlot: Story = {
  args: {
    size: 'lg',
    shade: 'subtle',
    'aria-label': 'Fetching data',
    slots: {label: '<span style="text-align:center;font-size:var(--font-size-sm)"><strong>Fetching data</strong><br>This may take a moment</span>'},
  },
  play: async ({canvas}) => {
    await expect(canvas.getByRole('progressbar', {name: 'Fetching data'})).toBeVisible();
  },
};

/** `aria-hidden` for a spinner composed into an owner that names the busy state itself. */
export const Hidden: Story = {
  args: {'aria-hidden': 'true'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.queryByRole('progressbar')).toBeNull();
    await expect(canvasElement.querySelector('.astryx-spinner')).not.toHaveAttribute('data-ax-announce-rendered-text');
  },
};

/** The default name in another language. */
export const Localized: Story = {
  args: {locale: 'es-ES'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('progressbar')).toHaveAccessibleName('Cargando');
  },
};

/** A spinner inserted after load announces its label once through the polite live region. */
export const InsertedAfterLoad = composed(
  SpinnerInserted,
  {
    play: async ({canvas, canvasElement}) => {
      const host = canvasElement.querySelector('[data-spinner-host]')!;
      const template = host.querySelector<HTMLTemplateElement>('template[data-spinner-template]')!;
      host.append(template.content.cloneNode(true));
      await expect(canvas.getByRole('progressbar', {name: 'Loading comments'})).toBeVisible();
      await waitFor(() => expect(politeRegion()?.textContent ?? '').toContain('Loading comments'));
    },
  },
  {source: insertedSource},
);
