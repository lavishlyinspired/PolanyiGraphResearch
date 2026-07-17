import { useState, useEffect, useRef, useCallback } from "react";
import {
  getContext,
  searchOntology,
  reasonOntology,
  type ApiContext,
  type ApiGlossaryEntry,
  type ApiRelationship,
  type ApiBusinessRule,
  type ApiOntologyCandidate,
  type ApiReasoning,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  CircleDot,
  Database,
  Network,
  ShieldCheck,
  FileText,
  Code2,
  Layers,
  Move,
  ArrowRight,
  Link2,
  Table2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  ChevronRight,
  Loader2,
  BookMarked,
  GitBranch,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════
// Shared hook: fetch semantic context from API
// ═══════════════════════════════════════════════════

function useSemanticContext() {
  const [ctx, setCtx] = useState<ApiContext | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void getContext().then((c) => {
      setCtx(c);
      setLoading(false);
    });
  }, []);
  return { ctx, loading };
}

// ═══════════════════════════════════════════════════
// Semantic View — Glossary & Ontology (real data)
// ═══════════════════════════════════════════════════

function GlossarySidebar({
  entries,
  selectedIdx,
  onSelect,
}: {
  entries: ApiGlossaryEntry[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = entries.filter(
    (e) =>
      !filter ||
      e.term.toLowerCase().includes(filter.toLowerCase()) ||
      e.definition.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold text-teal-700">
        <BookMarked className="w-4 h-4" />
        Enterprise Glossary ({entries.length})
      </div>
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter terms..."
        className="h-8 text-xs"
      />
      <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
        {filtered.map((entry) => {
          const realIdx = entries.indexOf(entry);
          return (
            <button
              key={entry.term}
              onClick={() => onSelect(realIdx)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left",
                selectedIdx === realIdx
                  ? "bg-teal-50 text-teal-800 font-medium ring-1 ring-teal-200"
                  : "hover:bg-slate-50 text-slate-600"
              )}
            >
              <CircleDot className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{entry.term}</span>
              {entry.ontology_class && (
                <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] px-1.5 py-0">
                  FIBO
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GlossaryDetail({ entry }: { entry: ApiGlossaryEntry }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="font-serif text-2xl font-bold text-slate-900">
            {entry.term}
          </h3>
          {entry.ontology_class && (
            <code className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
              fibo:{entry.ontology_class}
            </code>
          )}
        </div>
        <p className="text-slate-600 leading-relaxed">{entry.definition}</p>
      </div>

      {entry.ontology_uri && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-50 border border-slate-100">
          <Network className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-sm font-medium text-slate-500">Ontology URI:</span>
          <code className="text-xs text-teal-700 font-mono truncate">{entry.ontology_uri}</code>
        </div>
      )}

      {entry.formula && (
        <div className="p-3 rounded-lg bg-violet-50 border border-violet-100">
          <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">Formula</span>
          <pre className="text-sm font-mono text-violet-800 mt-1 whitespace-pre-wrap">{entry.formula}</pre>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {entry.source_tables.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-600" />
              Source Tables
            </h4>
            <div className="space-y-1">
              {entry.source_tables.map((t) => (
                <div key={t} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <Table2 className="w-3.5 h-3.5 text-slate-400" />
                  <code className="text-sm font-mono text-slate-700">{t}</code>
                </div>
              ))}
            </div>
          </div>
        )}
        {entry.source_columns.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              Source Columns
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {entry.source_columns.map((c) => (
                <code key={c} className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  {c}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {(entry.unit || entry.synonyms.length > 0) && (
        <div className="flex flex-wrap gap-3">
          {entry.unit && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Unit:</span>
              <Badge variant="outline" className="text-xs">{entry.unit}</Badge>
            </div>
          )}
          {entry.synonyms.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500">Synonyms:</span>
              {entry.synonyms.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RelationshipsList({ relationships }: { relationships: ApiRelationship[] }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
        <Link2 className="w-4 h-4 text-emerald-600" />
        Entity Relationships ({relationships.length})
      </h4>
      {relationships.length === 0 && (
        <p className="text-sm text-slate-400 italic">No relationships defined in context.</p>
      )}
      <div className="space-y-2">
        {relationships.map((rel, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-teal-200 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-sm font-mono font-semibold text-teal-700">
                  {rel.from_entity}
                </code>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300" />
                <code className="text-sm font-mono font-semibold text-teal-700">
                  {rel.to_entity}
                </code>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-200">
                  {rel.relationship_type}
                </Badge>
                <code className="text-[10px] text-slate-400 font-mono">
                  via {rel.foreign_key}
                </code>
              </div>
              {rel.description && (
                <p className="text-xs text-slate-500 mt-1">{rel.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessRulesList({ rules }: { rules: ApiBusinessRule[] }) {
  const severityStyle: Record<string, string> = {
    CRITICAL: "bg-rose-100 text-rose-700 border-rose-200",
    WARNING: "bg-amber-100 text-amber-700 border-amber-200",
    INFO: "bg-slate-100 text-slate-600 border-slate-200",
  };
  const severityIcon: Record<string, typeof ShieldCheck> = {
    CRITICAL: AlertTriangle,
    WARNING: ShieldCheck,
    INFO: CheckCircle2,
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
        <Scale className="w-4 h-4 text-amber-600" />
        Business Rules ({rules.length})
      </h4>
      {rules.length === 0 && (
        <p className="text-sm text-slate-400 italic">No business rules defined.</p>
      )}
      <div className="space-y-2">
        {rules.map((rule) => {
          const Icon = severityIcon[rule.severity] ?? CheckCircle2;
          return (
            <div
              key={rule.rule_id}
              className="p-3 rounded-lg bg-white border border-slate-200 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Badge className={cn("text-[10px] border", severityStyle[rule.severity] ?? severityStyle.INFO)}>
                  <Icon className="w-3 h-3 mr-1" />
                  {rule.severity}
                </Badge>
                <span className="text-sm font-semibold text-slate-800">{rule.name}</span>
                <code className="text-[10px] text-slate-400 font-mono ml-auto">{rule.rule_id}</code>
              </div>
              <p className="text-sm text-slate-600">{rule.description}</p>
              {rule.affected_entities.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {rule.affected_entities.map((e) => (
                    <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>
                  ))}
                </div>
              )}
              {rule.sql_hints.length > 0 && (
                <div className="space-y-1">
                  {rule.sql_hints.map((hint, i) => (
                    <pre key={i} className="text-xs font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                      {hint}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SemanticView() {
  const { ctx, loading } = useSemanticContext();
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-3 text-slate-500">Loading semantic context...</span>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No semantic context found</h3>
            <p className="text-slate-500 mb-4">
              Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">graphos generate</code> to create
              a semantic context from your database.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entry = ctx.glossary[selectedIdx];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Glossary &amp; Ontology
        </h2>
        <p className="text-slate-500">
          Enterprise glossary grounded in {ctx.domain} — {ctx.glossary.length} terms, {" "}
          {ctx.relationships.length} relationships, {ctx.business_rules.length} business rules
          {ctx.generated_by === "llm" && " (LLM-enhanced)"}.
        </p>
      </div>

      <Tabs defaultValue="glossary">
        <TabsList className="mb-4">
          <TabsTrigger value="glossary">Glossary</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="rules">Business Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="glossary">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div>
              <Card className="border-slate-200 shadow-sm sticky top-0">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                    Glossary Terms
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <GlossarySidebar
                    entries={ctx.glossary}
                    selectedIdx={selectedIdx}
                    onSelect={setSelectedIdx}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="lg:col-span-2">
              <Card className="border-slate-200 shadow-sm">
                <CardContent className="p-6">
                  {entry && <GlossaryDetail entry={entry} />}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="relationships">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <RelationshipsList relationships={ctx.relationships} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <BusinessRulesList rules={ctx.business_rules} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Knowledge View — Entity Relationship Graph (real data)
// ═══════════════════════════════════════════════════

function EntityRelationshipGraph({ ctx }: { ctx: ApiContext }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const entities = ctx.key_entities;
  const cx = 400;
  const cy = 260;
  const radius = Math.min(200, 50 + entities.length * 20);

  const positions: Record<string, { x: number; y: number }> = {};
  entities.forEach((name, i) => {
    const angle = (2 * Math.PI * i) / entities.length - Math.PI / 2;
    positions[name] = {
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
    };
  });

  const entityGlossary: Record<string, ApiGlossaryEntry[]> = {};
  ctx.glossary.forEach((g) => {
    g.source_tables.forEach((t) => {
      if (!entityGlossary[t]) entityGlossary[t] = [];
      entityGlossary[t].push(g);
    });
  });

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string | null) => {
      e.stopPropagation();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (nodeId) {
        setSelectedEntity(nodeId);
      } else {
        setIsPanning(true);
        dragStart.current = { x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y };
      }
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart.current || !isPanning) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setPan({ x: x - dragStart.current.x, y: y - dragStart.current.y });
    },
    [isPanning]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    dragStart.current = null;
  }, []);

  const selectedGlossary = selectedEntity ? entityGlossary[selectedEntity] ?? [] : [];
  const selectedRels = selectedEntity
    ? ctx.relationships.filter(
        (r) => r.from_entity === selectedEntity || r.to_entity === selectedEntity
      )
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:h-[640px]">
      <div className="lg:col-span-3 h-[420px] lg:h-auto">
        <div className="relative w-full h-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur shadow-sm border border-slate-200">
            <Move className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500">Drag background to pan · Click entity</span>
          </div>
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => handleMouseDown(e, null)}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <defs>
              <pattern id="kg-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="10" cy="10" r="1" fill="rgb(203 213 225)" opacity="0.4" />
              </pattern>
              <marker id="kg-arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(148 163 184)" />
              </marker>
            </defs>
            <rect width="100%" height="100%" fill="url(#kg-grid)" />
            <g transform={`translate(${pan.x}, ${pan.y})`}>
              {ctx.relationships.map((rel, idx) => {
                const from = positions[rel.from_entity];
                const to = positions[rel.to_entity];
                if (!from || !to) return null;
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2;
                const lw = rel.relationship_type.length * 6 + 16;
                return (
                  <g key={idx}>
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgb(148 163 184)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#kg-arrow)" />
                    <rect x={midX - lw / 2} y={midY - 9} width={lw} height="18" rx="9" fill="white" stroke="rgb(226 232 240)" strokeWidth="1" />
                    <text x={midX} y={midY + 4} textAnchor="middle" className="fill-slate-500 font-mono" style={{ fontSize: "10px" }}>
                      {rel.relationship_type}
                    </text>
                  </g>
                );
              })}
              {entities.map((name) => {
                const pos = positions[name];
                if (!pos) return null;
                const isSelected = selectedEntity === name;
                const aligned = entityGlossary[name]?.find((g) => g.ontology_class);
                return (
                  <g key={name} transform={`translate(${pos.x}, ${pos.y})`} onMouseDown={(e) => handleMouseDown(e, name)} style={{ cursor: "pointer" }}>
                    {isSelected && <circle r="42" fill="none" stroke="rgb(20 184 166)" strokeWidth="2" strokeDasharray="3 3" opacity="0.5" />}
                    <circle r="32" fill="white" stroke={isSelected ? "rgb(20 184 166)" : aligned ? "rgb(16 185 129)" : "rgb(148 163 184)"} strokeWidth={isSelected ? "2.5" : "1.5"} />
                    <text y="-2" textAnchor="middle" className="font-semibold" fill="rgb(15 23 42)" style={{ fontSize: "11px" }}>
                      {name}
                    </text>
                    <text y="10" textAnchor="middle" fill="rgb(100 116 139)" style={{ fontSize: "8px" }}>
                      {aligned ? `fibo:${aligned.ontology_class}` : "entity"}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>

      <div className="lg:col-span-2 overflow-y-auto">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 space-y-5">
            {selectedEntity ? (
              <>
                <div>
                  <h3 className="font-serif text-xl font-bold text-slate-900 mb-1">{selectedEntity}</h3>
                  {selectedGlossary.length > 0 && (
                    <p className="text-sm text-slate-600">{selectedGlossary[0].definition}</p>
                  )}
                </div>

                {selectedRels.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Relationships</h4>
                    <div className="space-y-1.5">
                      {selectedRels.map((r, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-sm">
                          <code className="text-teal-700 font-mono font-medium">{r.from_entity}</code>
                          <ArrowRight className="w-3 h-3 text-slate-300" />
                          <code className="text-teal-700 font-mono font-medium">{r.to_entity}</code>
                          <Badge variant="outline" className="text-[10px] ml-auto">{r.relationship_type}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedGlossary.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">Mapped Terms</h4>
                    <div className="space-y-1.5">
                      {selectedGlossary.map((g) => (
                        <div key={g.term} className="p-2 rounded-lg bg-white border border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{g.term}</span>
                            {g.ontology_class && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">fibo:{g.ontology_class}</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">Click an entity in the graph</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function KnowledgeView() {
  const { ctx, loading } = useSemanticContext();

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-3 text-slate-500">Loading knowledge graph...</span>
      </div>
    );
  }

  if (!ctx || ctx.key_entities.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-12 text-center">
            <Network className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No entities found</h3>
            <p className="text-slate-500">
              Run <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">graphos generate</code> to create
              a semantic context with key entities.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Knowledge Graph
        </h2>
        <p className="text-slate-500">
          {ctx.key_entities.length} entities from {ctx.domain} — relationships and glossary mappings
          derived from your semantic context.
        </p>
      </div>
      <EntityRelationshipGraph ctx={ctx} />
    </div>
  );
}

// ═══════════════════════════════════════════════════
// Knowledge Graph View — Interactive Visual Canvas
// ═══════════════════════════════════════════════════

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function humanize(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function liveGraphFromContext(ctx: ApiContext) {
  const entityNames = Array.from(
    new Set([
      ...ctx.key_entities,
      ...ctx.relationships.flatMap((r) => [r.from_entity, r.to_entity]),
      ...ctx.glossary.flatMap((g) => g.source_tables),
    ])
  );
  const cx = 400;
  const cy = 280;
  const radius = Math.min(210, 60 + entityNames.length * 18);

  const nodes = entityNames.map((name, index) => {
    const angle = (2 * Math.PI * index) / entityNames.length - Math.PI / 2;
    const terms = ctx.glossary.filter((g) => g.source_tables.includes(name));
    const aligned = terms.find((g) => g.ontology_class);
    return {
      id: name,
      label: humanize(name),
      fiboClass: aligned ? `fibo:${aligned.ontology_class}` : "unaligned",
      x: Math.round(cx + radius * Math.cos(angle)),
      y: Math.round(cy + radius * Math.sin(angle)),
      type: "concept" as const,
      confidence: aligned ? 97 : 85,
      tables: [name],
      sampleData: [],
      sparql:
        `PREFIX gos: <https://graphos.dev/ontology#>\n` +
        `SELECT ?p ?o WHERE {\n  <https://graphos.dev/entity/${slugify(name)}> ?p ?o .\n}`,
      cypher: `MATCH (e:Entity {name: '${name}'})-[r:RELATES_TO]-(other)\nRETURN e, r, other`,
      definition:
        terms[0]?.definition ??
        ctx.relationships.find((r) => r.from_entity === name || r.to_entity === name)?.description ??
        `Business entity backed by the ${name} table.`,
    };
  });

  const edges = ctx.relationships.map((r) => ({
    from: r.from_entity,
    to: r.to_entity,
    label: r.foreign_key,
  }));
  return { nodes, edges };
}

const nodeColors: Record<string, { fill: string; stroke: string; chip: string }> = {
  concept: { fill: "bg-teal-50", stroke: "border-teal-400", chip: "bg-teal-600 text-white" },
  entity: { fill: "bg-emerald-50", stroke: "border-emerald-400", chip: "bg-emerald-600 text-white" },
  data: { fill: "bg-slate-50", stroke: "border-slate-300", chip: "bg-slate-500 text-white" },
};

function GraphCanvas({
  nodes,
  edges,
  selectedId,
  onSelect,
}: {
  nodes: { id: string; label: string; x: number; y: number; type: string; confidence: number }[];
  edges: { from: string; to: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }]))
  );
  const nodeKey = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    setPositions(Object.fromEntries(nodes.map((n) => [n.id, { x: n.x, y: n.y }])));
  }, [nodeKey]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string | null) => {
      e.stopPropagation();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (nodeId) {
        setDragging(nodeId);
        onSelect(nodeId);
        const pos = positions[nodeId];
        dragStart.current = {
          x: e.clientX - rect.left - pan.x - (pos?.x ?? 0),
          y: e.clientY - rect.top - pan.y - (pos?.y ?? 0),
        };
      } else {
        setIsPanning(true);
        dragStart.current = { x: e.clientX - rect.left - pan.x, y: e.clientY - rect.top - pan.y };
      }
    },
    [pan, positions, onSelect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragStart.current) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const start = dragStart.current;
      if (dragging) {
        setPositions((prev) => ({
          ...prev,
          [dragging]: { x: x - pan.x - start.x, y: y - pan.y - start.y },
        }));
      } else if (isPanning) {
        setPan({ x: x - start.x, y: y - start.y });
      }
    },
    [dragging, isPanning, pan]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setIsPanning(false);
    dragStart.current = null;
  }, []);

  return (
    <div className="relative w-full h-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => handleMouseDown(e, null)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="10" cy="10" r="1" fill="rgb(203 213 225)" opacity="0.4" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(148 163 184)" />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${pan.x}, ${pan.y})`}>
          {edges.map((edge, idx) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;
            const labelWidth = edge.label.length * 6 + 16;
            return (
              <g key={idx}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="rgb(148 163 184)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrow)" />
                <rect x={midX - labelWidth / 2} y={midY - 9} width={labelWidth} height="18" rx="9" fill="white" stroke="rgb(226 232 240)" strokeWidth="1" />
                <text x={midX} y={midY + 4} textAnchor="middle" className="fill-slate-500 font-mono" style={{ fontSize: "10px" }}>
                  {edge.label}
                </text>
              </g>
            );
          })}
          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const colors = nodeColors[node.type] ?? nodeColors.concept;
            const isSelected = selectedId === node.id;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`} onMouseDown={(e) => handleMouseDown(e, node.id)} style={{ cursor: "grab" }}>
                {isSelected && <circle r="42" fill="none" stroke="rgb(20 184 166)" strokeWidth="2" strokeDasharray="3 3" opacity="0.5" />}
                <circle r="32" fill="white" stroke={isSelected ? "rgb(20 184 166)" : "rgb(148 163 184)"} strokeWidth={isSelected ? "2.5" : "1.5"} />
                <text y="-2" textAnchor="middle" className="font-semibold" fill="rgb(15 23 42)" style={{ fontSize: "11px" }}>
                  {node.label}
                </text>
                <text y="10" textAnchor="middle" fill="rgb(100 116 139)" style={{ fontSize: "8px" }}>
                  {node.confidence}%
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function NodeDetailPanel({ node }: { node: { id: string; label: string; fiboClass: string; definition: string; tables: string[]; sparql: string; cypher: string } }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <h3 className="font-serif text-2xl font-bold text-slate-900">{node.label}</h3>
          <code className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
            {node.fiboClass}
          </code>
        </div>
        <p className="text-slate-600 leading-relaxed">{node.definition}</p>
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          Source Tables
        </h4>
        <div className="flex flex-wrap gap-2">
          {node.tables.map((t) => (
            <code key={t} className="text-xs font-mono text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">{t}</code>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-violet-600" />
            SPARQL
          </h4>
          <pre className="text-xs font-mono text-slate-600 bg-violet-50 p-3 rounded-lg border border-violet-100 overflow-x-auto whitespace-pre-wrap">{node.sparql}</pre>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <Network className="w-4 h-4 text-teal-600" />
            Cypher
          </h4>
          <pre className="text-xs font-mono text-slate-600 bg-teal-50 p-3 rounded-lg border border-teal-100 overflow-x-auto whitespace-pre-wrap">{node.cypher}</pre>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeGraphView() {
  const { ctx, loading } = useSemanticContext();
  const [selectedId, setSelectedId] = useState("");

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center h-96">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        <span className="ml-3 text-slate-500">Loading graph...</span>
      </div>
    );
  }

  const graph = ctx ? liveGraphFromContext(ctx) : { nodes: [], edges: [] };
  const nodes = graph.nodes;
  const edges = graph.edges;

  useEffect(() => {
    if (nodes.length > 0 && !selectedId) setSelectedId(nodes[0].id);
  }, [nodes, selectedId]);

  const selected = nodes.find((n) => n.id === selectedId) ?? nodes[0];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">Knowledge Graph</h2>
        <p className="text-slate-500">
          {ctx
            ? "The live enterprise knowledge graph from your semantic context — click any node for its ontology class, source table, and query definitions."
            : "No semantic context available. Run `graphos generate` first."}
        </p>
      </div>
      {nodes.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-12 text-center">
            <Network className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700">No entities to visualize</h3>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:h-[640px]">
          <div className="lg:col-span-3 h-[420px] lg:h-auto">
            <GraphCanvas nodes={nodes} edges={edges} selectedId={selected.id} onSelect={setSelectedId} />
          </div>
          <div className="lg:col-span-2 overflow-y-auto">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <NodeDetailPanel node={selected} />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
