import React from "react";
import { AlignmentSidebar } from "@/components/AlignmentSidebar";
import { OntologyCanvas } from "@/components/OntologyCanvas";
import { AlignmentDashboard } from "@/components/AlignmentDashboard";
import { initialNodes, initialLinks, runAlignmentSimulation, AlignmentLink } from "@/lib/data";
import { CheckCheck, Search, SlidersHorizontal, Play, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export default function App() {
  const [nodes, setNodes] = React.useState(initialNodes);
  const [links, setLinks] = React.useState<AlignmentLink[]>(initialLinks);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "aligned" | "unaligned">("all");
  const [search, setSearch] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [threshold, setThreshold] = React.useState(50);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || null;
  const selectedLinks = links.filter(
    (l) => l.sourceId === selectedNodeId || l.targetId === selectedNodeId
  );

  const handleApprove = (id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: "approved" } : l))
    );
  };

  const handleReject = (id: string) => {
    setLinks((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: "rejected" } : l))
    );
  };

  const handleApproveAllPending = () => {
    setLinks((prev) =>
      prev.map((l) => (l.status === "pending" ? { ...l, status: "approved" } : l))
    );
  };

  const handleRunAlignment = () => {
    setIsRunning(true);
    // Simulate async GDS pipeline execution
    setTimeout(() => {
      const newLinks = runAlignmentSimulation(nodes);
      // Filter by confidence threshold
      const filteredLinks = newLinks.filter(l => l.confidence * 100 >= threshold);
      
      // Merge with existing, avoiding duplicates (keeping existing status)
      const existingIds = new Set(links.map(l => `${l.sourceId}-${l.targetId}`));
      const merged = [...links];
      filteredLinks.forEach(l => {
        if (!existingIds.has(`${l.sourceId}-${l.targetId}`)) {
          merged.push(l);
        }
      });
      
      setLinks(merged);

      // Mark nodes as aligned if they have approved/pending links
      setNodes(prevNodes => prevNodes.map(n => {
        const hasLink = merged.some(l => 
          (l.sourceId === n.id || l.targetId === n.id) && l.status !== "rejected"
        );
        return { ...n, aligned: hasLink };
      }));

      setIsRunning(false);
    }, 1500);
  };

  const filteredNodes = nodes.filter((n) =>
    n.label.toLowerCase().includes(search.toLowerCase()) ||
    n.iri.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md">
            <CheckCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold text-slate-900">
              FIBO Alignment Studio
            </h1>
            <p className="text-xs text-slate-500">
              Ontology matching for financial domain
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">Min Confidence:</span>
            <div className="w-32">
              <Slider 
                value={[threshold]} 
                onValueChange={(val) => setThreshold(val[0])} 
                max={100} 
                step={5}
              />
            </div>
            <span className="w-8 text-xs font-mono text-slate-900">{threshold}%</span>
          </div>
          <Button 
            onClick={handleRunAlignment}
            disabled={isRunning}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isRunning ? "Running GDS..." : "Run Alignment"}
          </Button>
          <Button 
            onClick={handleApproveAllPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            Approve All
          </Button>
        </div>
      </header>

      <div className="p-6">
        <AlignmentDashboard links={links} />
      </div>

      <div className="flex flex-1 overflow-hidden px-6 pb-6">
        <AlignmentSidebar
          nodes={filteredNodes}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          filter={filter}
          onFilterChange={setFilter}
          selectedNode={selectedNode}
          selectedLinks={selectedLinks}
          onApprove={handleApprove}
          onReject={handleReject}
        />
        <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-700">Alignment Graph</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Zoom:</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0">-</Button>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0">+</Button>
            </div>
          </div>
          <OntologyCanvas
            nodes={nodes}
            links={links}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>
      </div>
    </div>
  );
}