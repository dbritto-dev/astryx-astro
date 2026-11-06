/**
 * Page-wide singletons for the client runtime.
 *
 * One page can evaluate a runtime module twice: under `astro dev` Vite pre-bundles a consumer's
 * `import {toast} from 'astryx-astro/elements/toast'` into `.vite/deps` (with its own copies of
 * everything it imports) while each component's `<script>` loads the raw `src/elements/*.ts`.
 * Module-level state would then split in two — a second toast queue, a second Escape stack, a
 * second document listener reading a registry the first never sees.
 *
 * Rule: every module-level mutable value (queues, stacks, registries, "listening" flags, id
 * counters, shared resources) lives in the object `globalSingleton(name, create)` returns: the
 * first copy that asks creates it on `globalThis[Symbol.for('astryx-astro/<name>/v1')]`, every
 * later copy gets the same object. Listener functions a module adds to a document are stored in
 * that object too, so whichever copy removes them removes the same function. Only pure caches of
 * derived values (a feature test) may stay module-local. Bump `v1` when a state's shape changes
 * incompatibly. SSR-safe: nothing here touches the DOM.
 *
 *   const state = globalSingleton('layer-stack', () => ({entries: [] as Entry[], nextSeq: 0}));
 *
 * `brandClass(Cls, name)` does the same for class identity: only the first copy's class is
 * registered with `customElements`, so `el instanceof Cls` fails for the other copies' `Cls`.
 * Branded, `instanceof Cls` also holds for an instance of any copy of `Cls` (or of a subclass of
 * one); subclasses of `Cls` keep the plain prototype check.
 */

type Holder = Record<symbol, unknown>;

/** The page's one `T` for `name`, created by the first module copy that asks. */
export function globalSingleton<T extends object>(name: string, create: () => T): T {
  const key = Symbol.for(`astryx-astro/${name}/v1`);
  const holder = globalThis as unknown as Holder;
  let value = holder[key] as T | undefined;
  if (value === undefined) {
    value = create();
    Object.defineProperty(holder, key, {value, configurable: true});
  }
  return value;
}

const plainHasInstance = Function.prototype[Symbol.hasInstance];

/** Make `instanceof Cls` recognise instances of every copy of `Cls` (see the header). */
export function brandClass(cls: abstract new (...args: never[]) => object, name: string): void {
  const key = Symbol.for(`astryx-astro/${name}/brand/v1`);
  Object.defineProperty(cls.prototype, key, {value: true});
  Object.defineProperty(cls, Symbol.hasInstance, {
    configurable: true,
    value(this: unknown, value: unknown): boolean {
      if (plainHasInstance.call(this, value)) return true;
      return this === cls && typeof value === 'object' && value !== null && (value as Holder)[key] === true;
    },
  });
}
