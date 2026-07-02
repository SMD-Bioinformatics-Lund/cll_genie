export type RuleValue = string | number | boolean | string[] | null;

export type VisualCondition = {
  id: string;
  fact: string;
  op: string;
  value: RuleValue;
};

export function parseAstToVisual(ast: unknown): VisualCondition[] {
  if (typeof ast !== "object" || ast === null || Object.keys(ast).length === 0) return [];

  const parseNode = (node: unknown): VisualCondition[] => {
    if (typeof node !== "object" || node === null) return [];
    const value = node as Record<string, unknown>;
    if (Array.isArray(value.all)) return value.all.flatMap(parseNode);
    if (typeof value.fact !== "string" || typeof value.op !== "string") return [];
    return [
      {
        id: Math.random().toString(36).slice(2, 11),
        fact: value.fact,
        op: value.op,
        value: (value.value as RuleValue) ?? null,
      },
    ];
  };

  return parseNode(ast);
}

export function buildAstFromVisual(conditions: VisualCondition[]) {
  if (conditions.length === 0) return {};
  if (conditions.length === 1) {
    const condition = conditions[0];
    return { fact: condition.fact, op: condition.op, value: condition.value };
  }
  return {
    all: conditions.map((condition) => ({
      fact: condition.fact,
      op: condition.op,
      value: condition.value,
    })),
  };
}
