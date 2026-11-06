/**
 * data-ax-stepper — Stepper behaviour on the `<ol>`. Port of @astryxdesign/core
 * Stepper/Stepper.tsx (compact measurement with a ResizeObserver, adjacentEnabledStep, the
 * summary controls) and Stepper/Step.tsx (re-deriving each step when `activeStep` changes:
 * progress, aria-current, indicator, status text, clickable names, connector fill and the
 * single-advance fill timing), through the shared pure logic in components/Stepper/stepState.ts.
 *
 * API on the `<ol>`: `activeStep` (get/set). Events (bubbling, composed, cancelable):
 * `astryx-step-click` {index} when a step button or a compact control is activated; unless
 * cancelled the stepper then moves to that step.
 */
import {defineBehavior} from '../elements/behavior';
import '../elements/runtime/disabledInteraction';
import {
  CHECK_CIRCLE_SVG, CURRENT_SVG, fillTiming, indicatorState, isFilled, statusWord,
  type StepIndicatorPreset, type StepStatus,
} from '../components/Stepper/stepState';

export interface StepClickDetail {
  index: number;
}

defineBehavior('stepper', (ol) => {
  const frame = ol.parentElement?.classList.contains('astryx-stepper-frame') ? ol.parentElement : null;
  const summary = frame?.querySelector<HTMLElement>(':scope > [data-ax-stepper-summary]') ?? null;
  const summaryBody = summary?.querySelector<HTMLElement>('[data-ax-stepper-summary-body]') ?? null;
  const minStepWidth = Number(ol.getAttribute('data-ax-min-step-width') ?? 0);
  const completedWord = ol.getAttribute('data-ax-completed-label') ?? 'completed';
  let active = Number(ol.getAttribute('data-ax-active-step') ?? 0);
  let isCompact = false;

  const steps = () => [...ol.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('astryx-step'));
  const indexOf = (li: HTMLElement) => Number(li.getAttribute('data-ax-step'));
  const isStepDisabled = (li: HTMLElement) => li.hasAttribute('data-ax-disabled');

  const statusWordText = (li: HTMLElement, status: StepStatus | null, progress: ReturnType<typeof indicatorState>['progress']) => {
    const word = statusWord(status, progress);
    if (word == null) return '';
    if (word === 'completed') return completedWord;
    // warning / error are static per step: keep the server-rendered translation.
    return li.querySelector('[data-ax-step-status]')?.textContent ?? word;
  };

  /** Re-derive one step for `next` (coming from `previous`). */
  const renderStep = (li: HTMLElement, previous: number, next: number) => {
    const step = indexOf(li);
    const status = (li.getAttribute('data-status') as StepStatus | null) ?? null;
    const preset = li.getAttribute('data-ax-indicator') ?? 'auto';
    const isCustom = preset === 'custom';
    const isDisabled = isStepDisabled(li);
    const state = indicatorState({step, activeStep: next, status, indicator: (isCustom ? 'auto' : preset) as StepIndicatorPreset, isCustom, isDisabled});
    const {progress} = state;

    li.setAttribute('data-progress', progress);
    if (progress === 'in-progress') li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
    for (const part of li.querySelectorAll<HTMLElement>(':scope .astryx-step-label, :scope .astryx-step-description, :scope .astryx-step-indicator')) {
      if (part.closest('.astryx-step') === li) part.setAttribute('data-progress', progress);
    }

    const indicator = [...li.querySelectorAll<HTMLElement>('.astryx-step-indicator')].find((el) => el.closest('.astryx-step') === li);
    if (indicator && state.kind) {
      indicator.setAttribute('data-ax-kind', state.kind);
      indicator.setAttribute('data-ax-tone', state.tone);
      if (state.glyph === 'number') indicator.textContent = String(step + 1);
      else if (state.glyph === 'check') indicator.innerHTML = CHECK_CIRCLE_SVG;
      else if (state.glyph === 'current') indicator.innerHTML = CURRENT_SVG;
      else if (state.glyph !== 'custom') {
        const template = li.querySelector<HTMLTemplateElement>(':scope > template[data-ax-status-glyph]');
        if (template) indicator.replaceChildren(template.content.cloneNode(true));
      }
    }

    const text = statusWordText(li, status, progress);
    for (const node of li.querySelectorAll<HTMLElement>('[data-ax-step-status]')) {
      if (node.closest('.astryx-step') === li) node.textContent = text;
    }
    const button = li.querySelector<HTMLElement>('[data-ax-step-button]');
    if (button && button.closest('.astryx-step') === li) {
      // Only completion changes the name (status words are static per step).
      const name = button.getAttribute(progress === 'completed' ? 'data-ax-name-completed' : 'data-ax-name');
      if (name) button.setAttribute('aria-label', name);
    }

    for (const seg of li.querySelectorAll<HTMLElement>('.ax-step-seg')) {
      if (seg.closest('.astryx-step') !== li) continue;
      const timing = fillTiming(
        Number(seg.getAttribute('data-ax-span')), Number(seg.getAttribute('data-ax-offset')),
        Number(seg.getAttribute('data-ax-share')), previous, next,
      );
      seg.style.setProperty('--_ax-fill-duration', timing.duration);
      seg.style.setProperty('--_ax-fill-delay', timing.delay);
      const rule = seg.getAttribute('data-ax-fill-rule') === 'lt' ? 'lt' : 'le';
      seg.setAttribute('data-ax-fill', isFilled(rule, step, next) ? 'filled' : 'empty');
    }
  };

  const adjacentEnabledStep = (delta: -1 | 1): number | null => {
    let target: number | null = null;
    for (const li of steps()) {
      if (isStepDisabled(li)) continue;
      const index = indexOf(li);
      if (delta === -1 ? index < active && (target == null || index > target) : index > active && (target == null || index < target)) target = index;
    }
    return target;
  };

  /** The compact summary: the current step's label row (no on-track node) and description. */
  const renderSummary = () => {
    if (!summary || !summaryBody) return;
    summary.hidden = !isCompact;
    for (const control of summary.querySelectorAll<HTMLElement>('[data-ax-stepper-control]')) {
      const disabled = adjacentEnabledStep(Number(control.getAttribute('data-ax-stepper-control')) as -1 | 1) == null;
      if (disabled) {
        control.setAttribute('aria-disabled', 'true');
        control.setAttribute('data-ax-disabled', '');
      } else {
        control.removeAttribute('aria-disabled');
        control.removeAttribute('data-ax-disabled');
      }
    }
    const li = steps().find((el) => indexOf(el) === active);
    if (!isCompact || !li) {
      summaryBody.replaceChildren();
      return;
    }
    const root = document.createElement('div');
    root.className = 'astryx-step';
    for (const attr of ['data-progress', 'data-status']) {
      const value = li.getAttribute(attr);
      if (value != null) root.setAttribute(attr, value);
    }
    const row = document.createElement('div');
    row.className = 'ax-step-icon-label';
    const source = li.querySelector('.ax-step-icon-label') ?? li.querySelector('.ax-step-label-line');
    for (const child of source?.childNodes ?? []) row.appendChild(child.cloneNode(true));
    root.appendChild(row);
    const description = li.querySelector('.astryx-step-description');
    if (description) {
      const span = document.createElement('span');
      span.className = 'ax-step-summary-description';
      span.textContent = description.textContent;
      root.appendChild(span);
    }
    for (const el of root.querySelectorAll('[id]')) el.removeAttribute('id');
    summaryBody.replaceChildren(root);
  };

  const applyCompact = (next: boolean) => {
    if (next === isCompact) return;
    isCompact = next;
    if (next) ol.setAttribute('data-ax-compact', '');
    else ol.removeAttribute('data-ax-compact');
    // An on-track head holds the track, so it stays visible but becomes presentational.
    for (const li of steps()) {
      const head = li.querySelector<HTMLElement>(':scope > button.ax-step-head');
      if (head) head.inert = next;
    }
    renderSummary();
  };

  const setActive = (next: number) => {
    if (!Number.isFinite(next) || next === active) return;
    const previous = active;
    active = next;
    ol.setAttribute('data-ax-active-step', String(next));
    for (const li of steps()) renderStep(li, previous, next);
    renderSummary();
  };

  const request = (index: number) => {
    const event = new CustomEvent<StepClickDetail>('astryx-step-click', {bubbles: true, composed: true, cancelable: true, detail: {index}});
    if (ol.dispatchEvent(event)) setActive(index);
  };

  const onClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ax-step-button]') : null;
    const li = button?.closest<HTMLElement>('.astryx-step');
    if (!button || !li || li.parentElement !== ol || button.getAttribute('aria-disabled') === 'true' || isCompact) return;
    request(indexOf(li));
  };
  const onControl = (event: MouseEvent) => {
    const control = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-ax-stepper-control]') : null;
    if (!control || control.getAttribute('aria-disabled') === 'true') return;
    // Resolved again at activation, so a step that became disabled is never selected.
    const target = adjacentEnabledStep(Number(control.getAttribute('data-ax-stepper-control')) as -1 | 1);
    if (target != null) request(target);
  };
  ol.addEventListener('click', onClick);
  summary?.addEventListener('click', onControl);

  let observer: ResizeObserver | null = null;
  if (minStepWidth > 0 && typeof ResizeObserver !== 'undefined') {
    const measure = () => {
      const count = steps().length;
      const width = ol.clientWidth;
      applyCompact(width > 0 && count > 0 && width / count < minStepWidth);
    };
    observer = new ResizeObserver(measure);
    observer.observe(ol);
    measure();
  }

  Object.defineProperty(ol, 'activeStep', {configurable: true, get: () => active, set: (value: number) => setActive(Number(value))});

  return () => {
    ol.removeEventListener('click', onClick);
    summary?.removeEventListener('click', onControl);
    observer?.disconnect();
    delete (ol as unknown as Record<string, unknown>).activeStep;
  };
});
