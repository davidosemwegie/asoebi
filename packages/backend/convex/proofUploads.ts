"use node"

import { v } from "convex/values"
import type { FunctionReference } from "convex/server"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action } from "./_generated/server"

const internalCheckout = internal as unknown as {
  checkout: {
    inspectProofUpload: FunctionReference<
      "query",
      "internal",
      { claimId: Id<"proofUploadClaims">; storageId: Id<"_storage"> },
      { contentType: string } | null
    >
    recordProofUpload: FunctionReference<
      "mutation",
      "internal",
      { claimId: Id<"proofUploadClaims">; storageId: Id<"_storage"> },
      boolean
    >
    finalizeProofUpload: FunctionReference<
      "mutation",
      "internal",
      {
        claimId: Id<"proofUploadClaims">
        storageId: Id<"_storage">
        signatureValid: boolean
      },
      | { ok: true; proofId: Id<"paymentProofs"> }
      | { ok: false; message: string }
    >
  }
}

function startsWith(bytes: Uint8Array, expected: readonly number[]) {
  return expected.every((value, index) => bytes[index] === value)
}

async function hasValidSignature(blob: Blob, contentType: string) {
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer())
  if (contentType === "image/jpeg") {
    const tail = new Uint8Array(await blob.slice(-2).arrayBuffer())
    return (
      blob.size >= 6 &&
      startsWith(head, [0xff, 0xd8, 0xff]) &&
      head[3] !== 0 &&
      head[3] !== 0xff &&
      startsWith(tail, [0xff, 0xd9])
    )
  }
  if (contentType === "image/png") {
    const tail = new Uint8Array(await blob.slice(-12).arrayBuffer())
    return (
      blob.size >= 45 &&
      startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
      startsWith(head.slice(8), [0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]) &&
      startsWith(
        tail,
        [0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]
      )
    )
  }
  if (contentType === "application/pdf") {
    const tail = new TextDecoder().decode(await blob.slice(-2048).arrayBuffer())
    return (
      blob.size >= 8 &&
      new TextDecoder().decode(head.slice(0, 5)) === "%PDF-" &&
      tail.includes("%%EOF")
    )
  }
  return false
}

export const finalize = action({
  args: { claimId: v.id("proofUploadClaims"), storageId: v.id("_storage") },
  returns: v.union(
    v.object({ ok: v.literal(true), proofId: v.id("paymentProofs") }),
    v.object({ ok: v.literal(false), message: v.string() })
  ),
  handler: async (ctx, args) => {
    if (
      !(await ctx.runMutation(
        internalCheckout.checkout.recordProofUpload,
        args
      ))
    )
      return {
        ok: false as const,
        message: "This payment receipt could not be verified. Upload it again.",
      }
    const candidate = await ctx.runQuery(
      internalCheckout.checkout.inspectProofUpload,
      args
    )
    const stored = candidate ? await ctx.storage.get(args.storageId) : null
    const signatureValid = Boolean(
      stored &&
      candidate &&
      (await hasValidSignature(stored, candidate.contentType))
    )
    return await ctx.runMutation(
      internalCheckout.checkout.finalizeProofUpload,
      { ...args, signatureValid }
    )
  },
})
