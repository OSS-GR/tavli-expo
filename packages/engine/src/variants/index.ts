/**
 * The built-in variants and a registry that holds them.
 */

import { createVariantRegistry } from '../variant';
import type { Variant, VariantRegistry } from '../variant';
import { asodio } from './asodio';
import { fevga } from './fevga';
import { plakoto } from './plakoto';
import { portes } from './portes';

export { asodio, fevga, plakoto, portes };

/** Every variant the engine can play today. */
export const BUILT_IN_VARIANTS: readonly Variant[] = [portes, plakoto, fevga, asodio];

/** A registry with `BUILT_IN_VARIANTS`. Use `getVariant(VARIANT_REGISTRY, state.variant)`. */
export const VARIANT_REGISTRY: VariantRegistry = createVariantRegistry(BUILT_IN_VARIANTS);
