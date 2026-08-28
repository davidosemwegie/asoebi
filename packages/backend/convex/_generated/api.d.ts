/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as checkout from "../checkout.js";
import type * as crons from "../crons.js";
import type * as emailActions from "../emailActions.js";
import type * as emailCleanup from "../emailCleanup.js";
import type * as emailProvider from "../emailProvider.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as eventAttendees from "../eventAttendees.js";
import type * as eventInvitationAggregates from "../eventInvitationAggregates.js";
import type * as eventInvitations from "../eventInvitations.js";
import type * as eventModel from "../eventModel.js";
import type * as eventSetup from "../eventSetup.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as notificationTypes from "../notificationTypes.js";
import type * as notifications from "../notifications.js";
import type * as orderModel from "../orderModel.js";
import type * as orders from "../orders.js";
import type * as proofUploads from "../proofUploads.js";
import type * as sharedEvents from "../sharedEvents.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  checkout: typeof checkout;
  crons: typeof crons;
  emailActions: typeof emailActions;
  emailCleanup: typeof emailCleanup;
  emailProvider: typeof emailProvider;
  emailTemplates: typeof emailTemplates;
  eventAttendees: typeof eventAttendees;
  eventInvitationAggregates: typeof eventInvitationAggregates;
  eventInvitations: typeof eventInvitations;
  eventModel: typeof eventModel;
  eventSetup: typeof eventSetup;
  events: typeof events;
  http: typeof http;
  items: typeof items;
  notificationTypes: typeof notificationTypes;
  notifications: typeof notifications;
  orderModel: typeof orderModel;
  orders: typeof orders;
  proofUploads: typeof proofUploads;
  sharedEvents: typeof sharedEvents;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  invitationDeliveryCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"invitationDeliveryCounts">;
  invitationActivityCounts: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"invitationActivityCounts">;
};
