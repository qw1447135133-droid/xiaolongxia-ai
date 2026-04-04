export const ELECTRON_RUNTIME_QUERY_KEYS = [
  "desktop-client",
  "electronSafe",
  "electron",
  "desktop",
  "runtime",
  "shell",
  "target",
  "platform",
  "client",
  "app",
] as const;

function hasElectronQueryFlag(params: URLSearchParams) {
  return ELECTRON_RUNTIME_QUERY_KEYS.some((key) => {
    const value = params.get(key);
    return value === "electron" || value === "1";
  });
}

export function isElectronSearchString(search: string) {
  const normalized = search.startsWith("?") ? search.slice(1) : search;
  if (!normalized) return false;
  return hasElectronQueryFlag(new URLSearchParams(normalized));
}

export function detectElectronRuntimeWindow(target: Window) {
  return (
    isElectronSearchString(target.location.search || "")
    || Boolean(target.__XLX_ELECTRON__)
    || Boolean(target.electronAPI?.isElectron)
    || target.document.documentElement?.dataset?.runtime === "electron"
    || target.document.documentElement?.classList?.contains("runtime-electron")
    || /electron/i.test(target.navigator.userAgent || "")
  );
}
