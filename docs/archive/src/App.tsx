import { useState } from "react";
import { DataSourcesView } from "@/components/DataSourcesView";
import { AlignmentWorkbench } from "@/components/AlignmentWorkbench";
import { ReasoningTraceView } from "@/components/ReasoningTraceView";
import { SemanticView, KnowledgeView, KnowledgeGraphView } from "@/components/SemanticViews";
import { Database, BookOpen, Network, GitBranch, Share2, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";

type TabId = "sources" | "semantic" | "knowledge" | "mapping" | "graph" | "reasoning";

const tabs: { id: TabId; label: string; icon: typeof Database }[] = [
  { id: "sources", label: "Data Sources", icon: Database },
  { id: "semantic", label: "Semantic", icon: BookOpen },
  { id: "knowledge", label: "Knowledge", icon: Network },
  { id: "mapping", label: "Mapping", icon: GitBranch },
  { id: "graph", label: "Knowledge Graph", icon: Share2 },
  { id: "reasoning", label: "Agent Workspace", icon: BrainCircuit },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("sources");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header band */}
      <header className="bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 text-white shadow-lg">
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center ring-1 ring-white/20">
              <BrainCircuit className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight leading-none">
                GraphOS <span className="text-emerald-300">Studio</span>
              </h1>
              <p className="text-xs text-teal-200 mt-0.5">
                Semantic operating system for enterprise data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-teal-100">Connected</span>
            </div>
            <div className="h-6 w-px bg-white/20" />
            <div className="text-sm">
              <span className="text-teal-200">Databricks:</span>{" "}
              <span className="font-medium">ABC Capital</span>
            </div>
            <div className="text-sm">
              <span className="text-teal-200">Catalog:</span>{" "}
              <span className="font-medium">Unity</span>
            </div>
          </div>
        </div>
        {/* Tab bar */}
        <nav className="px-8 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors rounded-t-md whitespace-nowrap",
                  active
                    ? "border-emerald-400 text-white bg-white/5"
                    : "border-transparent text-teal-200 hover:text-white hover:bg-white/5"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {activeTab === "sources" && <DataSourcesView />}
        {activeTab === "semantic" && <SemanticView />}
        {activeTab === "knowledge" && <KnowledgeView />}
        {activeTab === "mapping" && <AlignmentWorkbench />}
        {activeTab === "graph" && <KnowledgeGraphView />}
        {activeTab === "reasoning" && <ReasoningTraceView />}
      </main>
    </div>
  );
}