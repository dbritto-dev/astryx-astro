import RadioList from 'astryx-astro/components/RadioList/RadioList.astro';
import Demo from 'astryx-astro/components/RadioList/RadioList.demo.astro';
import demoSource from 'astryx-astro/components/RadioList/RadioList.demo.astro?raw';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import RadioListStory from './RadioListStory.astro';
import storySource from './RadioListStory.astro?raw';
import RadioListRichItems from './RadioListRichItems.astro';
import richSource from './RadioListRichItems.astro?raw';

const meta = {
  title: 'Form Controls/Radio List',
  component: RadioList,
  ...astryx('RadioList'),
  args: {label: 'Notification preference'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (RadioList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type RadioHost = HTMLElement & {value: string};
const options = {
  controls: ['label', 'description', 'value', 'orientation', 'size', 'htmlName', 'isLabelHidden', 'labelTooltip', 'isDisabled', 'disabledMessage', 'isRequired', 'isOptional', 'status', 'hasDisabledItem'],
  source: storySource,
};
const group = (root: HTMLElement) => within(root).getByRole('radiogroup', {name: /^Notification preference/});

/**
 * Tab enters on the selected radio; ArrowDown / ArrowUp move and select (native radio-group
 * roving, wrapping at the ends); a click on a label selects. Each selection reports
 * `astryx-change` `{value}`.
 */
export const Default = composed(RadioListStory, {
  args: {value: 'email', htmlName: 'notify', description: 'How we reach you about your orders'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<RadioHost>(canvasElement, 'ax-radio-list');
    const changes = recordEvents<{value: string}>(canvasElement, 'astryx-change');
    await expect(group(canvasElement)).toHaveAccessibleDescription('How we reach you about your orders');
    const email = canvas.getByRole('radio', {name: 'Email'});
    const sms = canvas.getByRole('radio', {name: 'SMS'});
    const push = canvas.getByRole('radio', {name: 'Push'});
    await expect(sms).toHaveAccessibleDescription('Standard messaging rates apply');
    await expect(email).toHaveAttribute('name', 'notify');

    await step('Tab enters on the selected radio', async () => {
      await userEvent.tab();
      await expect(email).toHaveFocus();
    });
    await step('ArrowDown selects the next radio; ArrowDown at the end wraps', async () => {
      await userEvent.keyboard('{ArrowDown}');
      await expect(sms).toBeChecked();
      await expect(sms).toHaveFocus();
      await userEvent.keyboard('{ArrowDown}{ArrowDown}');
      await expect(email).toBeChecked();
    });
    await step('ArrowUp wraps back to the last radio', async () => {
      await userEvent.keyboard('{ArrowUp}');
      await expect(push).toBeChecked();
    });
    await step('A label click selects its radio', async () => {
      await userEvent.click(canvas.getByText('SMS'));
      await expect(sms).toBeChecked();
    });
    await expect(changes.map((e) => e.detail.value)).toEqual(['sms', 'push', 'email', 'push', 'sms']);
    await expect(host.value).toBe('sms');
  },
}, options);

/** No selection: Tab enters on the first radio and focus alone selects nothing. */
export const NoSelection = composed(RadioListStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-radio-list');
    await userEvent.tab();
    await expect(canvas.getByRole('radio', {name: 'Email'})).toHaveFocus();
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).not.toBeChecked();
  },
}, options);

