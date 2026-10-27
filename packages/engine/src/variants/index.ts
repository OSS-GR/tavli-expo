/**
 * The built-in variants and a registry that holds them.
 *
 * Plakoto (#48) and Asodio (#50) join this list when they are built.
 */

import { createVariantRegistry } from '../variant';
import type { Variant, VariantRegistry } from '../variant';
import { fevga } from './fevga';
import { portes } from './portes';

export { fevga, portes };

/** Every variant the engine can play today. */
export const BUILT_IN_VARIANTS: readonly Variant[] = [portes, fevga];

/** A registry with `BUILT_IN_VARIANTS`. Use `getVariant(VARIANT_REGISTRY, state.variant)`. */
export const VARIANT_REGISTRY: VariantRegistry = createVariantRegistry(BUILT_IN_VARIANTS);
