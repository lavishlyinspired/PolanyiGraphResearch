import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, X, Database, Sparkles, ArrowRight, Brain, GitBranch, FileText } from "lucide-react";
import type { FiboNode, AlignmentLink } from "@/lib/data";

interface AlignmentSidebarProps {
  nodes: FiboNode[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  filter: "all" | "aligned" | "unaligned";
  onFilterChange: (f: "all" | "aligned" | "unaligned") => void;
  selectedNode: FiboNode | null;
  selectedLinks: AlignmentLink[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

const methodIcons: Record<string, React.ReactNode> = {
  "Lexical Match (TF-IDF + Levenshtein)": <FileText className="h-3.5 w-3.5 text-slate-400" />,
  "Graph Embedding (Node2Vec)": <Brain className="h-3.5 w-3.5 text-indigo-500" />,
  "Community Detection (Louvain)": <GitBranch className="h-3.5 w-3.5 text-emerald-600" />,
  "Taxonomic Reasoning (OWL Reasoner)": <Sparkles className="h-3.5 w-3.5 text-amber-500" />,
};

export function AlignmentSidebar({
  nodes,
  selectedNodeId,
  onSelectNode,
  filter,
  onFilterChange,
  selectedNode,
  selectedLinks,
  onApprove,
  onReject,
}: AlignmentSidebarProps) {
  const filteredNodes = nodes.filter((n) => {
    if (filter === "all") return true;
    if (filter === "aligned") return n.aligned;
    if (filter === "unaligned") return !n.aligned;
    return true;
  });

  return (
    <aside className="flex w-96 flex-col border-r border-slate-200 bg-white">
      <div className="flex flex-col border-b border-slate-200">
        <div className="px-4 pt-4 pb-2">
          <h2 className="font-serif text-lg font-bold text-slate-900">FIBO Concepts</h2>
          <p className="text-xs text-slate-500">Financial Industry Business Ontology</p>
        </div>
        <div className="flex gap-1 px-4 pb-3">
          {(["all", "aligned", "unaligned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors ${
                filter === f
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="max-h-64 overflow-y-auto px-2 pb-2">
          {filteredNodes.map((node) => (
            <button
              key={node.id}
              onClick={() => onSelectNode(node.id)}
              className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                selectedNodeId === node.id
                  ? "bg-emerald-50 ring-1 ring-emerald-200"
                  : "hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-900">{node.label}</span>
                <span className="text-xs text-slate-500">{node.iri}</span>
              </div>
              {node.aligned ? (
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                  Linked
                </Badge>
              ) : (
                <Badge variant="outline" className="text-slate-400">
                  Orphan
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {selectedNode ? (
          <div className="space-y-4">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="font-serif text-lg text-slate-900">
                  {selectedNode.label}
                </CardTitle>
                <p className="text-xs text-slate-500">{selectedNode.iri}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Definition
                  </span>
                  <p className="mt-1 text-sm text-slate-700">{selectedNode.definition}</p>
                </div>
                {selectedNode.properties && selectedNode.properties.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Properties
                      </span>
                      <div className="mt-2 space-y-1">
                        {selectedNode.properties.map((prop) => (
                          <div key={prop.name} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1">
                            <span className="text-xs font-mono text-slate-700">{prop.name}</span>
                            <span className="text-xs text-slate-400">{prop.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-slate-400" />
                  <span className="text-xs text-slate-500">Source: {selectedNode.source}</span>
                </div>
              </CardContent>
            </Card>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">Candidate Mappings</h3>
              </div>
              {selectedLinks.length === 0 ? (
                <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-400">
                  No mappings found for this concept.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedLinks.map((link) => {
                    const targetNode = nodes.find(
                      (n) => n.id === (link.sourceId === selectedNode.id ? link.targetId : link.sourceId)
                    );
                    if (!targetNode) return null;
                    return (
                      <Card
                        key={link.id}
                        className={`border-slate-200 shadow-sm transition-all ${
                          link.status === "approved"
                            ? "ring-1 ring-emerald-200"
                            : link.status === "rejected"
                            ? "opacity-60"
                            : ""
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">
                                {selectedNode.label}
                              </span>
                              <ArrowRight className="h-3 w-3 text-slate-400" />
                              <span className="text-sm font-medium text-slate-900">
                                {targetNode.label}
                              </span>
                            </div>
                            <Badge variant="outline" className="capitalize text-slate-500">
                              {link.relation}
                            </Badge>
                          </div>
                          
                          <div className="mt-3 rounded-md bg-slate-50 p-2">
                            <div className="flex items-start gap-2">
                              {methodIcons[link.method]}
                              <div>
                                <span className="text-xs font-semibold text-slate-600">
                                  {link.method}
                                </span>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {link.rationale}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <Badge
                              variant="secondary"
                              className={
                                link.confidence > 0.85
                                  ? "bg-emerald-100 text-emerald-700"
                                  : link.confidence > 0.6
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                              }
                            >
                              {Math.round(link.confidence * 100)}% confidence
                            </Badge>
                            
                            {link.status === "approved" && (
                              <Badge className="bg-emerald-600 text-white">Approved</Badge>
                            )}
                            {link.status === "rejected" && (
                              <Badge variant="outline" className="text-rose-500">
                                Rejected
                              </Badge>
                            )}
                          </div>

                          {link.status === "pending" && (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => onApprove(link.id)}
                                className="bg-emerald-600 hover:bg-emerald-700"
                              >
                                <Check className="mr-1 h-3 w-3" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onReject(link.id)}
                                className="border-slate-300 text-slate-700 hover:bg-slate-50"
                              >
                                <X className="mr-1 h-3 w-3" /> Reject
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Select a concept to view details.</p>
        )}
      </div>
    </aside>
  );
}