import {
  MessageId,
  type OrchestrationMessage,
  type ProviderUploadFeedbackResult,
} from "@t3tools/contracts";

import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "./runtime.ts";

type FeedbackSubmissionDetails = {
  readonly id: MessageId;
  readonly command: string;
  readonly createdAt: string;
};

export type FeedbackSubmission = FeedbackSubmissionDetails &
  (
    | { readonly status: "uploading" | "interrupted" }
    | { readonly status: "sent"; readonly feedbackId: string }
    | { readonly status: "failed"; readonly errorMessage: string }
  );

export function parseFeedbackCommand(text: string): { readonly reason?: string } | null {
  const match = /^\/feedback(?:\s+([\s\S]*))?$/iu.exec(text.trim());
  if (!match) {
    return null;
  }
  const reason = match[1]?.trim();
  return reason ? { reason } : {};
}

export function feedbackNotice(submission: FeedbackSubmission) {
  switch (submission.status) {
    case "interrupted":
      return null;
    case "uploading":
      return { title: "Sending feedback...", description: undefined };
    case "sent":
      return {
        title: "Feedback sent",
        description: `Thread ID: ${submission.feedbackId}`,
      };
    case "failed":
      return { title: "Could not send feedback", description: submission.errorMessage };
  }
}

export function beginFeedbackSubmission(
  submissionsInFlight: Set<string>,
  threadKey: string,
): (() => void) | null {
  if (submissionsInFlight.has(threadKey)) return null;
  submissionsInFlight.add(threadKey);
  return () => submissionsInFlight.delete(threadKey);
}

export async function submitFeedback<E>(input: {
  readonly submission: FeedbackSubmissionDetails;
  readonly clearDraft: () => void;
  readonly onUpdate: (submission: FeedbackSubmission) => void;
  readonly upload: () => Promise<AtomCommandResult<ProviderUploadFeedbackResult, E>>;
}): Promise<AtomCommandResult<ProviderUploadFeedbackResult, E>> {
  input.onUpdate({ ...input.submission, status: "uploading" });
  input.clearDraft();

  const result = await input.upload();
  if (result._tag === "Success") {
    input.onUpdate({
      ...input.submission,
      status: "sent",
      feedbackId: result.value.feedbackId,
    });
  } else if (isAtomCommandInterrupted(result)) {
    input.onUpdate({ ...input.submission, status: "interrupted" });
  } else {
    const error = squashAtomCommandFailure(result);
    input.onUpdate({
      ...input.submission,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "An error occurred.",
    });
  }

  return result;
}
