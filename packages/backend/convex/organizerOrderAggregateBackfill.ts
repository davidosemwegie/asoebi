import { v } from "convex/values"

import {
  insertLineAggregate,
  insertOrderAggregate,
} from "./organizerOrderAggregates"
import { internalMutation } from "./_generated/server"

/**
 * Idempotently projects source rows created before organizer aggregates were
 * mounted. Invoke repeatedly with the returned cursor until `isDone`.
 * Existing live writes use replace-or-insert helpers, so this is also safe if
 * an order changes while a backfill is underway.
 */
export const backfillPage = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    orders: v.number(),
    lines: v.number(),
  }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("orders").paginate({
      cursor,
      numItems: 50,
    })
    let lines = 0
    for (const order of page.page) {
      await insertOrderAggregate(ctx, order)
      const orderLines = await ctx.db
        .query("orderLines")
        .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
        .take(100)
      for (const line of orderLines) {
        await insertLineAggregate(ctx, line)
        lines += 1
      }
    }
    return {
      continueCursor: page.continueCursor,
      isDone: page.isDone,
      orders: page.page.length,
      lines,
    }
  },
})
