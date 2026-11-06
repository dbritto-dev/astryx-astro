/**
 * `data-ax-media-auto="<fallback>"` — MediaTheme `mode="auto"`. Port of @astryxdesign/core
 * hooks/useAutoMediaMode.ts (+ theme/contrast.ts, the rgb parsing of utils/color.ts).
 *
 * Measures the element's PARENT (the wrapper is `display: contents`; its own attribute must
 * not feed back into the measurement): the painted backdrop is its background composited over
 * translucent ancestors down to the first opaque one. Unknowable (a background-image in the
 * chain, or nothing opaque) → keep the current side. Then:
 *   - ambient `--color-text-primary` reads on it at ≥ 3:1 → no media context ("off");
 *   - else the side whose on-color (`--color-on-dark` / `--color-on-light`) reads better
 *     (ties → dark).
 * Tokens resolve through a hidden probe inside the parent (light-dark() only resolves in a
 * real property). Re-measures on theme / mode / class / style changes of `<html>` or the
 * parent and on a color-scheme preference change.
 */
import {defineBehavior} from '../elements/behavior';

interface RGBA { r: number; g: number; b: number; a: number }

function parseColor(value: string): RGBA | null {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return {r: 0, g: 0, b: 0, a: 0};
  let m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return {r: +m[1], g: +m[2], b: +m[3], a};
  }
  m = v.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return {r: +m[1] * 255, g: +m[2] * 255, b: +m[3] * 255, a};
  }
  return null;
}

function luminance(c: RGBA): number {
  const ch = (x: number) => {
    const s = x / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg.a;
  return {r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1};
}

function contrast(fg: RGBA, bg: RGBA): number {
  const f = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(f), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function backdrop(element: HTMLElement): RGBA | null {
  const layers: RGBA[] = [];
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return null;
    const color = parseColor(style.backgroundColor);
    if (color && color.a > 0) {
      layers.push(color);
      if (color.a >= 1) break;
    }
  }
  const base = layers.pop();
  if (!base || base.a < 1) return null;
  return layers.reduceRight((acc, layer) => over(layer, acc), base);
}

function painted(host: HTMLElement, tokens: string[]): (RGBA | null)[] {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  host.appendChild(probe);
  try {
    return tokens.map((t) => {
      probe.style.color = `var(${t})`;
      return parseColor(getComputedStyle(probe).color);
    });
  } finally {
    probe.remove();
  }
}

/** Astryx `pickMediaMode`. */
export function pickMediaMode(bg: RGBA, ambient: RGBA | null, onDark: RGBA | null, onLight: RGBA | null): 'dark' | 'light' | 'off' | null {
  if (!onDark || !onLight) return null;
  if (ambient && contrast(ambient, bg) >= 3) return 'off';
  return contrast(onDark, bg) >= contrast(onLight, bg) ? 'dark' : 'light';
}

defineBehavior('media-auto', (el) => {
  const surface = el.parentElement;
  if (!surface) return;
  let last = '';
  const measure = () => {
    const bg = backdrop(surface);
    if (!bg) return;
    const [ambient, onDark, onLight] = painted(surface, ['--color-text-primary', '--color-on-dark', '--color-on-light']);
    const key = [bg, ambient, onDark, onLight].map((c) => (c ? `${c.r},${c.g},${c.b},${c.a}` : '-')).join('|');
    if (key === last) return;
    last = key;
    const next = pickMediaMode(bg, ambient, onDark, onLight);
    if (next === null) return;
    if (next === 'off') el.removeAttribute('data-astryx-media');
    else if (el.getAttribute('data-astryx-media') !== next) el.setAttribute('data-astryx-media', next);
  };
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      measure();
    });
  };
  measure();
  const observer = new MutationObserver(schedule);
  const filter = ['class', 'style', 'data-theme', 'data-astryx-theme', 'data-astryx-media'];
  observer.observe(document.documentElement, {attributes: true, attributeFilter: filter});
  for (let node: HTMLElement | null = surface; node && node !== document.documentElement; node = node.parentElement) {
    observer.observe(node, {attributes: true, attributeFilter: filter});
  }
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', schedule);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', schedule);
    if (frame) cancelAnimationFrame(frame);
  };
});
