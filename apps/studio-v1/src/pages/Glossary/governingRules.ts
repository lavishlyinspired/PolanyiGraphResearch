import type { GlossaryEntry, Rule } from "@/api/context";

/** Rules that govern a term: any rule whose affected_entities intersects
 * the term's source_tables. Real, derived data — not a fabricated link. */
export function governingRules(term: GlossaryEntry, rules: readonly Rule[]): Rule[] {
  const sourceTables = new Set(term.source_tables);
  return rules.filter((rule) => rule.affected_entities.some((entity) => sourceTables.has(entity)));
}
