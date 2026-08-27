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
import type * as crons from "../crons.js";
import type * as emailActions from "../emailActions.js";
import type * as emailCleanup from "../emailCleanup.js";
import type * as emailProvider from "../emailProvider.js";
import type * as emailTemplates from "../emailTemplates.js";
import type * as eventModel from "../eventModel.js";
import type * as eventSetup from "../eventSetup.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as notifications from "../notifications.js";
import type * as notificationTypes from "../notificationTypes.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  emailActions: typeof emailActions;
  emailCleanup: typeof emailCleanup;
  emailProvider: typeof emailProvider;
  emailTemplates: typeof emailTemplates;
  eventModel: typeof eventModel;
  eventSetup: typeof eventSetup;
  events: typeof events;
  http: typeof http;
  items: typeof items;
  notifications: typeof notifications;
  notificationTypes: typeof notificationTypes;
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
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi;
};
