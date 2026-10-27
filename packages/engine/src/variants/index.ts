/**
 * The built-in variants and a registry that holds them.
 *
 * Asodio (#50) joins this list when it is built.
 */

import { createVariantRegistry } from '../variant';
import type { Variant, VariantRegistry } from '../variant';
import { fevga } from './fevga';
import { plakoto } from './plakoto';
import { portes } from './portes';

export { fevga, plakoto, portes };

/** Every variant the engine can play today. */
export const BUILT_IN_VARIANTS: readonly Variant[] = [portes, plakoto, fevga];

/** A registry with `BUILT_IN_VARIANTS`. Use `getVariant(VARIANT_REGISTRY, state.variant)`. */
export const VARIANT_REGISTRY: VariantRegistry = createVariantRegistry(BUILT_IN_VARIANTS);
