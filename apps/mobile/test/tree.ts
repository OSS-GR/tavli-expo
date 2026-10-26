/** Helpers to look into a rendered tree (`screen.toJSON()`), e.g. mocked Skia elements. */

export interface JsonNode {
  type: string;
  props: Record<string, unknown>;
  children: (JsonNode | string)[] | null;
}

type Json = JsonNode | JsonNode[] | string | null;

/** Every element in the tree that matches. */
export function findAllNodes(tree: Json, match: (node: JsonNode) => boolean): JsonNode[] {
  if (tree === null || typeof tree === 'string') return [];
  if (Array.isArray(tree)) return tree.flatMap((n) => findAllNodes(n, match));
  const own = match(tree) ? [tree] : [];
  return [...own, ...(tree.children ?? []).flatMap((c) => findAllNodes(c, match))];
}

/** How many elements of this type the tree has. */
export function countNodes(tree: Json, type: string): number {
  return findAllNodes(tree, (n) => n.type === type).length;
}
