import SelectableCard from 'astryx-astro/components/SelectableCard/SelectableCard.astro';
import Demo from 'astryx-astro/components/SelectableCard/SelectableCard.demo.astro';
import demoSource from 'astryx-astro/components/SelectableCard/SelectableCard.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import SelectableCardMatrix from './SelectableCardMatrix.astro';
import matrixSource from './SelectableCardMatrix.astro?raw';
import SelectableCardRadio from './SelectableCardRadio.astro';
import radioSource from './SelectableCardRadio.astro?raw';

const content = (heading: string, text: string) =>
  `<p style="margin:0;font-weight:var(--font-weight-semibold)" data-testid="title">${heading}</p>` +
  `<p style="margin:var(--spacing-1) 0 0;font-size:var(--text-supporting-size);color:var(--color-text-secondary)">${text}</p>`;

const meta = {
  title: 'Container/Selectable Card',
  component: SelectableCard,
  ...astryx('SelectableCard'),
  args: {label: 'Pro plan', maxWidth: 300, slots: {default: content('Pro plan', '$12 per user per month, billed yearly.')}},
} satisfies Meta;
export default meta;

/** Every example from the docs page (SelectableCard.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const cardOf = (input: HTMLElement) => input.closest<HTMLElement>('.astryx-selectable-card')!;

/**
 * A hidden native checkbox named by `label` carries the state. Space and Enter toggle it, so does
 * a click anywhere on the card; each change reports `astryx-change` {isSelected} and
 * `data-selected` follows.
 */
export const Default: Story = {
  play: async ({canvas, canvasElement, step}) => {
    const input = canvas.getByRole('checkbox', {name: 'Pro plan'});
    const card = cardOf(input);
    const changes = recordEvents<{isSelected: boolean}>(canvasElement, 'astryx-change');
    await expect(input).not.toBeChecked();
    await expect(card).toHaveAttribute('data-selected', 'false');

    await step('Tab reaches the card; Space selects it', async () => {
      await userEvent.tab();
      await expect(input).toHaveFocus();
      await userEvent.keyboard(' ');
      await expect(input).toBeChecked();
      await waitFor(() => expect(card).toHaveAttribute('data-selected', 'true'));
    });
    await step('Enter toggles it off', async () => {
      await userEvent.keyboard('{Enter}');
      await expect(input).not.toBeChecked();
      await waitFor(() => expect(card).toHaveAttribute('data-selected', 'false'));
    });
    await step('A click anywhere on the card toggles it', async () => {
      await userEvent.click(canvas.getByTestId('title'));
      await expect(input).toBeChecked();
      await userEvent.click(card);
      await expect(input).not.toBeChecked();
    });
    await expect(changes.map((event) => event.detail.isSelected)).toEqual([true, false, true, false]);
  },
};

/** `isSelected`: selected on load (an inset accent ring; no JavaScript needed for the paint). */
export const Selected: Story = {
  args: {isSelected: true},
  play: async ({canvas}) => {
    const input = canvas.getByRole('checkbox', {name: 'Pro plan'});
    await expect(input).toBeChecked();
    await expect(cardOf(input)).toHaveAttribute('data-selected', 'true');
  },
};

/** `isDisabled`: dimmed, still focusable with aria-disabled; clicks, Space and Enter do nothing. */
export const Disabled: Story = {
  args: {isDisabled: true, label: 'Enterprise plan', slots: {default: content('Enterprise plan', 'Contact sales to enable it.')}},
  play: async ({canvas, canvasElement}) => {
    const input = canvas.getByRole('checkbox', {name: 'Enterprise plan'});
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(input).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(canvas.getByTestId('title'));
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{Enter}');
    await expect(input).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
};

/** A nested link keeps its own click and does not toggle the card. */
export const NestedLink: Story = {
  args: {slots: {default: content('Pro plan', '$12 per user per month.') + '<a href="#compare-plans" style="font-size:var(--text-supporting-size)">Compare plans</a>'}},
  play: async ({canvas}) => {
    const link = canvas.getByRole('link', {name: 'Compare plans'});
    // Stay on the page: the Vitest runner renders outside the preview's navigation guard.
    link.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(link);
    await expect(canvas.getByRole('checkbox', {name: 'Pro plan'})).not.toBeChecked();
  },
};

/** A tinted variant, selected, with `elevation="low"` under the ring. */
export const TintedElevated: Story = {args: {variant: 'blue', elevation: 'low', isSelected: true}};

/** `padding` and `width`. */
export const PaddingAndWidth: Story = {args: {padding: 6, width: 260, maxWidth: undefined}};

/**
 * `type="radio"` with a shared `name` (port extension): one choice of a native radio set. Choosing
 * a card deselects the others; a card never deselects itself; the form submits the choice.
 */
export const RadioGroup = composed(SelectableCardRadio, {
  play: async ({canvas, canvasElement}) => {
    const standard = canvas.getByRole('radio', {name: 'Standard shipping'});
    const express = canvas.getByRole('radio', {name: 'Express shipping'});
    await expect(standard).toBeChecked();
    await userEvent.click(cardOf(express));
    await expect(express).toBeChecked();
    await expect(standard).not.toBeChecked();
    await waitFor(() => expect(cardOf(standard)).toHaveAttribute('data-selected', 'false'));
    await userEvent.click(cardOf(express));
    await expect(express).toBeChecked();
    await expect(new FormData(canvasElement.querySelector('form')!).get('shipping')).toBe('express');
  },
}, {controls: ['variant'], source: radioSource});

/** Every `variant`, unselected and selected. */
export const Matrix = composed(SelectableCardMatrix, {}, {source: matrixSource});
