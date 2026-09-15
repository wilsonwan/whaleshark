// @effect-diagnostics nodeBuiltinImport:off -- This platform boundary asks the OS for its foreground window with Node.

import { loadWindowsForegroundApi } from "../electron/WindowsForeground.ts";

/**
 * The foreground window as the snapshot service needs it. `id` is the HWND
 * that the Windows capture backend keys on.
 */
export type ActiveWindow = {
  readonly platform: "windows";
  readonly id: number;
  readonly title: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly owner: {
    readonly name: string;
    readonly processId: number;
    readonly path: string;
  };
};

async function windowsActiveWindow(): Promise<ActiveWindow | undefined> {
  const api = await loadWindowsForegroundApi();
  const handle = api.getForegroundWindow();
  if (handle === 0n) return undefined;
  const bounds = api.getWindowRect(handle);
  if (!bounds) return undefined;
  const { processId } = api.getWindowThreadAndProcessId(handle);
  const path = processId === 0 ? "" : api.getProcessImagePath(processId);
  const name = path.split(/[\\/]/).pop() ?? "";
  return {
    platform: "windows",
    id: Number(handle),
    title: api.getWindowText(handle),
    bounds,
    owner: { name, processId, path },
  };
}

/** Resolve the OS foreground window, or `undefined` when there is none. */
export function activeWindow(platform: NodeJS.Platform): Promise<ActiveWindow | undefined> {
  if (platform === "win32") return windowsActiveWindow();
  return Promise.resolve(undefined);
}
