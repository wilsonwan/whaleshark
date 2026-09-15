import { assert, describe, it } from "vite-plus/test";

import { resolveElectronBinaryPath } from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(electronPath, "/repo/node_modules/electron/dist/electron");
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });
});
