/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as games from "../games.js";
import type * as invites from "../invites.js";
import type * as model_crypto_rng from "../model/crypto-rng.js";
import type * as model_invites from "../model/invites.js";
import type * as model_online_game from "../model/online-game.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  games: typeof games;
  invites: typeof invites;
  "model/crypto-rng": typeof model_crypto_rng;
  "model/invites": typeof model_invites;
  "model/online-game": typeof model_online_game;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
