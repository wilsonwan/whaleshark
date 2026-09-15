import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

vi.mock("@napi-rs/keyring", () => {
  throw new Error("Cannot find native binding");
});

it("loads browser import code without a keyring native binding", async () => {
  await expect(import("./ChromiumKeys.ts")).resolves.toBeDefined();
});
