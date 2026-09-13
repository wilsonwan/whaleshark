import { describe, expect, it } from "vite-plus/test";

import { resolveDesktopPairingUrl } from "./pairingUrls";

describe("settings pairing URL helpers", () => {
  it("builds direct pairing URLs with the token in the hash", () => {
    expect(resolveDesktopPairingUrl("http://192.168.1.44:3773", "PAIRCODE")).toBe(
      "http://192.168.1.44:3773/pair#token=PAIRCODE",
    );
  });

  it("keeps the tailnet origin for HTTPS endpoints", () => {
    expect(resolveDesktopPairingUrl("https://host.tailnet.example.ts.net:3773", "PAIRCODE")).toBe(
      "https://host.tailnet.example.ts.net:3773/pair#token=PAIRCODE",
    );
  });
});