/** Items in a row; ArrowRight and ArrowLeft move the selection. */
export const Horizontal = composed(RadioListStory, {
  args: {value: 'email', orientation: 'horizontal'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-radio-list');
    canvas.getByRole('radio', {name: 'Email'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(canvas.getByRole('radio', {name: 'SMS'})).toBeChecked();
    await userEvent.keyboard('{ArrowLeft}');
    await expect(canvas.getByRole('radio', {name: 'Email'})).toBeChecked();
  },
}, options);

export const Small = composed(RadioListStory, {args: {value: 'sms', size: 'sm'}}, options);

export const SmallHorizontal = composed(RadioListStory, {args: {value: 'sms', size: 'sm', orientation: 'horizontal'}}, options);

/** A disabled option is natively disabled: arrows skip it. */
export const WithDisabledItem = composed(RadioListStory, {
  args: {value: 'sms', hasDisabledItem: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-radio-list');
    await expect(canvas.getByRole('radio', {name: 'Fax'})).toBeDisabled();
    canvas.getByRole('radio', {name: 'SMS'}).focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(canvas.getByRole('radio', {name: 'Push'})).toBeChecked();
  },
}, options);

/** Rich items: a label slot named by `aria-label`, a description slot, start and end content. */
export const RichItems = composed(RadioListRichItems, {
  play: async ({canvas}) => {
    await expect(canvas.getByRole('radio', {name: 'Team, recommended'})).toBeChecked();
    await expect(canvas.getByRole('radio', {name: 'Team, recommended'})).toHaveAccessibleDescription('Unlimited projects, 10 seats');
  },
}, {source: richSource});

/** The group label is visually hidden and still names the group. */
export const LabelHidden = composed(RadioListStory, {
  args: {value: 'email', isLabelHidden: true},
  play: async ({canvasElement}) => {
    await expect(group(canvasElement)).toBeInTheDocument();
  },
}, options);

/** An info icon at the end of the group label; hovering it shows the help text. */
export const WithLabelTooltip = composed(RadioListStory, {
  args: {value: 'email', labelTooltip: 'Order updates only, never marketing'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-radio-list');
    const icon = canvasElement.querySelector('[data-ax-label-tip]')!;
    const tip = document.getElementById(icon.getAttribute('data-ax-tooltip')!);
    await userEvent.hover(icon);
    await waitFor(() => expect(isShowing(tip)).toBe(true));
    await expect(tip).toHaveTextContent('Order updates only, never marketing');
  },
}, options);

/** Every radio natively disabled; the group is `aria-disabled`. */
export const Disabled = composed(RadioListStory, {
  args: {value: 'email', isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await expect(group(canvasElement)).toHaveAttribute('aria-disabled', 'true');
    for (const radio of canvas.getAllByRole('radio')) await expect(radio).toBeDisabled();
  },
}, options);

/**
 * With a reason the radios stay focusable (`aria-disabled`), the reason shows as a tooltip on
 * keyboard focus and describes each radio; arrows change nothing (and the pointer passes through).
 */
export const DisabledWithMessage = composed(RadioListStory, {
  args: {value: 'email', isDisabled: true, disabledMessage: 'Locked by your organization'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-radio-list');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const email = canvas.getByRole('radio', {name: 'Email'});
    await expect(email).toHaveAttribute('aria-disabled', 'true');
    await expect(email).toHaveAccessibleDescription('Locked by your organization');
    await userEvent.tab();
    await expect(email).toHaveFocus();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
    await userEvent.keyboard('{ArrowDown}');
    await expect(email).toBeChecked();
    await expect(canvas.getByRole('radio', {name: 'SMS'})).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
}, options);

/** The group is `aria-required`; the radios carry native `required`. */
export const Required = composed(RadioListStory, {
  args: {isRequired: true},
  play: async ({canvas, canvasElement}) => {
    await expect(group(canvasElement)).toHaveAttribute('aria-required', 'true');
    await expect(canvas.getByRole('radio', {name: 'Email'})).toBeRequired();
  },
}, options);

export const Optional = composed(RadioListStory, {args: {value: 'push', isOptional: true}}, options);

/** An error status: the group is `aria-invalid` and described by the detached message. */
export const ErrorStatus = composed(RadioListStory, {
  args: {status: {type: 'error', message: 'Choose how we reach you'}},
  play: async ({canvasElement}) => {
    const list = group(canvasElement);
    await expect(list).toHaveAttribute('aria-invalid', 'true');
    await expect(list).toHaveAccessibleDescription('Choose how we reach you');
  },
}, options);

export const WarningStatus = composed(RadioListStory, {args: {value: 'sms', status: {type: 'warning', message: 'SMS may incur charges'}}}, options);

export const SuccessStatus = composed(RadioListStory, {args: {value: 'email', status: {type: 'success', message: 'Preference saved'}}}, options);
