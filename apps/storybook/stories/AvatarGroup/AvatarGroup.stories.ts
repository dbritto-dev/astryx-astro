import AvatarGroup from 'astryx-astro/components/AvatarGroup/AvatarGroup.astro';
import Demo from 'astryx-astro/components/AvatarGroup/AvatarGroup.demo.astro';
import demoSource from 'astryx-astro/components/AvatarGroup/AvatarGroup.demo.astro?raw';
import {expect, userEvent, waitFor} from 'storybook/test';
import {recordEvents} from '../_lib/play';
import {astryx, composed, overview, type Meta} from '../_lib/story';
import AvatarGroupMatrix from './AvatarGroupMatrix.astro';
import matrixSource from './AvatarGroupMatrix.astro?raw';
import AvatarGroupStory from './AvatarGroupStory.astro';
import groupSource from './AvatarGroupStory.astro?raw';

const meta = {
  title: 'Content/Avatar Group',
  component: AvatarGroup,
  ...astryx('AvatarGroup'),
} satisfies Meta;
export default meta;

/** Every example from the docs page (AvatarGroup.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

const options = {controls: ['size', 'shape', 'aria-label', 'members', 'overflow'], source: groupSource};

/** Every size × shape; the group's size and shape win over each member's own. */
export const Matrix = composed(AvatarGroupMatrix, {}, {source: matrixSource});

/** Four static avatars and a "+5" overflow chip: a named group with no tab stops of its own. */
export const Default = composed(
  AvatarGroupStory,
  {
    play: async ({canvas, canvasElement}) => {
      const group = canvas.getByRole('group', {name: 'Avatars'});
      await expect(canvas.getByRole('img', {name: '5 more'})).toHaveTextContent('+5');
      const members = [...group.querySelectorAll('.astryx-avatar')];
      await expect(members).toHaveLength(4);
      for (const member of members) {
        await expect(member).toHaveAttribute('data-size', 'md');
        // The group owns the tab stop: static members lose their tooltip tab stop.
        await expect(member).not.toHaveAttribute('tabindex');
      }
      await expect(group).not.toHaveAttribute('aria-describedby');
      await expect(canvasElement.querySelector('[tabindex="0"]')).toBeNull();
    },
  },
  options,
);

export const Large = composed(AvatarGroupStory, {args: {size: 'lg'}}, options);

export const Rounded = composed(AvatarGroupStory, {args: {size: 'lg', shape: 'rounded'}}, options);

/** Members with status dots; each dot takes the group's size tier. */
export const WithStatus = composed(
  AvatarGroupStory,
  {
    args: {size: 'lg', members: 'status', overflow: 'none'},
    play: async ({canvas}) => {
      await expect(canvas.getByRole('img', {name: 'Ada Lovelace, Online'})).toBeVisible();
      await expect(canvas.getByRole('img', {name: 'Grace Hopper, Away'})).toBeVisible();
      await expect(canvas.getByRole('img', {name: 'Linus Torvalds, Busy'})).toBeVisible();
    },
  },
  options,
);

/** Slotted overflow content replaces "+N"; the accessible name stays "5 more". */
export const CustomOverflow = composed(
  AvatarGroupStory,
  {
    args: {size: 'sm', overflow: 'custom'},
    play: async ({canvas}) => {
      await expect(canvas.getByRole('img', {name: '5 more'})).toHaveTextContent('5+');
    },
  },
  options,
);

/**
 * Link avatars and a clickable overflow make the group one Tab stop with arrow-key focus
 * (Home/End, wrapping) and a keyboard hint; the overflow button dispatches `astryx-click`.
 */
export const Interactive = composed(
  AvatarGroupStory,
  {
    args: {'aria-label': 'Project members', members: 'links', overflow: 'clickable'},
    play: async ({canvas, canvasElement, step}) => {
      const group = canvas.getByRole('group', {name: 'Project members'});
      const ada = canvas.getByRole('link', {name: 'Ada Lovelace'});
      const grace = canvas.getByRole('link', {name: 'Grace Hopper'});
      const margaret = canvas.getByRole('link', {name: 'Margaret Hamilton'});
      const more = canvas.getByRole('button', {name: '5 more'});
      const clicks = recordEvents(canvasElement, 'astryx-click');
      await expect(group).toHaveAccessibleDescription('Use arrow keys to move between avatars');
      // The roving runtime keeps one tab stop once it has attached.
      await waitFor(() => expect(grace).toHaveAttribute('tabindex', '-1'));
      await expect(ada).toHaveAttribute('tabindex', '0');

      await step('Tab enters on the first avatar; arrows move between members', async () => {
        await userEvent.tab();
        await expect(ada).toHaveFocus();
        await userEvent.keyboard('{ArrowRight}');
        await expect(grace).toHaveFocus();
        await expect(grace).toHaveAttribute('tabindex', '0');
        await expect(ada).toHaveAttribute('tabindex', '-1');
        await userEvent.keyboard('{ArrowLeft}');
        await expect(ada).toHaveFocus();
      });

      await step('End and Home jump to the ends; arrows wrap', async () => {
        await userEvent.keyboard('{End}');
        await expect(more).toHaveFocus();
        await userEvent.keyboard('{ArrowLeft}');
        await expect(margaret).toHaveFocus();
        await userEvent.keyboard('{Home}');
        await expect(ada).toHaveFocus();
        await userEvent.keyboard('{ArrowLeft}');
        await expect(more).toHaveFocus();
        await userEvent.keyboard('{ArrowRight}');
        await expect(ada).toHaveFocus();
      });

      await step('The overflow button dispatches astryx-click', async () => {
        await userEvent.click(more);
        await waitFor(() => expect(clicks).toHaveLength(1));
        await expect(more).toHaveFocus();
      });
    },
  },
  options,
);
