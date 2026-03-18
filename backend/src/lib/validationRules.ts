import {
  Kind,
  GraphQLError,
  type ASTVisitor,
  type ValidationContext,
  type SelectionSetNode,
  type FieldNode,
  type FragmentSpreadNode,
  type InlineFragmentNode,
  type DocumentNode,
} from 'graphql';

/**
 * Depth-limiting validation rule with fragment cycle detection.
 * Rejects queries exceeding the specified max depth.
 */
export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    return {
      Document: {
        enter(document: DocumentNode) {
          const fragments = new Map<string, SelectionSetNode>();

          for (const def of document.definitions) {
            if (def.kind === Kind.FRAGMENT_DEFINITION) {
              fragments.set(def.name.value, def.selectionSet);
            }
          }

          for (const def of document.definitions) {
            if (def.kind === Kind.OPERATION_DEFINITION) {
              const depth = measureDepth(
                def.selectionSet,
                fragments,
                0,
                new Set(),
              );
              if (depth > maxDepth) {
                context.reportError(
                  new GraphQLError(
                    `Query depth of ${depth} exceeds the maximum allowed depth of ${maxDepth}`,
                  ),
                );
              }
            }
          }
        },
      },
    };
  };
}

function measureDepth(
  selectionSet: SelectionSetNode | undefined,
  fragments: Map<string, SelectionSetNode>,
  currentDepth: number,
  visitedFragments: Set<string>,
): number {
  if (!selectionSet) return currentDepth;

  let maxDepth = currentDepth;

  for (const selection of selectionSet.selections) {
    let nestedDepth = currentDepth;

    if (selection.kind === Kind.FIELD) {
      const field = selection as FieldNode;
      if (field.name.value.startsWith('__')) continue;
      nestedDepth = measureDepth(
        field.selectionSet,
        fragments,
        currentDepth + 1,
        visitedFragments,
      );
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const spread = selection as FragmentSpreadNode;
      const name = spread.name.value;
      // Cycle detection: skip already-visited fragments on this path
      if (visitedFragments.has(name)) continue;
      const fragmentSet = fragments.get(name);
      const pathFragments = new Set(visitedFragments);
      pathFragments.add(name);
      nestedDepth = measureDepth(
        fragmentSet,
        fragments,
        currentDepth,
        pathFragments,
      );
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inline = selection as InlineFragmentNode;
      nestedDepth = measureDepth(
        inline.selectionSet,
        fragments,
        currentDepth,
        visitedFragments,
      );
    }

    if (nestedDepth > maxDepth) maxDepth = nestedDepth;
  }

  return maxDepth;
}

/**
 * Weighted complexity rule with alias limiting.
 *  - Fields without sub-selections cost 1
 *  - Fields with sub-selections (objects/lists) cost 10
 *  - Top-level field count is capped (prevents alias fan-out)
 */
export function complexityLimit(
  maxComplexity: number,
  maxTopLevelFields: number = 30,
) {
  return (context: ValidationContext): ASTVisitor => {
    let complexity = 0;
    let topLevelFields = 0;

    return {
      OperationDefinition: {
        enter(node) {
          topLevelFields = node.selectionSet.selections.filter(
            (s) => s.kind === Kind.FIELD,
          ).length;
        },
      },
      Field: {
        enter(node: FieldNode) {
          if (node.name.value.startsWith('__')) return;
          // Fields returning objects/lists (have sub-selections) cost 10x
          complexity += node.selectionSet ? 10 : 1;
        },
      },
      Document: {
        leave() {
          if (topLevelFields > maxTopLevelFields) {
            context.reportError(
              new GraphQLError(
                `Query has ${topLevelFields} top-level fields, exceeding the maximum of ${maxTopLevelFields}`,
              ),
            );
          }
          if (complexity > maxComplexity) {
            context.reportError(
              new GraphQLError(
                `Query complexity of ${complexity} exceeds the maximum allowed complexity of ${maxComplexity}`,
              ),
            );
          }
        },
      },
    };
  };
}
