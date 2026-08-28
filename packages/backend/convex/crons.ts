import { cronJobs } from "convex/server"
import type { FunctionReference } from "convex/server"

import { internal } from "./_generated/api"

const internalCheckout = internal as unknown as {
  checkout: {
    cleanExpiredOrderArtifacts: FunctionReference<
      "mutation",
      "internal",
      Record<string, never>,
      { claims: number; receipts: number; orphans: number }
    >
  }
}

const crons = cronJobs()

crons.interval(
  "clean finalized email bodies",
  { hours: 24 },
  internal.emailCleanup.cleanFinalizedBodies
)
crons.interval(
  "clean expired order receipts and upload claims",
  { hours: 1 },
  internalCheckout.checkout.cleanExpiredOrderArtifacts,
  {}
)
crons.interval(
  "clean abandoned email records",
  { hours: 24 },
  internal.emailCleanup.cleanAbandonedRecords
)
crons.interval(
  "scrub expired application email payloads",
  { hours: 24 },
  internal.emailCleanup.scrubExpiredApplicationPayloads
)
crons.interval(
  "clean unmatched email suppressions",
  { hours: 24 },
  internal.emailCleanup.cleanPendingSuppressions
)
crons.interval(
  "clean invitation operation receipts",
  { hours: 24 },
  internal.eventInvitations.cleanExpiredReceipts,
  {}
)

export default crons
