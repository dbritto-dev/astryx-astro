import FileInput from 'astryx-astro/components/FileInput/FileInput.astro';
import Demo from 'astryx-astro/components/FileInput/FileInput.demo.astro';
import demoSource from 'astryx-astro/components/FileInput/FileInput.demo.astro?raw';
import {expect, fn, userEvent, waitFor} from 'storybook/test';
import {isShowing, recordEvents, upgraded} from '../_lib/play';
import {astryx, overview, type Meta, type Story} from '../_lib/story';

const meta = {
  title: 'Form Controls/File Input',
  component: FileInput,
  ...astryx('FileInput'),
  args: {label: 'Resume'},
} satisfies Meta;
export default meta;

/** Every example from the docs page (FileInput.demo.astro), pre-rendered as one story. */
export const Overview = overview(Demo, demoSource);

type FileHost = HTMLElement & {files: File[]};
type Change = {value: File | File[] | null};

const pdf = () => new File(['%PDF-1.7 resume'], 'resume.pdf', {type: 'application/pdf'});
const png = (name = 'photo.png', bytes = 16) => new File([new Uint8Array(bytes)], name, {type: 'image/png'});
const nativeInput = (root: Element) => root.querySelector<HTMLInputElement>('input[type="file"]')!;
const trigger = (root: Element) => root.querySelector<HTMLElement>('[data-ax-file-trigger]')!;
const listOf = (files: File[]) => {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  return transfer;
};
/** What the browser does when the picker returns `files`: the native input gets them and fires `change`. */
const pick = (root: Element, files: File[]) => {
  const input = nativeInput(root);
  input.files = listOf(files).files;
  input.dispatchEvent(new Event('change', {bubbles: true}));
};
/** Count picker openings (the native input's click) and cancel them, so no OS dialog opens. */
const pickerSpy = (root: Element) => {
  const opened = fn();
  nativeInput(root).addEventListener('click', (event) => {
    event.preventDefault();
    opened();
  });
  return opened;
};
const politeRegion = () => document.querySelector('[data-astryx-live-region="polite"]');

/**
 * The focusable control is a visually hidden button named by the label. Enter (or a click on the
 * surface) opens the picker; a picked file is shown, joins the button's name, is announced and
 * reported in `astryx-change`; the clear button removes it and returns focus to the button.
 */
export const Default: Story = {
  args: {accept: '.pdf', description: 'PDF only', name: 'resume'},
  play: async ({canvas, canvasElement, step}) => {
    const host = await upgraded<FileHost>(canvasElement, 'ax-file-input');
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const opened = pickerSpy(canvasElement);
    const button = trigger(canvasElement);
    await expect(button).toHaveAccessibleName('Resume');
    await expect(button).toHaveAccessibleDescription('PDF only');
    await expect(nativeInput(canvasElement)).toHaveAttribute('aria-hidden', 'true');

    await step('Enter on the focused button opens the picker; so does a click on the surface', async () => {
      await userEvent.tab();
      await expect(button).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      await expect(opened).toHaveBeenCalledTimes(1);
      await userEvent.click(canvas.getByText('Choose file'));
      await expect(opened).toHaveBeenCalledTimes(2);
    });
    await step('A picked file is shown, names the button, is announced and reported', async () => {
      pick(canvasElement, [pdf()]);
      await waitFor(() => expect(button).toHaveAccessibleName('Resume, resume.pdf'));
      await expect(canvasElement).toHaveTextContent('resume.pdf');
      await expect((changes.at(-1)?.detail.value as File).name).toBe('resume.pdf');
      await expect(host.files.map((f) => f.name)).toEqual(['resume.pdf']);
      await waitFor(() => expect(politeRegion()).toHaveTextContent('1 file selected: resume.pdf'));
    });
    await step('Clear removes the file, reports null and returns focus to the button', async () => {
      await userEvent.click(canvas.getByRole('button', {name: 'Clear Resume'}));
      await waitFor(() => expect(button).toHaveAccessibleName('Resume'));
      await expect(changes.at(-1)?.detail.value).toBeNull();
      await expect(button).toHaveFocus();
    });
  },
};

/** `accept` is checked on pick: a rejected file sets an error status that names it; a valid pick clears it. */
export const RejectedType: Story = {
  args: {accept: '.pdf'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    const button = trigger(canvasElement);
    pick(canvasElement, [png()]);
    await waitFor(() => expect(button).toHaveAttribute('aria-invalid', 'true'));
    await expect(button).toHaveAccessibleDescription('"photo.png" is not an accepted file type');
    pick(canvasElement, [pdf()]);
    await waitFor(() => expect(button).not.toHaveAttribute('aria-invalid'));
  },
};

