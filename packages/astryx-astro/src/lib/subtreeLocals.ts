/**
 * Subtree-scoped `Astro.locals` — the provider half of Astryx's request-wide contexts
 * (Theme name for icons, InternationalizationProvider locale, LinkProvider component).
 *
 * Consumers keep reading plain keys (`Astro.locals.astryxTheme`, `astryxLocale`,
 * `astryxLinkComponent` …). A provider renders its slot through `renderWithLocals()`:
 * inside that render every component sees the provider's values; outside it — siblings,
 * the rest of the page — sees the request value, even though Astro renders sibling
 * expressions concurrently while an async slot is pending (runtime/server/render/any.js
 * buffers them in parallel). Setting a key before `await Astro.slots.render()` and
 * restoring it after would leak the provider's value into those siblings.
 *
 * Mechanism: the first provider turns each key into an accessor on that request's
 * `locals` object. The getter reads the innermost provider frame from an
 * `AsyncLocalStorage` (frames carry their `locals` object, so concurrent requests never
 * mix); without a frame it returns the request value, which the setter writes (middleware
 * keeps working: `context.locals.astryxTheme = 'neutral'`). Async context follows every
 * promise continuation the slot render creates, so nesting depth and awaits in between do
 * not matter. The slot is buffered (no streaming inside a provider), as with cascade
 * stamping.
 *
 * AsyncLocalStorage comes from `globalThis.AsyncLocalStorage` or
 * `process.getBuiltinModule('node:async_hooks')` (Node ≥ 20.16, Bun, Deno, Workers with
 * nodejs_compat) — no static `node:` import, so edge bundles still build. Where neither
 * exists the value is set for the duration of the slot render and restored afterwards (the
 * concurrency caveat above applies; `hasSubtreeIsolation()` reports which mode is active).
 *
 *   const html = await renderWithLocals(Astro, {astryxLocale: 'fr-FR'}, () => Astro.slots.render('default'));
 *   <Fragment set:html={html} />
 */

type Locals = Record<string, unknown>;
interface Frame {
  locals: object;
  values: Locals;
  parent: Frame | undefined;
}
interface Storage {
  getStore(): Frame | undefined;
  run<R>(store: Frame, fn: () => R): R;
}
type StorageCtor = new () => Storage;

function storageCtor(): StorageCtor | null {
  const g = globalThis as {AsyncLocalStorage?: StorageCtor; process?: {getBuiltinModule?: (id: string) => unknown}};
  if (typeof g.AsyncLocalStorage === 'function') return g.AsyncLocalStorage;
  try {
    const mod = g.process?.getBuiltinModule?.('node:async_hooks') as {AsyncLocalStorage?: StorageCtor} | undefined;
    if (typeof mod?.AsyncLocalStorage === 'function') return mod.AsyncLocalStorage;
  } catch {
    // not available in this runtime
  }
  return null;
}

// One store per process, shared by every copy of this module (Vite can load a module twice).
const KEY = Symbol.for('astryx-astro/subtree-locals/v1');
const holder = globalThis as unknown as {[KEY]?: {storage: Storage | null; base: WeakMap<object, Locals>}};
const shared = (holder[KEY] ??= (() => {
  const Ctor = storageCtor();
  return {storage: Ctor ? new Ctor() : null, base: new WeakMap<object, Locals>()};
})());

/** Whether providers isolate their subtree (AsyncLocalStorage available). */
export function hasSubtreeIsolation(): boolean {
  return shared.storage !== null;
}

function install(locals: Locals, key: string): void {
  let base = shared.base.get(locals);
  if (!base) shared.base.set(locals, (base = {}));
  if (Object.prototype.hasOwnProperty.call(base, key)) return;
  const own = Object.getOwnPropertyDescriptor(locals, key);
  if (own && !own.configurable) return;
  base[key] = own?.get ? own.get.call(locals) : own?.value;
  const store = base;
  Object.defineProperty(locals, key, {
    configurable: true,
    enumerable: true,
    get() {
      for (let f = shared.storage?.getStore(); f; f = f.parent) {
        if (f.locals === locals && Object.prototype.hasOwnProperty.call(f.values, key)) return f.values[key];
      }
      return store[key];
    },
    set(value: unknown) {
      store[key] = value;
    },
  });
}

/** The request-level value of a key (what a provider's subtree does not override). */
export function requestLocal(astro: {locals?: object}, key: string): unknown {
  const locals = astro.locals as Locals | undefined;
  if (!locals) return undefined;
  const base = shared.base.get(locals);
  return base && Object.prototype.hasOwnProperty.call(base, key) ? base[key] : locals[key];
}

/**
 * Render `render()` (normally `() => Astro.slots.render('default')`) with `values` visible
 * on `Astro.locals` to every component inside it. `undefined` values are skipped.
 */
export async function renderWithLocals<T>(astro: {locals?: object}, values: Locals, render: () => Promise<T>): Promise<T> {
  const locals = astro.locals as Locals | undefined;
  const entries = Object.entries(values).filter(([, v]) => v !== undefined);
  if (!locals || entries.length === 0) return render();
  const own = Object.fromEntries(entries);
  const {storage} = shared;
  if (storage) {
    for (const key of Object.keys(own)) install(locals, key);
    return storage.run({locals, values: own, parent: storage.getStore()}, render);
  }
  // Fallback without AsyncLocalStorage: set for the duration of the render, then restore.
  const previous = Object.keys(own).map((k) => [k, Object.prototype.hasOwnProperty.call(locals, k), locals[k]] as const);
  Object.assign(locals, own);
  try {
    return await render();
  } finally {
    for (const [k, had, v] of previous) {
      if (had) locals[k] = v;
      else delete locals[k];
    }
  }
}
