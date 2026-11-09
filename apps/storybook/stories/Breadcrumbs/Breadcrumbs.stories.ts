import Breadcrumbs from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.astro';
import Demo from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.demo.astro';
import demoSource from 'astryx-astro/components/Breadcrumbs/Breadcrumbs.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {isShowing, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import BreadcrumbsStory from './BreadcrumbsStory.astro';
import storySource from './BreadcrumbsStory.astro?raw';

const meta = {
  title: 'Navigation/Breadcrumbs',
  component: Breadcrumbs,
  ...astryx('Breadcrumbs'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (Breadcrumbs.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

/**
 * Keeps link clicks in the story while a play runs. The preview logs link navigations instead
 * of following them, but only inside `#storybook-root` / `.docs-story`; the container that
 * `pnpm -F storybook test` renders into is neither, so a clicked link would leave the test page.
 * Same phase as the preview's guard (bubble, on window): components see the click first.
 */
function holdNavigation(): () => void {
  const guard = (event: MouseEvent) => {
    if (!event.defaultPrevented && (event.target as Element | null)?.closest?.('a[href]')) event.preventDefault();
  };
  window.addEventListener('click', guard);
  return () => window.removeEventListener('click', guard);
}

const options = {controls: ['variant', 'separator', 'label', 'trail', 'iconSeparator', 'dir'], source: storySource};

/**
 * A labelled `<nav>` around an ordered list; the last item is the current page automatically
 * (`aria-current="page"` on its link); separators are decorative and hidden before the first item.
 */
export const Default = composed(BreadcrumbsStory, {
  play: async ({canvas, canvasElement}) => {
    const nav = canvas.getByRole('navigation', {name: 'Breadcrumb'});
    await expect(nav.firstElementChild?.tagName).toBe('OL');
    const current = canvasElement.querySelectorAll('[aria-current]');
    await expect(current).toHaveLength(1);
    await expect(canvas.getByRole('link', {name: 'Apollo'})).toHaveAttribute('aria-current', 'page');
    const separators = [...canvasElement.querySelectorAll('.ax-breadcrumb-separator')];
    for (const separator of separators) await expect(separator).toHaveAttribute('aria-hidden', 'true');
    await expect(separators[0]).not.toBeVisible();
    await expect(separators[1]).toBeVisible();
  },
}, options);

/** Start icons before the labels; the last item has no `href` and renders current text. */
export const WithIcons = composed(BreadcrumbsStory, {
  args: {trail: 'icons'},
  play: async ({canvas}) => {
    await expect(canvas.getByText('Apollo').closest('[aria-current="page"]')).not.toBeNull();
  },
}, options);

/** `variant="supporting"`: smaller, secondary text. */
export const Supporting = composed(BreadcrumbsStory, {args: {variant: 'supporting'}}, options);

/** A text `separator` (› is mirrored by the bidi algorithm). */
export const CustomSeparator = composed(BreadcrumbsStory, {
  args: {separator: '›'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelectorAll('.ax-breadcrumb-separator')[1]).toHaveTextContent('›');
  },
}, options);

/** An Icon in the `separator` slot, with `ax-mirror-rtl` so it flips in right-to-left trails. */
export const IconSeparator = composed(BreadcrumbsStory, {
  args: {iconSeparator: true, variant: 'supporting'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelectorAll('.ax-breadcrumb-separator')[1].querySelector('svg')).not.toBeNull();
  },
}, options);

/** `label` names the landmark. */
export const CustomLabel = composed(BreadcrumbsStory, {
  args: {label: 'Project trail'},
  play: async ({canvas}) => {
    await expect(canvas.getByRole('navigation', {name: 'Project trail'})).toBeVisible();
  },
}, options);

/**
 * A crumb with `menu` is a menu button: Enter or ArrowDown open it on the first row, Space
 * opens it, arrows move, Escape closes and refocuses the trigger, Tab closes, a row closes it. Also a button crumb
 * (`interactiveRole="button"`) and an explicit current page.
 */
export const WithMenu = composed(BreadcrumbsStory, {
  args: {trail: 'menu'},
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-menu');
    const trigger = canvas.getByRole('button', {name: 'Projects'});
    const layer = canvasElement.querySelector('ax-menu');
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(canvas.getByRole('button', {name: 'Apollo'})).toHaveAttribute('type', 'button');
    await expect(canvas.getByText('Settings')).toHaveAttribute('aria-current', 'page');

    await step('Enter opens the menu on the first row; ArrowDown moves', async () => {
      trigger.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Apollo'})).toHaveFocus());
      await userEvent.keyboard('{ArrowDown}');
      await expect(canvas.getByRole('menuitem', {name: 'Gemini'})).toHaveFocus();
    });

    await step('Escape closes it and refocuses the trigger', async () => {
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(isShowing(layer)).toBe(false));
      await expect(trigger).toHaveFocus();
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    await step('ArrowDown opens it too; Tab closes it', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Apollo'})).toHaveFocus());
      await userEvent.tab();
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });

    await step('Space opens it on the first row', async () => {
      trigger.focus();
      await userEvent.keyboard(' ');
      await waitFor(() => expect(canvas.getByRole('menuitem', {name: 'Apollo'})).toHaveFocus());
      // Close with Tab: a synthetic Escape right after a synthetic Space crashes the Chrome
      // renderer under user-event (real keys work: tools/tests/breadcrumbs.test.mjs).
      await userEvent.tab();
      await waitFor(() => expect(isShowing(layer)).toBe(false));
    });

    await step('A click opens it; choosing a row closes it', async () => {
      await userEvent.click(trigger);
      await waitFor(() => expect(isShowing(layer)).toBe(true));
      const release = holdNavigation();
      try {
        await userEvent.click(canvas.getByRole('menuitem', {name: 'Gemini'}));
        await waitFor(() => expect(isShowing(layer)).toBe(false));
      } finally {
        release();
      }
    });
  },
}, options);

/** A current crumb with a menu keeps `aria-current="page"`; supporting trails get small menu rows. */
export const CurrentWithMenu = composed(BreadcrumbsStory, {
  args: {trail: 'currentMenu', variant: 'supporting', iconSeparator: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-menu');
    const trigger = canvas.getByRole('button', {name: 'Billing'});
    await expect(trigger).toHaveAttribute('aria-current', 'page');
    await userEvent.click(trigger);
    await waitFor(() => expect(isShowing(canvasElement.querySelector('ax-menu'))).toBe(true));
    for (const row of canvas.getAllByRole('menuitem')) await expect(row).toHaveAttribute('data-size', 'sm');
    await userEvent.keyboard('{Escape}');
  },
}, options);

/** `isCurrent={false}` on the last item: no item is the current page. */
export const LastNotCurrent = composed(BreadcrumbsStory, {
  args: {trail: 'notCurrent'},
  play: async ({canvasElement}) => {
    await expect(canvasElement.querySelectorAll('[aria-current]')).toHaveLength(0);
  },
}, options);

/** Right-to-left: the trail runs from the right and the slash separator mirrors. */
export const RightToLeft = composed(BreadcrumbsStory, {
  args: {dir: 'rtl'},
  play: async ({canvasElement}) => {
    const [first, second, third] = [...canvasElement.querySelectorAll('li')].map((li) => li.getBoundingClientRect().left);
    await expect(first).toBeGreaterThan(second);
    await expect(second).toBeGreaterThan(third);
  },
}, options);
