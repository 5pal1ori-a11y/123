/** Breaks circular imports between store.ts and store-ext / store-admin. */

let bindFn: (() => void) | null = null;
let bound = false;

export function registerStoreBinder(fn: () => void) {
  bindFn = fn;
}

export function ensureStoreExtensions() {
  if (bound || !bindFn) return;
  bindFn();
  bound = true;
}
