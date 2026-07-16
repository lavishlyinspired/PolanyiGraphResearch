import { useEffect, useRef, useState } from "react";
import { sampleQueries as fallbackQueries, type ReasoningStep } from "@/data/mockData";
import { ask, AskError, getContext, type ApiAskStep } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BrainCircuit,
  ArrowDown,
  Send,
  FileText,
  Database,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  User,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

const stepIcons: Record<ReasoningStep["type"], typeof BrainCircuit> = {
  planner: BrainCircuit,
  sql: FileText,
  execution: Database,
  alignment: GitBranch,
  validation: ShieldCheck,
  answer: CheckCircle2,
};

const stepColors: Record<ReasoningStep["type"], string> = {
  planner: "bg-violet-100 text-violet-700 border-violet-200",
  sql: "bg-blue-100 text-blue-700 border-blue-200",
  execution: "bg-teal-100 text-teal-700 border-teal-200",
  alignment: "bg-emerald-100 text-emerald-700 border-emerald-200",
  validation: "bg-amber-100 text-amber-700 border-amber-200",
  answer: "bg-teal-600 text-white border-teal-600",
};

type ChatMessage = {
  id: string;
  role: "user" | "agent";
  content: string;
  steps?: ReasoningStep[];
};

const stepLabels: Record<string, string> = {
  sql_db_list_tables: "Discover Tables",
  sql_db_schema: "Inspect Schema",
  sql_db_query: "SQL Query",
};

function toReasoningStep(step: ApiAskStep, index: number): ReasoningStep {
  if (step.kind === "validation") {
    return {
      id: `s-${index}`,
      label: step.name === "blocked" ? "Rule Guard — BLOCKED" : "Rule Guard — passed",
      detail: step.detail,
      type: "validation",
    };
  }
  if (step.kind === "answer") {
    return { id: `s-${index}`, label: "Answer", detail: step.detail, type: "answer" };
  }
  if (step.kind === "tool_call") {
    return {
      id: `s-${index}`,
      label: stepLabels[step.name] ?? step.name,
      detail: step.detail,
      type: step.name === "sql_db_query" ? "sql" : "planner",
    };
  }
  return {
    id: `s-${index}`,
    label: `${stepLabels[step.name] ?? step.name} result`,
    detail: step.detail,
    type: "execution",
  };
}

export function ReasoningTraceView() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(fallbackQueries);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  useEffect(() => {
    void getContext().then((ctx) => {
      if (ctx && ctx.common_queries.length > 0) {
        setSuggestions(ctx.common_queries.slice(0, 4));
      }
    });
  }, []);

  const runQuery = async (q: string) => {
    if (!q.trim() || busy) return;
    setQuery("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: "user", content: q },
      { id: `a-${Date.now()}`, role: "agent", content: "Thinking…" },
    ]);
    try {
      const result = await ask(q);
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          id: `a-${Date.now()}`,
          role: "agent",
          content: result.answer,
          steps: result.steps.map(toReasoningStep),
        },
      ]);
    } catch (error) {
      const message =
        error instanceof AskError
          ? error.message
          : "Something went wrong talking to the agent.";
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { id: `a-${Date.now()}`, role: "agent", content: message },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="font-serif text-3xl font-bold text-slate-900 mb-1">
          Agent Workspace
        </h2>
        <p className="text-slate-500">
          Ask questions in natural language. The agent shows every reasoning step —
          from planner to SQL to semantic alignment to final answer.
        </p>
      </div>

      {/* Chat area */}
      <Card className="border-slate-200 shadow-md mb-4">
        <CardContent className="p-6 space-y-6 min-h-[300px]">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <BrainCircuit className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-400 mb-1">No queries yet</p>
              <p className="text-sm text-slate-400">
                Ask a question below to see the full reasoning trace
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-3">
              {/* Avatar */}
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                  msg.role === "user"
                    ? "bg-slate-200 text-slate-600"
                    : "bg-teal-600 text-white"
                )}
              >
                {msg.role === "user" ? (
                  <User className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 space-y-3">
                <div
                  className={cn(
                    "inline-block px-4 py-2.5 rounded-2xl text-sm",
                    msg.role === "user"
                      ? "bg-slate-100 text-slate-800 rounded-tl-sm"
                      : "bg-teal-50 text-teal-900 border border-teal-100 rounded-tl-sm"
                  )}
                >
                  {msg.content}
                </div>

                {/* Reasoning steps */}
                {msg.steps && (
                  <div className="space-y-0 pt-2">
                    {msg.steps.map((step, idx) => {
                      const Icon = stepIcons[step.type];
                      const color = stepColors[step.type];
                      const isLast = idx === msg.steps!.length - 1;
                      return (
                        <div key={step.id}>
                          <div
                            className={cn(
                              "flex gap-3 p-3 rounded-xl border transition-all",
                              isLast
                                ? "bg-teal-50/50 border-teal-200"
                                : "bg-white border-slate-200 shadow-sm"
                            )}
                          >
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
                                color
                              )}
                            >
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-mono text-slate-400">
                                  Step {idx + 1}
                                </span>
                                <span className="text-sm font-semibold text-slate-800">
                                  {step.label}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 leading-relaxed">
                                {step.detail}
                              </p>
                            </div>
                          </div>
                          {!isLast && (
                            <div className="flex justify-center py-1">
                              <ArrowDown className="w-3.5 h-3.5 text-slate-300" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </CardContent>
      </Card>

      {/* Query input */}
      <Card className="border-slate-200 shadow-md">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runQuery(query)}
              placeholder="Ask a question about your enterprise data..."
              className="flex-1 border-0 shadow-none focus-visible:ring-0 text-base"
            />
            <Button
              onClick={() => void runQuery(query)}
              disabled={busy}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Send className="w-4 h-4 mr-1" />
              {busy ? "Running…" : "Run"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs text-slate-400 self-center mr-1">Try:</span>
            {suggestions.map((sq) => (
              <button
                key={sq}
                onClick={() => void runQuery(sq)}
                className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700 transition-colors"
              >
                {sq}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}