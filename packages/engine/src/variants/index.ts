/**
 * The built-in variants and a registry that holds them.
 *
 * Fevga (#49) and Asodio (#50) join this list when they are built.
 */

import { createVariantRegistry } from '../variant';
import type { Variant, VariantRegistry } from '../variant';
import { plakoto } from './plakoto';
import { portes } from './portes';

export { plakoto, portes };

/** Every variant the engine can play today. */
export const BUILT_IN_VARIANTS: readonly Variant[] = [portes, plakoto];

/** A registry with `BUILT_IN_VARIANTS`. Use `getVariant(VARIANT_REGISTRY, state.variant)`. */
export const VARIANT_REGISTRY: VariantRegistry = createVariantRegistry(BUILT_IN_VARIANTS);
