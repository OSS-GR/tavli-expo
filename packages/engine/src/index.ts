/**
 * The tavli game engine.
 *
 * This package is pure TypeScript. It must not import React, React Native,
 * network code or vendor SDKs. It must not call `Math.random`. Dice come
 * from an RNG that the caller passes in.
 */

/** The number of checkers each player has. */
export const CHECKERS_PER_PLAYER = 15;

/** The number of points (triangles) on the board. */
export const POINTS_ON_BOARD = 24;
