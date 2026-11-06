/**
 * The field status a typed date field shows in the browser: a typed rejection that stays in
 * the field replaces the caller's status (useTypedDateField `fieldStatus = typedStatus ??
 * status`) on the control box (`data-status`), the on-field status icon, the Field status box
 * and the input's `aria-invalid` / `aria-describedby`.
 *
 * The caller's status is server-rendered. The typed one is mounted from server-rendered
 * `<template>`s (a FieldStatus box and an InputStatusIcon for `{type: 'error'}`) only while it
 * shows, as Astryx mounts it: the FieldStatus behaviour announces it when it appears and
 * again when its text changes, and plays the entry animation.
 *
 * Markup the owner renders (all optional except the box and the input):
 *   box  [data-ax-status-caller="warning|error|success"]   the caller's status type
 *        [data-ax-describedby-caller] [data-ax-describedby-typed]
 *   <span data-ax-status-slot>…caller InputStatusIcon…</span>
 *   <template data-ax-typed-icon>…InputStatusIcon error…</template>
 *   <template data-ax-typed-status>…FieldStatus error…</template>   (none inside an InputGroup)
 *   the caller's FieldStatus box is found by id (`data-ax-status-box`).
 */
import type {InputStatus} from '../Field/fieldProps';

export interface StatusViewParts {
  /** The bordered box that carries `data-status` and the status hooks (attributes above). */
  box: HTMLElement;
  /** More elements that show the field status as `data-status` (DateTimeInput's row). */
  statusTargets?: HTMLElement[];
  /** The control `aria-invalid` / `aria-describedby` belong to. */
  input: HTMLElement;
  /** More controls described by the same ids (DateTimeInput's time input). */
  describedTargets?: HTMLElement[];
  /** Where the caller's on-field icon lives and the typed one goes (its parent). */
  iconSlot: HTMLElement | null;
  typedIconTemplate: HTMLTemplateElement | null;
  typedBoxTemplate: HTMLTemplateElement | null;
  /** The element the typed FieldStatus box is inserted after. */
  boxAnchor: Element;
}

export class FieldStatusView {
  #parts: StatusViewParts;
  #typedIcon: Element[] = [];
  #typedBox: HTMLElement | null = null;
  #callerType: string | null;
  #callerBox: HTMLElement | null;

  constructor(parts: StatusViewParts) {
    this.#parts = parts;
    this.#callerType = parts.box.getAttribute('data-ax-status-caller');
    const callerBoxId = parts.box.getAttribute('data-ax-status-box');
    this.#callerBox = callerBoxId ? parts.box.ownerDocument.getElementById(callerBoxId) : null;
  }

  /** Whether a FieldStatus box can show (false inside an InputGroup: the group owns status). */
  get hasStatusBox(): boolean {
    return this.#parts.typedBoxTemplate != null;
  }

  /** Show `typed` (or the caller's status when undefined); `isInvalid` also sets aria-invalid. */
  apply(typed: InputStatus | undefined, isInvalid: boolean): void {
    const {box, input, iconSlot, typedIconTemplate, typedBoxTemplate, boxAnchor} = this.#parts;
    const type = typed?.type ?? this.#callerType;
    for (const el of [box, ...(this.#parts.statusTargets ?? [])]) {
      if (type) el.setAttribute('data-status', type);
      else el.removeAttribute('data-status');
    }

    if (typed) {
      // On-field icon.
      if (iconSlot) iconSlot.hidden = true;
      if (!this.#typedIcon.length && typedIconTemplate) {
        const fragment = typedIconTemplate.content.cloneNode(true) as DocumentFragment;
        this.#typedIcon = [...fragment.children];
        (iconSlot ?? typedIconTemplate).after(fragment);
      }
      for (const el of this.#typedIcon) {
        const content = el.querySelector('.ax-tooltip-content');
        if (content && content.textContent !== typed.message) content.textContent = typed.message ?? '';
      }
      // Status box.
      if (typedBoxTemplate) {
        if (!this.#typedBox) {
          this.#typedBox = (typedBoxTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement | null) ?? null;
          if (this.#typedBox) {
            this.#setMessage(this.#typedBox, typed.message ?? '');
            boxAnchor.after(this.#typedBox);
          }
        } else this.#setMessage(this.#typedBox, typed.message ?? '');
        if (this.#callerBox) this.#callerBox.style.display = 'none';
      }
    } else {
      for (const el of this.#typedIcon) el.remove();
      this.#typedIcon = [];
      if (iconSlot) iconSlot.hidden = false;
      this.#typedBox?.remove();
      this.#typedBox = null;
      if (this.#callerBox) this.#callerBox.style.removeProperty('display');
    }

    const describedBy = box.getAttribute(typed ? 'data-ax-describedby-typed' : 'data-ax-describedby-caller');
    for (const el of [input, ...(this.#parts.describedTargets ?? [])]) {
      if (describedBy) el.setAttribute('aria-describedby', describedBy);
      else el.removeAttribute('aria-describedby');
    }
    if (type === 'error' || isInvalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  #setMessage(statusBox: HTMLElement, message: string) {
    // Attached: the box holds the text; detached: the text follows the icon box.
    const target = statusBox.querySelector<HTMLElement>('.ax-field-status-content > span:last-child') ?? statusBox;
    if (target.textContent !== message) target.textContent = message;
  }
}