/**
 * `isMultiple` with `maxFiles` and `maxSize`: too-large files and files past the limit are
 * rejected in one combined error; the valid files are kept and reported as `File[]`.
 */
export const Multiple: Story = {
  args: {label: 'Attachments', isMultiple: true, maxFiles: 2, maxSize: 51_200, description: 'Up to 2 files, 50 KB each'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    const changes = recordEvents<Change>(canvasElement, 'astryx-change');
    const button = trigger(canvasElement);
    pick(canvasElement, [pdf(), png('big.png', 60_000), png('photo.png'), png('scan.png')]);
    await waitFor(() => expect(button).toHaveAttribute('aria-invalid', 'true'));
    await expect(button).toHaveAccessibleDescription(/"big\.png" exceeds 50\.0 KB limit/);
    await expect(button).toHaveAccessibleDescription(/Maximum 2 files allowed/);
    await expect((changes.at(-1)?.detail.value as File[]).map((f) => f.name)).toEqual(['resume.pdf', 'photo.png']);
  },
};

/** A dashed drop target: dragging files over it says "Drop files here", dropping selects them. */
export const Dropzone: Story = {
  args: {label: 'Photos', mode: 'dropzone', accept: 'image/*', isMultiple: true, description: 'PNG or JPEG, up to 5 files', maxFiles: 5},
  play: async ({canvasElement}) => {
    const host = await upgraded<FileHost>(canvasElement, 'ax-file-input');
    const transfer = listOf([png('beach.png'), png('dunes.png')]);
    host.dispatchEvent(new DragEvent('dragenter', {dataTransfer: transfer, bubbles: true, cancelable: true}));
    await waitFor(() => expect(host).toHaveTextContent('Drop files here'));
    host.dispatchEvent(new DragEvent('drop', {dataTransfer: transfer, bubbles: true, cancelable: true}));
    await waitFor(() => expect(host.files.map((f) => f.name)).toEqual(['beach.png', 'dunes.png']));
    await expect(host).not.toHaveTextContent('Drop files here');
  },
};

export const DropzoneErrorStatus: Story = {
  args: {label: 'Photos', mode: 'dropzone', accept: 'image/*', status: {type: 'error', message: 'Add at least one photo'}, statusVariant: 'detached'},
};

export const CustomPlaceholder: Story = {args: {label: 'Cover letter', placeholder: 'Attach a cover letter'}};

/** Error status: the attached message describes the button, which is `aria-invalid`. */
export const ErrorStatus: Story = {
  args: {status: {type: 'error', message: 'Upload your resume to continue'}},
  play: async ({canvasElement}) => {
    const button = trigger(canvasElement);
    await expect(button).toHaveAttribute('aria-invalid', 'true');
    await expect(button).toHaveAccessibleDescription('Upload your resume to continue');
  },
};

export const WarningStatus: Story = {args: {status: {type: 'warning', message: 'Older resumes may be outdated'}, statusVariant: 'detached'}};

/** Success status through the status icon's tooltip (`statusVariant="tooltip"`). */
export const SuccessTooltip: Story = {args: {status: {type: 'success', message: 'Resume on file'}, statusVariant: 'tooltip'}};

/** Required is conveyed by a visually hidden "Required" the button is described by (buttons ignore `aria-required`). */
export const Required: Story = {
  args: {isRequired: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    await expect(trigger(canvasElement)).toHaveAccessibleDescription(/Required/);
  },
};

/** The button keeps its tab stop (`aria-disabled`); Enter opens nothing; the native input leaves its form. */
export const Disabled: Story = {
  args: {isDisabled: true, name: 'resume'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    const opened = pickerSpy(canvasElement);
    const button = trigger(canvasElement);
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await expect(nativeInput(canvasElement)).toHaveAttribute('form', '');
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(opened).not.toHaveBeenCalled();
  },
};

/** The reason shows as a tooltip on keyboard focus and describes the button. */
export const DisabledWithMessage: Story = {
  args: {isDisabled: true, disabledMessage: 'Uploads are paused during maintenance'},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    await expect(trigger(canvasElement)).toHaveAccessibleDescription('Uploads are paused during maintenance');
    await userEvent.tab();
    await waitFor(() => expect(isShowing(canvasElement.querySelector('[role="tooltip"]'))).toBe(true));
  },
};

/** Uploading: a spinner, `aria-busy`, and picking is blocked. */
export const Loading: Story = {
  args: {isLoading: true},
  play: async ({canvasElement}) => {
    await upgraded(canvasElement, 'ax-file-input');
    const opened = pickerSpy(canvasElement);
    const button = trigger(canvasElement);
    await expect(button).toHaveAttribute('aria-busy', 'true');
    button.focus();
    await userEvent.keyboard('{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(opened).not.toHaveBeenCalled();
  },
};
