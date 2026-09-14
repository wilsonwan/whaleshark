import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";

import {
  providerModelKey,
  sortModelsForProviderInstance,
  sortProviderModelItems,
} from "./modelOrdering";

const CLAUDE_WORK_ID = ProviderInstanceId.make("claude_work");
const CLAUDE_ID = ProviderInstanceId.make("claudeAgent");

describe("model ordering", () => {
  it("groups favorites first while preserving provider model order inside each group", () => {
    const models = [
      { slug: "gpt-5.5" },
      { slug: "gpt-5.4-mini" },
      { slug: "crest-alpha" },
      { slug: "claude-opus-4-6" },
    ];

    expect(
      sortModelsForProviderInstance(models, {
        favoriteModels: ["gpt-5.5", "gpt-5.4-mini", "crest-alpha"],
        groupFavorites: true,
        modelOrder: ["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "claude-opus-4-6"],
      }).map((model) => model.slug),
    ).toEqual(["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "claude-opus-4-6"]);
  });

  it("sorts the favorites view by provider order, then provider model order", () => {
    const items = [
      { instanceId: CLAUDE_WORK_ID, slug: "gpt-5.4-mini" },
      { instanceId: CLAUDE_WORK_ID, slug: "gpt-5.5" },
      { instanceId: CLAUDE_WORK_ID, slug: "crest-alpha" },
      { instanceId: CLAUDE_ID, slug: "claude-opus-4-6" },
    ];
    const favoriteKeys = [
      providerModelKey(CLAUDE_WORK_ID, "gpt-5.5"),
      providerModelKey(CLAUDE_ID, "claude-opus-4-6"),
      providerModelKey(CLAUDE_WORK_ID, "gpt-5.4-mini"),
      providerModelKey(CLAUDE_WORK_ID, "crest-alpha"),
    ];

    expect(
      sortProviderModelItems(items, {
        favoriteModelKeys: favoriteKeys,
        instanceOrder: [CLAUDE_WORK_ID, CLAUDE_ID],
      }).map((item) => item.slug),
    ).toEqual(["gpt-5.4-mini", "gpt-5.5", "crest-alpha", "claude-opus-4-6"]);
  });
});
