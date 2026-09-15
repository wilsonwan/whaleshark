import { describe, expect, it } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  StageBackdropArt,
} from "./SidebarStageBackdrop";

describe("SidebarStageBackdrop", () => {
  it("resolves stage artwork only when enabled", () => {
    expect(resolveSidebarStageBackdropVariant("Dev")).toBe("dev");
    expect(resolveSidebarStageBackdropVariant("Dev", false)).toBeNull();
    expect(resolveSidebarStageBackdropVariant("Alpha")).toBeNull();
  });

  it("resolves supported environment pill labels", () => {
    expect(resolveEnvironmentIdentificationPillLabel("Dev")).toBe("Dev");
    expect(resolveEnvironmentIdentificationPillLabel("Latest")).toBeNull();
    expect(resolveEnvironmentIdentificationPillLabel("Alpha")).toBeNull();
  });

  it("uses unique SVG definition ids when dev artwork is rendered more than once", () => {
    const markup = renderToStaticMarkup(
      <>
        <StageBackdropArt variant="dev" />
        <StageBackdropArt variant="dev" />
      </>,
    );
    const ids = Array.from(markup.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
