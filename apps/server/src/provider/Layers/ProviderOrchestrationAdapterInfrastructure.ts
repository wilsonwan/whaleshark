import * as Layer from "effect/Layer";

import { IdAllocatorV2, layer as idAllocatorLayer } from "../../orchestration-v2/IdAllocator.ts";
import { layer as providerContinuationRequestsLayer } from "../../orchestration-v2/ProviderContinuationRequests.ts";

export type ProviderOrchestrationAdapterInfrastructure = IdAllocatorV2;

/**
 * Infrastructure shared by the V2 adapters materialized inside provider
 * instances. `providerContinuationRequestsLayer` must be the same layer
 * reference the orchestration runtime provides to its continuation worker so
 * Effect layer memoization yields one shared queue.
 */
export const ProviderOrchestrationAdapterInfrastructureLive = Layer.mergeAll(
  idAllocatorLayer,
  providerContinuationRequestsLayer,
);
