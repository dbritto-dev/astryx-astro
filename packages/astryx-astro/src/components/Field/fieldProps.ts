/**
 * Field-composed props routing — the server helper every Field-composed input uses
 * (TextInput, TextArea, NumberInput, FileInput here; CheckboxInput, RadioList, Switch,
 * Slider, Selector, DateInput … next). Port of @astryxdesign/core Field/fieldParts.ts
 * (useFieldInputStyling, FR10), utils/inputAria.ts (getInputARIA, joinAriaIDs),
 * hooks/useResolvedRequired.ts, utils/disabledInteraction.ts (withholdCallerHandlers),
 * Field/textEntryTraits.ts and the id plumbing each input does with useId().
 *
 * Contract #8 (input-fields FR10): base props — `id`, `aria-*`, `data-*`, `name`, native
 * attributes and inline `on*` handlers — reach the NATIVE control; there is no root
 * `class`/`style` (dropped with a dev warning, as Astryx does); `containerClass/Style` style
 * the Field box; `controlClass/Style` style the bordered control box.
 *
 * ```astro
 * ---
 * import Field from '../Field/Field.astro';
 * import {routeFieldProps, type FieldComposedProps} from '../Field/fieldProps';
 * export interface Props extends FieldComposedProps { value?: string }
 * const {value = '', ...props} = Astro.props;
 * const r = routeFieldProps('MyInput', props, {groupable: true});
 * ---
 * <Field {...r.field}>
 *   <div class={cx('astryx-my-input', 'ax-input', r.control.class)} style={r.control.style}
 *        {...r.groupControl} data-disabled={r.isDisabled ? 'disabled' : undefined}>
 *     <span {...r.groupLabel}>{r.label}</span>
 *     <input {...r.native} id={r.id} value={value}
 *            aria-describedby={r.describedBy(r.ids.description, r.statusMessageId)}
 *            aria-labelledby={r.labelledBy} {...r.required} {...r.groupInput} />
 *   </div>
 * </Field>
 * ```
 *
 * What `routeFieldProps()` returns:
 *  - `id`               the native control's id (`props.id` or a generated one).
 *  - `ids`              generated ids: `fieldLabel`, `inputLabel`, `description`, `status`,
 *                       `make(suffix)` for more (counter, units, required …).
 *  - `field`            spread onto `<Field>`: label, description (+ id), optional/required,
 *                       disabled, tooltip, labelIcon, status (+ messageID), statusVariant,
 *                       width, `containerClass/Style` as Field's class/style, `formDirection`,
 *                       and `__groupable` (enrols the Field root in the InputGroup protocol).
 *  - `control`          `{class, style}` from `controlClass/Style` for the bordered box.
 *  - `native`           everything else (caller base props) for the native control, with
 *                       inline `on*` handlers other than focus/blur withheld while disabled.
 *  - `describedBy(...)` caller `aria-describedby` first, then the given ids (dedupe, drop empty).
 *  - `labelledBy`       caller `aria-labelledby` joined after the Field label id, or undefined.
 *                       When set, `field.labelID` is set too (Astryx: the label gets an id only then).
 *  - `required`         `{'aria-required': 'true'}` when isRequired && !isOptional; when neither is
 *                       explicit, `{'data-ax-inherit': 'form-required'}` so a FormLayout with
 *                       `defaultOptionality="required"` stamps aria-required (useResolvedRequired).
 *                       Never the native `required` attribute. Merge it with `inherits()` if the
 *                       control enrols in other keys (see `inheritKeys`).
 *  - `statusMessageId`  the FieldStatus id when Field renders a message box (attached/detached
 *                       with a message), else undefined — never a dangling IDREF.
 *  - `isDisabled`, `isReadOnly`, `label`, `statusVariant`, `status`, `locale`.
 *  - InputGroup member protocol (only when `groupable`): `groupControl` (on the bordered box),
 *    `groupLabel` (a hidden span with the input's own label, `hidden` until a group reveals it),
 *    `groupInput` (on the native control); mark nodes a group removes with `GROUP_DROP` (always,
 *    e.g. the on-field status icon) or `GROUP_DROP_DISABLED` (when the group is disabled, e.g. the
 *    clear button), and elements a disabled group turns aria-disabled with `GROUP_DISABLE`.
 *    InputGroup unwraps the Field shell and rewires aria (see InputGroup/groupMembers.ts).
 *
 * Cascade keys (lib/cascade.ts) this family uses — see docs/handoffs.md:
 *   Field root: `form-direction` (FormLayout stamps data-form-direction), `field-layout`
 *   (data-layout="horizontal-labels", stamped by FormLayout),
 *   `input-group` (InputGroup unwraps the shell); FieldLabel: `form-optionality`;
 *   native control: `form-required`; control box: `size` (any size provider).
 */
