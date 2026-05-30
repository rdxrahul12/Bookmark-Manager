/**
 * @deprecated Compatibility shim — the engine now lives in
 * `@/utils/iconEngine`. Kept as a thin re-export so existing imports keep
 * working. New code should import from `@/utils/iconEngine` directly.
 */

export {
  resolveBestIcon,
  prefetchIcon,
  type IconResult,
  type ResolveOptions,
} from "./iconEngine";
