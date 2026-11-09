import FieldStatus from 'astryx-astro/components/FieldStatus/FieldStatus.astro';
import Demo from 'astryx-astro/components/FieldStatus/FieldStatus.demo.astro';
import demoSource from 'astryx-astro/components/FieldStatus/FieldStatus.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import FieldStatusMatrix from './FieldStatusMatrix.astro';
import matrixSource from './FieldStatusMatrix.astro?raw';

const meta = {
  title: 'Form Controls/Field Status',
  component: FieldStatus,
  ...astryx('FieldStatus'),
  args: {type: 'error', message: 'Enter a valid email address'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (FieldStatus.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/** The page's persistent live region for a politeness (the status element itself is not one). */
const liveRegion = (politeness: 'polite' | 'assertive') => document.querySelector(`[data-astryx-live-region="${politeness}"]`);

/** Every type × variant on one canvas. */
export const Matrix = composed(FieldStatusMatrix, {}, {source: matrixSource});

/**
 * The attached variant (under a bordered control) has no icon. It is not a live region: its
 * message is spoken through the page's assertive live region, again whenever it changes.
 */
export const ErrorMessage: Story = {
  play: async ({canvasElement}) => {
    const status = canvasElement.querySelector<HTMLElement>('[data-ax-field-status]')!;
    await expect(status).not.toHaveAttribute('aria-live');
    status.textContent = 'This email is already registered';
    await waitFor(() => expect(liveRegion('assertive')).toHaveTextContent('This email is already registered'));
  },
};

/** Warnings and successes are spoken politely. */
export const WarningMessage: Story = {
  args: {type: 'warning', message: 'This address is already invited'},
  play: async ({canvasElement}) => {
    const status = canvasElement.querySelector<HTMLElement>('[data-ax-field-status]')!;
    status.textContent = 'This address was invited yesterday';
    await waitFor(() => expect(liveRegion('polite')).toHaveTextContent('This address was invited yesterday'));
  },
};

export const SuccessMessage: Story = {args: {type: 'success', message: 'Email verified'}};

/** The detached variant floats below a control with a decorative status icon; the words carry the status. */
export const Detached: Story = {
  args: {variant: 'detached'},
  play: async ({canvasElement}) => {
    const status = canvasElement.querySelector<HTMLElement>('[data-ax-field-status]')!;
    await expect(status).toHaveTextContent('Enter a valid email address');
    await expect(status.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull();
  },
};

export const DetachedWarning: Story = {args: {type: 'warning', variant: 'detached', message: 'This will be visible to others'}};

export const DetachedSuccess: Story = {args: {type: 'success', variant: 'detached', message: 'Backups are on'}};

/** Deprecated in Astryx: `variant="tooltip"` draws a plain, detached-style box. */
export const TooltipVariant: Story = {args: {variant: 'tooltip'}};