import type {SizeValue} from '../../lib/types';
import type {StyleValue} from '../../lib/style';
import type {AstroIconComponent, ExtendedIconName} from '../Icon/iconRegistry';

// ── Shared input types (Field/types.ts, fieldStatusPlacement.ts) ────────────
export type InputStatusType = 'warning' | 'error' | 'success';
export interface InputStatus {
  type: InputStatusType;
  /** Message shown below the control (or in the status tooltip). */
  message?: string;
}
export type InputSize = 'sm' | 'md' | 'lg';
/** Where a field control shows its status message. */
export type FieldStatusPlacement = 'attached' | 'detached' | 'tooltip';
export type FormLayoutDirection = 'vertical' | 'horizontal' | 'horizontal-labels';
export type LabelIcon = ExtendedIconName | AstroIconComponent;

// ── Text entry traits (Field/textEntryTraits.ts) ────────────────────────────
export type EnterKeyHint = 'enter' | 'done' | 'go' | 'next' | 'previous' | 'search' | 'send';
export type InputMode = 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
export type AutoCapitalize = 'off' | 'none' | 'on' | 'sentences' | 'words' | 'characters';
export interface TextEntryTraitProps {
  /** What the Return key of a touch keyboard says (native `enterkeyhint`). */
  enterKeyHint?: EnterKeyHint;
  /** Which touch keyboard the field asks for (native `inputmode`). */
  inputMode?: InputMode;
  /** When a touch keyboard capitalizes (native `autocapitalize`). */
  autoCapitalize?: AutoCapitalize;
  /** Whether a touch keyboard autocorrects (native `autocorrect` on/off). */
  hasAutoCorrect?: boolean;
}
/** Absent props render no attribute, so the browser keeps its default. */
export function textEntryTraitAttributes({enterKeyHint, inputMode, autoCapitalize, hasAutoCorrect}: TextEntryTraitProps) {
  const attrs: Record<string, string> = {};
  if (enterKeyHint != null) attrs.enterkeyhint = enterKeyHint;
  if (inputMode != null) attrs.inputmode = inputMode;
  if (autoCapitalize != null) attrs.autocapitalize = autoCapitalize;
  if (hasAutoCorrect != null) attrs.autocorrect = hasAutoCorrect ? 'on' : 'off';
  return attrs;
}

