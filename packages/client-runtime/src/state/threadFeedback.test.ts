import { describe, expect, it } from "vite-plus/test";
import { MessageId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

import {
  beginFeedbackSubmission,
  feedbackNotice,
  parseFeedbackCommand,
  submitFeedback,
  type FeedbackSubmission,
} from "./threadFeedback.ts";

describe("beginFeedbackSubmission", () => {
  it("allows only one upload per thread until the active upload releases its guard", () => {
    const inFlight = new Set<string>();
    const finish = beginFeedbackSubmission(inFlight, "environment:thread");

    expect(finish).not.toBeNull();
    expect(beginFeedbackSubmission(inFlight, "environment:thread")).toBeNull();
    expect(beginFeedbackSubmission(inFlight, "environment:other-thread")).not.toBeNull();

    finish?.();
    expect(beginFeedbackSubmission(inFlight, "environment:thread")).not.toBeNull();
  });
});

describe("parseFeedbackCommand", () => {
  it("accepts feedback without a reason", () => {
    expect(parseFeedbackCommand(" /feedback ")).toEqual({});
  });

  it("preserves a feedback description", () => {
    expect(parseFeedbackCommand("/feedback The agent stopped early.")).toEqual({
      reason: "The agent stopped early.",
    });
  });

  it("accepts mixed-case feedback commands", () => {
    expect(parseFeedbackCommand("/Feedback Retry failed.")).toEqual({
      reason: "Retry failed.",
    });
  });

  it("ignores other slash commands and ordinary messages", () => {
    expect(parseFeedbackCommand("/feedback-status")).toBeNull();
    expect(parseFeedbackCommand("Please send /feedback")).toBeNull();
  });
});

describe("submitFeedback", () => {
  const submission = {
    id: MessageId.make("feedback-message-1"),
    command: "/feedback The agent stopped early.",
    createdAt: "2026-08-23T00:00:00.000Z",
  } as const;

  it("reports upload progress and clears the draft before the upload finishes", async () => {
    let draft: string = submission.command;
    let finishUpload:
      | ((result: ReturnType<typeof AsyncResult.success<{ feedbackId: string }>>) => void)
      | undefined;
    const states: FeedbackSubmission[] = [];
    const upload = new Promise<ReturnType<typeof AsyncResult.success<{ feedbackId: string }>>>(
      (resolve) => {
        finishUpload = resolve;
      },
    );

    const result = submitFeedback({
      submission,
      clearDraft: () => {
        draft = "";
      },
      onUpdate: (state) => states.push(state),
      upload: () => {
        expect(draft).toBe("");
        return upload;
      },
    });

    expect(draft).toBe("");
    expect(states).toEqual([{ ...submission, status: "uploading" }]);
    expect(feedbackNotice(states[0]!)).toEqual({
      title: "Sending feedback...",
      description: undefined,
    });

    draft = "Keep this newer message.";
    finishUpload?.(AsyncResult.success({ feedbackId: "provider-thread-1" }));
    await result;

    expect(draft).toBe("Keep this newer message.");
    expect(states.at(-1)).toEqual({
      ...submission,
      status: "sent",
      feedbackId: "provider-thread-1",
    });
    expect(feedbackNotice(states.at(-1)!)?.description).toContain("provider-thread-1");
  });

  it("records a failed upload without losing its user-facing error", async () => {
    const states: FeedbackSubmission[] = [];
    const error = new Error("Upload rejected.");

    await submitFeedback({
      submission,
      clearDraft: () => undefined,
      onUpdate: (state) => states.push(state),
      upload: () =>
        Promise.resolve(AsyncResult.failure<{ feedbackId: string }, Error>(Cause.fail(error))),
    });

    expect(states.at(-1)).toEqual({
      ...submission,
      status: "failed",
      errorMessage: "Upload rejected.",
    });
    expect(feedbackNotice(states.at(-1)!)?.description).toBe("Upload rejected.");
  });

  it("marks interruptions without reporting them as upload failures", async () => {
    const states: FeedbackSubmission[] = [];

    await submitFeedback({
      submission,
      clearDraft: () => undefined,
      onUpdate: (state) => states.push(state),
      upload: () =>
        Promise.resolve(AsyncResult.failure<{ feedbackId: string }, never>(Cause.interrupt(1))),
    });

    expect(states.at(-1)).toEqual({ ...submission, status: "interrupted" });
    expect(feedbackNotice(states.at(-1)!)).toBeNull();
  });

  it("lets another feedback submission finish while the first remains in flight", async () => {
    let finishFirstUpload:
      | ((result: ReturnType<typeof AsyncResult.success<{ feedbackId: string }>>) => void)
      | undefined;
    const firstUpload = new Promise<ReturnType<typeof AsyncResult.success<{ feedbackId: string }>>>(
      (resolve) => {
        finishFirstUpload = resolve;
      },
    );
    const firstStates: FeedbackSubmission[] = [];
    const secondStates: FeedbackSubmission[] = [];

    const first = submitFeedback({
      submission,
      clearDraft: () => undefined,
      onUpdate: (state) => firstStates.push(state),
      upload: () => firstUpload,
    });
    const second = await submitFeedback({
      submission: {
        ...submission,
        id: MessageId.make("feedback-message-2"),
      },
      clearDraft: () => undefined,
      onUpdate: (state) => secondStates.push(state),
      upload: () => Promise.resolve(AsyncResult.success({ feedbackId: "provider-thread-2" })),
    });

    expect(firstStates.at(-1)?.status).toBe("uploading");
    expect(second._tag).toBe("Success");
    expect(secondStates.at(-1)).toMatchObject({
      status: "sent",
      feedbackId: "provider-thread-2",
    });

    finishFirstUpload?.(AsyncResult.success({ feedbackId: "provider-thread-1" }));
    await first;
  });
});
