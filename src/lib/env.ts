// Runtime feature detection for Chrome Extension APIs.
// All checks are defensive — the app must work as a plain web page too.

export const APP_VERSION: string =
  // Injected by Vite via define()
  // @ts-expect-error: replaced at build time
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

export const isProd = import.meta.env.PROD;
export const isDev = import.meta.env.DEV;

export function isChromeExtension(): boolean {
  return (
    typeof chrome !== "undefined" &&
    typeof chrome.runtime !== "undefined" &&
    typeof chrome.runtime.id === "string" &&
    !!chrome.runtime.id
  );
}

export function hasTabsApi(): boolean {
  return isChromeExtension() && typeof chrome.tabs?.query === "function";
}