// ── Ids ─────────────────────────────────────────────────────────────────────
let counter = 0;
/** A page-unique id (React useId stand-in): per server render, never reused in a page. */
export function fieldId(prefix = 'ax-field'): string {
  counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${counter.toString(36)}`;
}

type AriaID = string | null | undefined | false;
/** Join IDREF lists: split on whitespace, drop empties and duplicates (utils/inputAria). */
export function joinAriaIDs(...values: AriaID[]): string | undefined {
  const ids = values.flatMap((v) => (typeof v === 'string' ? v.trim().split(/\s+/) : [])).filter(Boolean);
  return ids.length ? [...new Set(ids)].join(' ') : undefined;
}

// ── The shared prop mixin ───────────────────────────────────────────────────
export interface FieldPartStyleProps {
  /** Class for the Field box (label + control + status). No effect inside InputGroup. */
  containerClass?: string;
  /** Inline style for the Field box. */
  containerStyle?: StyleValue;
  /** Class for the bordered control box (never the native input). */
  controlClass?: string;
  /** Inline style for the bordered control box. */
  controlStyle?: StyleValue;
  /** Astryx spelling of `containerClass`. */
  containerClassName?: string;
  /** Astryx spelling of `controlClass`. */
  controlClassName?: string;
}

export interface FieldComposedProps extends FieldPartStyleProps {
  /** Label text (always rendered for accessibility). */
  label: string;
  /** Visually hide the label and description (still read by screen readers). @default false */
  isLabelHidden?: boolean;
  /** Text between the label and the control. */
  description?: string;
  /** Whether the field is optional (mutually exclusive with isRequired; wins). @default false */
  isOptional?: boolean;
  /** Whether the field is required (`aria-required`, never native `required`). @default false */
  isRequired?: boolean;
  /** Disabled: dimmed, not editable, not submitted, still focusable (`aria-disabled`). @default false */
  isDisabled?: boolean;
  /** Tooltip text on an info icon at the end of the label. */
  labelTooltip?: string;
  /** Validation status: border, status icon, and a message box when `message` is set. */
  status?: InputStatus;
  /** Where the status message shows. @default 'attached' */
  statusVariant?: FieldStatusPlacement;
  /** Width of the whole field (number = px, string = CSS). */
  width?: SizeValue;
  /** Native control id. @default generated */
  id?: string;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  /**
   * Port extension: explicit FormLayout direction for this field. Normally a surrounding
   * FormLayout stamps it; set it only to override that (Astryx reads FormLayoutContext).
   */
  formDirection?: FormLayoutDirection;
  /** Locale for built-in strings. @default Astro.locals.astryxLocale / Astro.currentLocale / 'en' */
  locale?: string;
}

/** Props this helper consumes; everything else in `props` is routed to the native control. */
const CONSUMED = new Set([
  'label', 'isLabelHidden', 'description', 'isOptional', 'isRequired', 'isDisabled', 'labelTooltip',
  'labelIcon', 'status', 'statusVariant', 'width', 'id', 'aria-describedby', 'aria-labelledby',
  'formDirection', 'locale', 'containerClass', 'containerStyle', 'controlClass', 'controlStyle',
  'containerClassName', 'controlClassName', 'class', 'className', 'style', 'class:list', 'xstyle',
  'containerXstyle', 'controlXstyle',
]);

export interface FieldShellProps {
  label: string;
  isLabelHidden: boolean;
  description?: string;
  inputID: string;
  labelID?: string;
  descriptionID?: string;
  isOptional: boolean;
  isRequired: boolean;
  isDisabled: boolean;
  labelTooltip?: string;
  labelIcon?: LabelIcon;
  status?: {type: InputStatusType; message?: string; messageID?: string};
  statusVariant: FieldStatusPlacement;
  width?: SizeValue;
  class?: string;
  style?: StyleValue;
  formDirection?: FormLayoutDirection;
  locale?: string;
  __groupable?: boolean;
}

export interface FieldRouting {
  id: string;
  ids: {fieldLabel: string; inputLabel: string; description: string; status: string; make: (suffix: string) => string};
  label: string;
  field: FieldShellProps;
  control: {class?: string; style?: StyleValue};
  native: Record<string, unknown>;
  describedBy: (...ids: AriaID[]) => string | undefined;
  labelledBy?: string;
  required: Record<string, string>;
  /** The cascade keys the native control enrols in (merge with your own via `inherits()`). */
  inheritKeys: Record<string, boolean>;
  statusMessageId?: string;
  status?: InputStatus;
  statusVariant: FieldStatusPlacement;
  isDisabled: boolean;
  isReadOnly: boolean;
  locale?: string;
  groupControl: Record<string, string>;
  groupLabel: Record<string, string | boolean>;
  groupInput: Record<string, string>;
}

// InputGroup member protocol (attributes the group transform reads; see groupMembers.ts).
export const GROUP_KEY = 'input-group';
export const GROUP_CONTROL = 'data-ax-group-control';
export const GROUP_LABEL = 'data-ax-group-label';
export const GROUP_INPUT = 'data-ax-group-input';
export const GROUP_DROP = 'data-ax-group-drop';
export const GROUP_DROP_DISABLED = 'data-ax-group-drop-disabled';
export const GROUP_DISABLE = 'data-ax-group-disable';

export interface RouteOptions {
  /** Prefix for generated ids. @default kebab component name */
  idPrefix?: string;
  /** The input can join an InputGroup (TextInput, NumberInput, Selector, DateInput …). */
  groupable?: boolean;
  /** Read-only state (for `isReadOnly`). */
  isReadOnly?: boolean;
  /** Extra props the component consumes itself (not forwarded to the native control). */
  consumed?: Iterable<string>;
  /** Forward `labelIcon` to Field (NumberInput does, TextInput does not). */
  labelIcon?: LabelIcon;
}

const warned = new Set<string>();
function devWarn(component: string, message: string) {
  if (!import.meta.env?.DEV || warned.has(component + message)) return;
  warned.add(component + message);
  console.warn(`[astryx-astro] ${component}: ${message}`);
}

/** Route a Field-composed input's props (FR10). See the file header for the result. */
export function routeFieldProps(
  component: string,
  props: FieldComposedProps & Record<string, unknown>,
  options: RouteOptions = {},
): FieldRouting {
  const prefix = options.idPrefix ?? component.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const consumed = new Set([...CONSUMED, ...(options.consumed ?? [])]);
  const {
    label,
    isLabelHidden = false,
    description,
    isOptional = false,
    isRequired = false,
    isDisabled = false,
    labelTooltip,
    status,
    statusVariant = 'attached',
    width,
    formDirection,
    locale,
  } = props;

  if (props.class != null || props.className != null || props.style != null) {
    devWarn(component, '`class` and `style` are not supported on Field-composed inputs and were ignored. ' +
      'Style the field with `containerClass`/`containerStyle` and the control box with `controlClass`/`controlStyle`.');
  }
  if (isOptional && isRequired) devWarn('Field', 'isOptional and isRequired are mutually exclusive. isOptional takes precedence.');

  const base = fieldId(prefix);
  const id = (props.id as string | undefined) ?? base;
  const make = (suffix: string) => `${base}-${suffix}`;
  const ids = {fieldLabel: make('label'), inputLabel: make('input-label'), description: make('desc'), status: make('status'), make};

  const callerDescribedBy = props['aria-describedby'];
  const callerLabelledBy = props['aria-labelledby'];
  const hasMessageBox = !!status?.message && statusVariant !== 'tooltip';
  const statusMessageId = hasMessageBox ? ids.status : undefined;
  const labelledBy = callerLabelledBy != null ? joinAriaIDs(ids.fieldLabel, callerLabelledBy) : undefined;

  // Base props → native control. Inline handlers other than focus/blur are withheld while
  // disabled (AST-085 FR2: a disabled field runs no caller handler but focus and blur).
  const native: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (consumed.has(key)) continue;
    if (isDisabled && /^on[a-z]/i.test(key) && !/^on(focus|blur)/i.test(key)) continue;
    native[key] = value;
  }

  // useResolvedRequired: explicit flags decide; otherwise the FormLayout default may.
  const explicitRequired = !isOptional && isRequired;
  const inheritsRequired = !isOptional && !isRequired;
  const required: Record<string, string> = explicitRequired ? {'aria-required': 'true'} : {};
  const inheritKeys: Record<string, boolean> = {'form-required': inheritsRequired};
  if (inheritsRequired) required['data-ax-inherit'] = 'form-required';

  const groupable = !!options.groupable;
  return {
    id,
    ids,
    label,
    field: {
      label,
      isLabelHidden,
      description,
      inputID: id,
      labelID: callerLabelledBy != null ? ids.fieldLabel : undefined,
      descriptionID: description ? ids.description : undefined,
      isOptional,
      isRequired,
      isDisabled,
      labelTooltip,
      labelIcon: options.labelIcon,
      status: status ? {type: status.type, message: status.message, messageID: statusMessageId} : undefined,
      statusVariant,
      width,
      class: (props.containerClass ?? props.containerClassName) as string | undefined,
      style: props.containerStyle,
      formDirection,
      locale,
      __groupable: groupable,
    },
    control: {class: (props.controlClass ?? props.controlClassName) as string | undefined, style: props.controlStyle},
    native,
    describedBy: (...list: AriaID[]) => joinAriaIDs(callerDescribedBy, ...list),
    labelledBy,
    required,
    inheritKeys,
    statusMessageId,
    status,
    statusVariant,
    isDisabled,
    isReadOnly: !!options.isReadOnly,
    locale,
    groupControl: groupable ? {[GROUP_CONTROL]: ''} : {},
    groupLabel: groupable ? {id: ids.inputLabel, hidden: true, [GROUP_LABEL]: ''} : {},
    groupInput: groupable ? {[GROUP_INPUT]: ''} : {},
  };
}

/**
 * Plan for the on-field status affordance (hooks/useInputStatusIcon.tsx): render nothing
 * without a status, for `detached` (the message box has its own icon) or inside a group;
 * a plain icon for `attached` (and `tooltip` without a message); a focusable button with a
 * tooltip for `tooltip` + message, whose layer id joins the input's aria-describedby.
 */
export function statusIconPlan(status: InputStatus | undefined, statusVariant: FieldStatusPlacement = 'attached') {
  const renders = !!status && statusVariant !== 'detached';
  const hasTooltip = renders && statusVariant === 'tooltip' && !!status?.message;
  return {renders, hasTooltip, tooltipId: hasTooltip ? fieldId('ax-status-tip') : undefined};
}

/** Withhold inline `on*` handlers but focus/blur (utils/disabledInteraction withholdCallerHandlers). */
export function withholdCallerHandlers<T extends Record<string, unknown>>(props: T, isDisabled: boolean): T {
  if (!isDisabled) return props;
  return Object.fromEntries(Object.entries(props).filter(([k]) => !/^on[a-z]/i.test(k) || /^on(focus|blur)/i.test(k))) as T;
}
