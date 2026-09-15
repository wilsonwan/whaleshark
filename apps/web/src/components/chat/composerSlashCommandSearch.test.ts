import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import type { ComposerCommandItem } from "./ComposerCommandMenu";
import {
  searchSlashCommandItems,
  slashCommandItemsForPromptPosition,
} from "./composerSlashCommandSearch";

describe("searchSlashCommandItems", () => {
  const piDriver = ProviderDriverKind.make("pi");

  it("moves exact provider command matches ahead of broader description matches", () => {
    const items = [
      {
        id: "slash:default",
        type: "slash-command",
        command: "default",
        label: "/default",
        description: "Switch this thread back to normal build mode",
      },
      {
        id: "provider-slash-command:pi:ui",
        type: "provider-slash-command",
        provider: piDriver,
        command: { name: "ui" },
        label: "/ui",
        description: "Explore, build, and refine UI.",
      },
      {
        id: "provider-slash-command:pi:frontend-design",
        type: "provider-slash-command",
        provider: piDriver,
        command: { name: "frontend-design" },
        label: "/frontend-design",
        description: "Create distinctive, production-grade frontend interfaces",
      },
    ] satisfies Array<
      Extract<ComposerCommandItem, { type: "slash-command" | "provider-slash-command" | "skill" }>
    >;

    expect(searchSlashCommandItems(items, "ui").map((item) => item.id)).toEqual([
      "provider-slash-command:pi:ui",
      "slash:default",
    ]);
  });

  it("supports fuzzy provider command matches", () => {
    const items = [
      {
        id: "provider-slash-command:pi:gh-fix-ci",
        type: "provider-slash-command",
        provider: piDriver,
        command: { name: "gh-fix-ci" },
        label: "/gh-fix-ci",
        description: "Fix failing GitHub Actions",
      },
      {
        id: "provider-slash-command:pi:github",
        type: "provider-slash-command",
        provider: piDriver,
        command: { name: "github" },
        label: "/github",
        description: "General GitHub help",
      },
    ] satisfies Array<
      Extract<ComposerCommandItem, { type: "slash-command" | "provider-slash-command" | "skill" }>
    >;

    expect(searchSlashCommandItems(items, "gfc").map((item) => item.id)).toEqual([
      "provider-slash-command:pi:gh-fix-ci",
    ]);
  });

  it("includes skills by name and description", () => {
    const items = [
      {
        id: "skill:pi:browser",
        type: "skill",
        provider: piDriver,
        skill: {
          name: "browser",
          path: "/skills/browser/SKILL.md",
          enabled: true,
          shortDescription: "Open and control the in-app browser",
        },
        label: "/skill:browser",
        description: "Open and control the in-app browser",
      },
    ] satisfies Array<Extract<ComposerCommandItem, { type: "skill" }>>;

    expect(searchSlashCommandItems(items, "browser").map((item) => item.id)).toEqual([
      "skill:pi:browser",
    ]);
    expect(searchSlashCommandItems(items, "control").map((item) => item.id)).toEqual([
      "skill:pi:browser",
    ]);
  });

  it("matches skills by display name", () => {
    const items = [
      {
        id: "skill:pi:ask-matt",
        type: "skill",
        provider: piDriver,
        skill: {
          name: "ask-matt",
          displayName: "Ask Matt",
          path: "/skills/ask-matt/SKILL.md",
          enabled: true,
          shortDescription: "Find the right skill or workflow",
        },
        label: "/skill:ask-matt",
        description: "Find the right skill or workflow",
      },
    ] satisfies Array<Extract<ComposerCommandItem, { type: "skill" }>>;

    expect(searchSlashCommandItems(items, "ask matt").map((item) => item.id)).toEqual([
      "skill:pi:ask-matt",
    ]);
    expect(searchSlashCommandItems(items, "/skill:ask-matt").map((item) => item.id)).toEqual([
      "skill:pi:ask-matt",
    ]);
  });

  it("matches skills by their rendered prefix", () => {
    const items = [
      {
        id: "skill:pi:browser",
        type: "skill",
        provider: piDriver,
        skill: {
          name: "browser",
          path: "/skills/browser/SKILL.md",
          enabled: true,
        },
        label: "/skill:browser",
        description: "Open and control the in-app browser",
      },
    ] satisfies Array<Extract<ComposerCommandItem, { type: "skill" }>>;

    expect(searchSlashCommandItems(items, "/skill:brow").map((item) => item.id)).toEqual([
      "skill:pi:browser",
    ]);
    expect(searchSlashCommandItems(items, "/sk").map((item) => item.id)).toEqual([
      "skill:pi:browser",
    ]);
    expect(searchSlashCommandItems(items, "/ill")).toEqual([]);
  });

  it("keeps skills alongside commands for an empty slash query", () => {
    const items = [
      {
        id: "slash:model",
        type: "slash-command",
        command: "model",
        label: "/model",
        description: "Switch model",
      },
      {
        id: "skill:pi:unslop",
        type: "skill",
        provider: piDriver,
        skill: {
          name: "unslop",
          path: "/skills/unslop/SKILL.md",
          enabled: true,
        },
        label: "/skill:unslop",
        description: "Cut AI tells from writing",
      },
    ] satisfies Array<Extract<ComposerCommandItem, { type: "slash-command" | "skill" }>>;

    expect(searchSlashCommandItems(items, "").map((item) => item.id)).toEqual([
      "slash:model",
      "skill:pi:unslop",
    ]);
  });

  it("hides provider commands from slash completion after the first message line", () => {
    const items = [
      {
        id: "slash:model",
        type: "slash-command",
        command: "model",
        label: "/model",
        description: "Switch model",
      },
      {
        id: "provider-slash-command:pi:compact",
        type: "provider-slash-command",
        provider: piDriver,
        command: { name: "compact" },
        label: "/compact",
        description: "Compact the conversation",
      },
      {
        id: "skill:pi:unslop",
        type: "skill",
        provider: piDriver,
        skill: {
          name: "unslop",
          path: "/skills/unslop/SKILL.md",
          enabled: true,
        },
        label: "/skill:unslop",
        description: "Cut AI tells from writing",
      },
    ] satisfies Array<
      Extract<ComposerCommandItem, { type: "slash-command" | "provider-slash-command" | "skill" }>
    >;

    expect(slashCommandItemsForPromptPosition(items, false).map((item) => item.id)).toEqual([
      "slash:model",
      "skill:pi:unslop",
    ]);
    expect(slashCommandItemsForPromptPosition(items, true).map((item) => item.id)).toEqual([
      "slash:model",
      "provider-slash-command:pi:compact",
      "skill:pi:unslop",
    ]);
  });
});
