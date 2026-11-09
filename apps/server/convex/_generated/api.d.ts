/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as appUpdate from "../appUpdate.js";
import type * as appleTokens from "../appleTokens.js";
import type * as auth from "../auth.js";
import type * as authKeys from "../authKeys.js";
import type * as caller from "../caller.js";
import type * as games from "../games.js";
import type * as guestMove from "../guestMove.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as keyPlugin from "../keyPlugin.js";
import type * as model_account from "../model/account.js";
import type * as model_appUpdate from "../model/appUpdate.js";
import type * as model_appleIdToken from "../model/appleIdToken.js";
import type * as model_appleTokens from "../model/appleTokens.js";
import type * as model_cryptoRng from "../model/cryptoRng.js";
import type * as model_keyNonce from "../model/keyNonce.js";
import type * as model_moveTicket from "../model/moveTicket.js";
import type * as model_push from "../model/push.js";
import type * as playerNames from "../playerNames.js";
import type * as push from "../push.js";
import type * as safety from "../safety.js";
import type * as usernames from "../usernames.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  appUpdate: typeof appUpdate;
  appleTokens: typeof appleTokens;
  auth: typeof auth;
  authKeys: typeof authKeys;
  caller: typeof caller;
  games: typeof games;
  guestMove: typeof guestMove;
  http: typeof http;
  invites: typeof invites;
  keyPlugin: typeof keyPlugin;
  "model/account": typeof model_account;
  "model/appUpdate": typeof model_appUpdate;
  "model/appleIdToken": typeof model_appleIdToken;
  "model/appleTokens": typeof model_appleTokens;
  "model/cryptoRng": typeof model_cryptoRng;
  "model/keyNonce": typeof model_keyNonce;
  "model/moveTicket": typeof model_moveTicket;
  "model/push": typeof model_push;
  playerNames: typeof playerNames;
  push: typeof push;
  safety: typeof safety;
  usernames: typeof usernames;
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
};
