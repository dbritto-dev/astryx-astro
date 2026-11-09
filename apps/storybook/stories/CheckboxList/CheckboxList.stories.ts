import CheckboxList from 'astryx-astro/components/CheckboxList/CheckboxList.astro';
import Demo from 'astryx-astro/components/CheckboxList/CheckboxList.demo.astro';
import demoSource from 'astryx-astro/components/CheckboxList/CheckboxList.demo.astro?raw';
import {expect, userEvent, waitFor, within} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, composed, overview, type Meta, type Story} from '../_lib/story';
import CheckboxListStory from './CheckboxListStory.astro';
import storySource from './CheckboxListStory.astro?raw';
import CheckboxListSelectAll from './CheckboxListSelectAll.astro';
import selectAllSource from './CheckboxListSelectAll.astro?raw';
import CheckboxListItemOptions from './CheckboxListItemOptions.astro';
import itemOptionsSource from './CheckboxListItemOptions.astro?raw';

const meta = {
  title: 'Form Controls/Checkbox List',
  component: CheckboxList,
  ...astryx('CheckboxList'),
  args: {label: 'Notifications'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (CheckboxList.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type ListHost = HTMLElement & {value: string[]};
type Values = {values: string[]};

const options = {
  controls: ['label', 'description', 'value', 'density', 'hasDividers', 'isLabelHidden', 'isDisabled', 'disabledMessage', 'isReadOnly', 'isRequired', 'isOptional', 'status', 'htmlName'],
  source: storySource,
};
const group = (root: HTMLElement) => within(root).getByRole('group', {name: /^Notifications/});

/**
 * Collection mode (`value`): the list owns the checked values. A click on a checkbox, a click on
 * its row and Space each toggle one item, and every toggle reports `astryx-change` `{values}`
 * (a checked value is appended, an unchecked one removed).
 */
export const Default = composed(CheckboxListStory, {
  args: {value: ['email'], description: 'Where we reach you', htmlName: 'notify'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<ListHost>(canvasElement, 'ax-checkbox-list');
    const changes = recordEvents<Values>(canvasElement, 'astryx-change');
    const list = group(canvasElement);
    await expect(list).toHaveAccessibleDescription('Where we reach you');
    const email = canvas.getByRole('checkbox', {name: 'Email'});
    const sms = canvas.getByRole('checkbox', {name: 'SMS'});
    await expect(sms).toHaveAccessibleDescription('Standard rates apply');
    await expect(email).toBeChecked();
    await expect(email).toHaveAttribute('name', 'notify');
    await expect(email).toHaveAttribute('value', 'email');

    await step('A checkbox click appends its value', async () => {
      await userEvent.click(sms);
      await expect(sms).toBeChecked();
      await expect(sms.closest('li')).toHaveAttribute('data-selected', 'selected');
    });
    await step('A click on the row surface toggles its checkbox', async () => {
      await userEvent.click(canvas.getByText('On your devices'));
      await expect(canvas.getByRole('checkbox', {name: 'Push'})).toBeChecked();
    });
    await step('Space on a focused checkbox removes its value', async () => {
      email.focus();
      await userEvent.keyboard(' ');
      await expect(email).not.toBeChecked();
    });
    await expect(changes.map((e) => e.detail.values)).toEqual([['email', 'sms'], ['email', 'sms', 'push'], ['sms', 'push']]);
    await expect(host.value).toEqual(['sms', 'push']);
  },
}, options);

/** `density="compact"` also uses the small checkbox. */
export const Compact = composed(CheckboxListStory, {args: {value: ['email'], density: 'compact'}}, options);

export const Spacious = composed(CheckboxListStory, {args: {value: ['email'], density: 'spacious'}}, options);

export const WithDividers = composed(CheckboxListStory, {args: {value: ['email'], hasDividers: true}}, options);

/** The group label is visually hidden and still names the group. */
export const LabelHidden = composed(CheckboxListStory, {
  args: {value: ['email'], isLabelHidden: true},
  play: async ({canvasElement}) => {
    await expect(group(canvasElement)).toBeInTheDocument();
  },
}, options);

/** Standalone items (no `value`): each row reports its own `astryx-check` `{isChecked}`; the list reports nothing. */
export const Standalone = composed(CheckboxListStory, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const checks = recordEvents<{isChecked: boolean}>(canvasElement, 'astryx-check');
    const changes = recordEvents(canvasElement, 'astryx-change');
    const email = canvas.getByRole('checkbox', {name: 'Email'});
    await expect(email).toBeChecked();
    await userEvent.click(email);
    await userEvent.click(canvas.getByRole('checkbox', {name: 'Push'}));
    await expect(checks.map((e) => [(e.target as HTMLElement).querySelector('input')!.value, e.detail.isChecked])).toEqual([['email', false], ['push', true]]);
    await expect(changes).toHaveLength(0);
  },
}, options);

/**
 * A select-all item (port extension `isSelectAll`) shows checked / indeterminate / unchecked from
 * the enabled items and checks or unchecks all of them; a disabled item keeps its state.
 */
export const SelectAll = composed(CheckboxListSelectAll, {
  play: async ({canvas, canvasElement, step}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const changes = recordEvents<Values>(canvasElement, 'astryx-change');
    const all = canvas.getByRole('checkbox', {name: 'All columns'});
    const role = canvas.getByRole('checkbox', {name: 'Role'});
    const id = canvas.getByRole('checkbox', {name: 'ID (always shown)'});
    await expect(all).toBePartiallyChecked();
    await step('Select all checks every enabled item', async () => {
      await userEvent.click(all);
      await expect(all).toBeChecked();
      await expect(role).toBeChecked();
      await expect(id).not.toBeChecked();
      await expect(changes.at(-1)?.detail.values).toEqual(['name', 'email', 'role']);
    });
    await step('Unchecking one item makes select-all indeterminate', async () => {
      await userEvent.click(role);
      await expect(all).toBePartiallyChecked();
    });
    await step('Select all again, then again to uncheck everything', async () => {
      await userEvent.click(all);
      await userEvent.click(all);
      await expect(all).not.toBeChecked();
      await expect(all).not.toBePartiallyChecked();
      await expect(changes.at(-1)?.detail.values).toEqual([]);
    });
  },
}, {source: selectAllSource});

/**
 * Item options: a rich label named by `aria-label`, a description slot, end content, a disabled
 * item (focusable, Space does nothing) and a loading item (`aria-busy`, Space does nothing).
 */
export const ItemOptions = composed(CheckboxListItemOptions, {
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(canvas.getByRole('checkbox', {name: 'Pro plan Recommended'})).toBeChecked();
    await expect(canvas.getByRole('checkbox', {name: 'Priority support'})).toHaveAccessibleDescription('Replies within 4 hours');
    const sso = canvas.getByRole('checkbox', {name: 'Single sign-on'});
    await expect(sso).toHaveAttribute('aria-disabled', 'true');
    sso.focus();
    await userEvent.keyboard(' ');
    await expect(sso).not.toBeChecked();
    const storage = canvas.getByRole('checkbox', {name: 'Extra storage'});
    await expect(storage).toHaveAttribute('aria-busy', 'true');
    storage.focus();
    await userEvent.keyboard(' ');
    await expect(storage).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
}, {source: itemOptionsSource});

/** The group is `aria-disabled`; every checkbox stays focusable but ignores the pointer and Space. */
export const Disabled = composed(CheckboxListStory, {
  args: {value: ['email'], isDisabled: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const changes = recordEvents(canvasElement, 'astryx-change');
    await expect(group(canvasElement)).toHaveAttribute('aria-disabled', 'true');
    const sms = canvas.getByRole('checkbox', {name: 'SMS'});
    await expect(sms).toHaveAttribute('aria-disabled', 'true');
    sms.focus();
    await userEvent.keyboard(' ');
    await expect(sms).not.toBeChecked();
    await expect(changes).toHaveLength(0);
  },
}, options);

/** The reason shows as a tooltip on keyboard focus and describes the group and each checkbox. */
export const DisabledWithMessage = composed(CheckboxListStory, {
  args: {value: ['email'], isDisabled: true, disabledMessage: 'Notifications are managed by your administrator'},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const email = canvas.getByRole('checkbox', {name: 'Email'});
    await expect(email).toHaveAccessibleDescription('Daily digest Notifications are managed by your administrator');
    await userEvent.tab();
    await expect(email).toHaveFocus();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
}, options);

/** Full opacity; nothing toggles. */
export const ReadOnly = composed(CheckboxListStory, {
  args: {value: ['email', 'push'], isReadOnly: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const email = canvas.getByRole('checkbox', {name: 'Email'});
    await userEvent.click(email);
    await expect(email).toBeChecked();
  },
}, options);

/** While nothing is checked, the first box carries native `required`; checking any box removes it. */
export const Required = composed(CheckboxListStory, {
  args: {value: [], isRequired: true},
  play: async ({canvas, canvasElement}) => {
    await upgraded(canvasElement, 'ax-checkbox-list');
    const email = canvas.getByRole('checkbox', {name: 'Email'});
    await expect(email).toBeRequired();
    await expect(canvas.getByRole('checkbox', {name: 'SMS'})).not.toBeRequired();
    await userEvent.click(canvas.getByRole('checkbox', {name: 'Push'}));
    await waitFor(() => expect(email).not.toBeRequired());
  },
}, options);

export const Optional = composed(CheckboxListStory, {args: {value: ['email'], isOptional: true}}, options);

/** An error status makes every checkbox `aria-invalid`; the message describes the group. */
export const ErrorStatus = composed(CheckboxListStory, {
  args: {value: [], status: {type: 'error', message: 'Choose at least one channel'}},
  play: async ({canvas, canvasElement}) => {
    await expect(group(canvasElement)).toHaveAccessibleDescription('Choose at least one channel');
    for (const box of canvas.getAllByRole('checkbox')) await expect(box).toBeInvalid();
  },
}, options);

export const WarningStatus = composed(CheckboxListStory, {args: {value: ['sms'], status: {type: 'warning', message: 'SMS may incur charges'}}}, options);

export const SuccessStatus = composed(CheckboxListStory, {args: {value: ['email'], status: {type: 'success', message: 'Preferences saved'}}}, options);
