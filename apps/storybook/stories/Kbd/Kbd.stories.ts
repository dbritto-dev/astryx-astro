import Kbd from 'astryx-astro/components/Kbd/Kbd.astro';
import Demo from 'astryx-astro/components/Kbd/Kbd.demo.astro';
import demoSource from 'astryx-astro/components/Kbd/Kbd.demo.astro?raw';
import {expect, waitFor} from 'storybook/test';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Content/Kbd',
  component: Kbd,
  ...astryx('Kbd'),
  args: {keys: 'mod+k'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (Kbd.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const glyphs = (root: Element) => [...root.querySelectorAll('kbd')].map((key) => key.textContent);

/**
 * `mod` is Ctrl / "Control" on the server and switches to ⌘ / "Command" on Apple platforms
 * after load, so this story shows the viewer's platform.
 */
export const Default: Story = {
  play: async ({canvasElement}) => {
    const shortcut = canvasElement.querySelector('.astryx-kbd')!;
    await expect(shortcut).toHaveAttribute('role', 'img');
    await expect(shortcut).toHaveAttribute('data-ax-kbd-apple-label', 'Command + K');
    // The glyphs are hidden; the group is named with spoken words for either platform.
    await waitFor(() => expect(['Control + K', 'Command + K']).toContain(shortcut.getAttribute('aria-label')));
    for (const key of shortcut.querySelectorAll('kbd')) await expect(key).toHaveAttribute('aria-hidden', 'true');
    await expect(['Ctrl', '⌘']).toContain(glyphs(shortcut)[0]);
  },
};

/** Modifier keys render as symbols and are spoken as words. */
export const Modifiers: Story = {
  args: {keys: 'ctrl+alt+backspace'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('img', {name: 'Control + Alt + Backspace'})).toBeVisible();
    await expect(glyphs(canvasElement)).toEqual(['⌃', '⌥', '⌫']);
  },
};

/** A single key; `esc` is an alias of `escape`. */
export const SingleKey: Story = {
  args: {keys: 'esc'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('img', {name: 'Escape'})).toHaveTextContent('Esc');
  },
};

/** `plus` is a literal "+" key. */
export const PlusKey: Story = {
  args: {keys: 'shift+plus'},
  play: async ({canvas, canvasElement}) => {
    await expect(canvas.getByRole('img', {name: 'Shift + Plus'})).toBeVisible();
    await expect(glyphs(canvasElement)).toEqual(['⇧', '+']);
  },
};

export const ArrowKey: Story = {
  args: {keys: 'up'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('img', {name: 'Up arrow'})).toHaveTextContent('↑');
  },
};

/** Letter keys are upper-cased; a sequence like `g+i` reads as "G + I". */
export const LetterKeys: Story = {
  args: {keys: 'g+i'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('img', {name: 'G + I'})).toBeVisible();
  },
};
