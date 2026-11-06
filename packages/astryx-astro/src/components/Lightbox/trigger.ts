/**
 * The trigger half of @astryxdesign/core Lightbox/useLightbox.tsx (`triggerProps`,
 * `getTriggerProps(i)`): spread onto any element that opens a Lightbox.
 *
 *   <img {...lightboxTriggerProps('photos', 2)} src={thumb} alt="" />
 *
 * `role="button"`, `tabindex="0"`, `aria-haspopup="dialog"` and the `data-ax-lightbox` /
 * `data-ax-lightbox-index` attributes the element's delegated listener reads (click, and
 * Enter/Space on a non-button). A native `<button>` only needs the two data attributes.
 */
export function lightboxTriggerProps(id: string, index?: number): Record<string, string> {
  const props: Record<string, string> = {
    role: 'button',
    tabindex: '0',
    'aria-haspopup': 'dialog',
    'data-ax-lightbox': id,
  };
  if (index != null) props['data-ax-lightbox-index'] = String(index);
  return props;
}
