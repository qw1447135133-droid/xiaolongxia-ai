export async function resolveBackendUrl(path: string): Promise<string> {
  if (typeof window === "undefined") return path;

  const electronAPI = (window as unknown as {
    electronAPI?: { getWsPort?: () => Promise<number> };
  }).electronAPI;

  const isDesktopRuntime = window.location.protocol === "file:" || Boolean(electronAPI);
  if (!isDesktopRuntime) return path;

  let port = 3001;
  if (electronAPI?.getWsPort) {
    try {
      port = await electronAPI.getWsPort();
    } catch {
      port = 3001;
    }
  }
  return `http://localhost:${port}${path}`;
}
