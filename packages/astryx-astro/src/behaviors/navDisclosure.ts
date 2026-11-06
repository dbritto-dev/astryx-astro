/**
 * `data-ax-nav-disclosure` — the expand / collapse toggle of a nav group: a SideNavItem with
 * children (the row itself or its independent chevron), TopNavMenu / TopNavMegaMenu in the mobile
 * drawer. Ports the uncontrolled state of @astryxdesign/core SideNav/SideNavItem.tsx
 * (`collapsible`), TopNav/TopNavMenu.tsx and TopNav/TopNavMegaMenu.tsx (drawer modes).
 *
 *   <button data-ax-nav-disclosure aria-expanded="true" aria-controls="G"
 *           [data-ax-label-expand="Expand X" data-ax-label-collapse="Collapse X"]>…</button>
 *   <div id="G" role="group" [aria-hidden="true" inert data-ax-collapsed]>…</div>
 *
 * A click flips `aria-expanded` on every toggle of the region (a split row has two) and the
 * region's `aria-hidden` / `inert` / `data-ax-collapsed` (the CSS collapse animation), swaps the
 * toggle's label when it has one, and dispatches `astryx-collapse-change` {isCollapsed}
 * (bubbling, cancelable: `preventDefault()` keeps the state — Astryx `onCollapsedChange`) from
 * the nearest `[data-ax-nav-disclosure-host]` (the item root), else the toggle.
 */
import {defineBehavior} from '../elements/behavior';

export interface CollapseChangeDetail {
  isCollapsed: boolean;
}

function setExpanded(toggle: HTMLElement, region: HTMLElement | null, expanded: boolean): void {
  const doc = toggle.ownerDocument;
  const id = region?.id;
  const toggles = id ? [...doc.querySelectorAll<HTMLElement>(`[data-ax-nav-disclosure][aria-controls~="${CSS.escape(id)}"]`)] : [toggle];
  for (const t of toggles) {
    t.setAttribute('aria-expanded', String(expanded));
    const label = t.getAttribute(expanded ? 'data-ax-label-collapse' : 'data-ax-label-expand');
    if (label != null) t.setAttribute('aria-label', label);
  }
  if (!region) return;
  region.toggleAttribute('data-ax-collapsed', !expanded);
  if (expanded) {
    region.removeAttribute('aria-hidden');
    region.removeAttribute('inert');
  } else {
    region.setAttribute('aria-hidden', 'true');
    region.setAttribute('inert', '');
  }
}

defineBehavior('nav-disclosure', (toggle) => {
  const onClick = (event: MouseEvent) => {
    if (toggle.matches(':disabled, [aria-disabled="true"]')) return;
    // A link row that is also the toggle (no independent chevron) never navigates.
    if (toggle.matches('a[href]')) event.preventDefault();
    const id = toggle.getAttribute('aria-controls');
    const region = id ? toggle.ownerDocument.getElementById(id) : null;
    const next = toggle.getAttribute('aria-expanded') !== 'true';
    const host = toggle.closest<HTMLElement>('[data-ax-nav-disclosure-host]') ?? toggle;
    const change = new CustomEvent<CollapseChangeDetail>('astryx-collapse-change', {
      bubbles: true, composed: true, cancelable: true, detail: {isCollapsed: !next},
    });
    host.dispatchEvent(change);
    if (change.defaultPrevented) return;
    setExpanded(toggle, region, next);
  };
  toggle.addEventListener('click', onClick);
  return () => toggle.removeEventListener('click', onClick);
});
