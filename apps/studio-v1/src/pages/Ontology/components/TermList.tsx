import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AlignmentReviewItem } from "@/api/ontology";

type Filter = "all" | "aligned" | "unaligned";

type TermListProps = {
  items: AlignmentReviewItem[];
  selectedTerm: string | null;
  onSelect: (term: string) => void;
};

const bandBadgeVariant = {
  auto: "success",
  review: "warning",
  rejected: "danger",
  unmapped: "outline",
} as const;

export function TermList({ items, selectedTerm, onSelect }: TermListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = items
    .filter((item) => item.term.toLowerCase().includes(search.toLowerCase()))
    .filter((item) => {
      if (filter === "all") return true;
      if (filter === "aligned") return item.band === "auto";
      return item.band !== "auto";
    });

  return (
    <div className="flex w-72 flex-col border-r border-slate-200">
      <div className="flex flex-col gap-2 p-3">
        <label className="sr-only" htmlFor="term-search">
          Search terms
        </label>
        <Input
          id="term-search"
          type="search"
          role="searchbox"
          aria-label="Search terms"
          placeholder="Search terms…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1">
          {(["all", "aligned", "unaligned"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>
      <ul aria-label="Glossary terms" className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.map((item) => (
          <li key={item.term} className="mb-1">
            <button
              type="button"
              onClick={() => onSelect(item.term)}
              aria-current={selectedTerm === item.term ? "true" : undefined}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                selectedTerm === item.term ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-slate-50"
              }`}
            >
              <span className="text-slate-900">{item.term}</span>
              <Badge variant={bandBadgeVariant[item.band]}>{item.band}</Badge>
            </button>
          </li>
        ))}
        {filtered.length === 0 && <p className="p-3 text-sm text-slate-400">No terms match.</p>}
      </ul>
    </div>
  );
}
