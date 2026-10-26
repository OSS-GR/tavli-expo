/**
 * Shared React Native components and design tokens.
 *
 * Dependencies flow one way: app -> ui -> contracts.
 * This package must not import from `apps/mobile`.
 */

export { colors, spacing } from './tokens';
