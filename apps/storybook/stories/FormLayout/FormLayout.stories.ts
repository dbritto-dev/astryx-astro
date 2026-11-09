import FormLayout from 'astryx-astro/components/FormLayout/FormLayout.astro';
import Demo from 'astryx-astro/components/FormLayout/FormLayout.demo.astro';
import demoSource from 'astryx-astro/components/FormLayout/FormLayout.demo.astro?raw';
import {expect} from 'storybook/test';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import FormLayoutNested from './FormLayoutNested.astro';
import nestedSource from './FormLayoutNested.astro?raw';
import FormLayoutStory from './FormLayoutStory.astro';
import storySource from './FormLayoutStory.astro?raw';

const meta = {
  title: 'Layout/Form Layout',
  component: FormLayout,
  ...astryx('FormLayout'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (FormLayout.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['direction', 'defaultOptionality', 'hasTextArea'], source: storySource};

type Canvas = {getByRole: (role: string, options: {name: RegExp}) => HTMLElement};
const box = (canvas: Canvas, name: RegExp) => canvas.getByRole('textbox', {name}).getBoundingClientRect();
/** The visible optional / required indicator texts, in field order. */
const indicators = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-ax-indicator]')].filter((el) => el.checkVisibility()).map((el) => el.dataset.axIndicator);

/** `direction="vertical"` (default): fields stack; without `defaultOptionality` both indicators show. */
export const Vertical = composed(FormLayoutStory, {
  play: async ({canvas, canvasElement}) => {
    await expect(box(canvas, /Website/).top).toBeGreaterThan(box(canvas, /Organization/).bottom);
    await expect(indicators(canvasElement)).toEqual(['optional', 'required']);
  },
}, options);

/** `direction="horizontal"`: one `1fr` grid track per field, side by side. */
export const Horizontal = composed(FormLayoutStory, {
  args: {direction: 'horizontal'},
  play: async ({canvas}) => {
    const [a, b, c] = [/Organization/, /Website/, /Contact email/].map((name) => box(canvas, name));
    await expect(b.left).toBeGreaterThan(a.right);
    await expect(c.left).toBeGreaterThan(b.right);
    await expect(Math.round(b.width)).toBe(Math.round(a.width));
  },
}, options);

/**
 * `direction="horizontal-labels"`: labels in a column beside the inputs (it collapses to vertical
 * at a viewport of 480px or less).
 */
export const HorizontalLabels = composed(FormLayoutStory, {
  args: {direction: 'horizontal-labels', hasTextArea: true},
  play: async ({canvas, canvasElement}) => {
    const label = canvasElement.querySelector('label')!.getBoundingClientRect();
    const input = box(canvas, /Organization/);
    await expect(input.left).toBeGreaterThan(label.right);
    // All inputs share one column.
    await expect(box(canvas, /Website/).left).toBe(input.left);
  },
}, options);

/**
 * `defaultOptionality="required"`: unmarked fields are required (aria-required) and only the
 * exception, "Optional", shows an indicator.
 */
export const DefaultOptionalityRequired = composed(FormLayoutStory, {
  args: {defaultOptionality: 'required'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('textbox', {name: /Organization/})).toBeRequired();
    await expect(canvas.getByRole('textbox', {name: /Website/})).not.toBeRequired();
    await expect(canvas.getByRole('textbox', {name: /Contact email/})).toBeRequired();
    await expect(indicators(canvasElement)).toEqual(['optional']);
  },
}, options);

/** `defaultOptionality="optional"`: only "Required" shows; unmarked fields stay optional. */
export const DefaultOptionalityOptional = composed(FormLayoutStory, {
  args: {defaultOptionality: 'optional'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('textbox', {name: /Organization/})).not.toBeRequired();
    await expect(indicators(canvasElement)).toEqual(['required']);
  },
}, options);

/** Horizontal labels with required as the default, as on a settings page. */
export const HorizontalLabelsRequired = composed(FormLayoutStory, {args: {direction: 'horizontal-labels', defaultOptionality: 'required'}}, options);

/** A horizontal FormLayout nested in a vertical one: the inner one shadows the direction. */
export const Nested = composed(FormLayoutNested, {
  play: async ({canvas}) => {
    const street = box(canvas, /Street/);
    const city = box(canvas, /City/);
    const country = box(canvas, /Country/);
    await expect(city.top).toBeGreaterThan(street.bottom);
    await expect(country.top).toBe(city.top);
  },
}, {controls: ['defaultOptionality'], source: nestedSource});
