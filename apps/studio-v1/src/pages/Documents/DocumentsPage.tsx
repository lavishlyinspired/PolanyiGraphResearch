import { useState } from "react";
import { ingestDocument, ShaclValidationError, type IngestDocumentResult } from "@/api/documents";
import { highlightMentions } from "./highlightMentions";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: IngestDocumentResult; text: string }
  | { kind: "shacl-blocked"; detail: string }
  | { kind: "error" };

const extractorLabel: Record<string, string> = {
  LLMExtractor: "LLM",
  HeuristicExtractor: "Heuristic fallback",
  GLiNERExtractor: "GLiNER",
};

function PipelineStrip({ state }: { state: State }) {
  const stages = ["Parse", "Extract", "Resolve", "SHACL", "Publish"] as const;
  const stageStatus = (stage: (typeof stages)[number]): "done" | "blocked" | "pending" | "skipped" => {
    if (state.kind === "ready") {
      if (stage === "Publish") return state.result.published_uri !== null ? "done" : "skipped";
      return "done";
    }
    if (state.kind === "shacl-blocked") {
      if (stage === "SHACL") return "blocked";
      if (stage === "Publish") return "pending";
      return "done";
    }
    return "pending";
  };
  const statusText: Record<ReturnType<typeof stageStatus>, string> = {
    done: "✓",
    blocked: "✕ blocked",
    pending: "…",
    skipped: "skipped",
  };
  return (
    <div className="tabs" role="list" aria-label="Ingestion pipeline">
      {stages.map((stage) => (
        <span key={stage} role="listitem" style={{ marginRight: 12 }}>
          {stage}: {statusText[stageStatus(stage)]}
        </span>
      ))}
    </div>
  );
}

export function DocumentsPage() {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  function handleIngest() {
    setState({ kind: "loading" });
    const submittedText = text;
    void ingestDocument(text, title)
      .then((result) => setState({ kind: "ready", result, text: submittedText }))
      .catch((error) => {
        if (error instanceof ShaclValidationError) {
          setState({ kind: "shacl-blocked", detail: error.message });
        } else {
          setState({ kind: "error" });
        }
      });
  }

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Documents</h1>
          <p className="sub">
            Ingest unstructured text — extraction, glossary resolution, and SHACL validation run
            against the real semantic context.
          </p>
        </div>
      </div>

      <section className="panel" style={{ padding: 16, marginBottom: 18 }}>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="doc-title">Title</label>
          <br />
          <input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Q1 Risk Memo"
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label htmlFor="doc-text">Document text</label>
          <br />
          <textarea
            id="doc-text"
            rows={6}
            style={{ width: "100%" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={text.trim() === "" || state.kind === "loading"}
          onClick={handleIngest}
        >
          {state.kind === "loading" ? "Ingesting…" : "Ingest document"}
        </button>
      </section>

      {state.kind === "shacl-blocked" && (
        <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
          <PipelineStrip state={state} />
          <p style={{ marginTop: 10 }}>SHACL validation blocked this document from publishing:</p>
          <p className="dim">{state.detail}</p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
          <p style={{ margin: 0 }}>Couldn&apos;t ingest the document. Check the server and try again.</p>
        </div>
      )}

      {state.kind === "ready" && (
        <div className="panel" style={{ padding: 16 }}>
          <PipelineStrip state={state} />
          <p style={{ marginTop: 10 }}>
            <span className="chip">{extractorLabel[state.result.extractor] ?? state.result.extractor}</span>{" "}
            <b>{state.result.mentions.length} mentions</b> ·{" "}
            <b>{state.result.mentions.filter((m) => m.resolved_term !== null).length} resolved</b> ·{" "}
            {state.result.triples} triples
          </p>
          <p style={{ lineHeight: 1.8, marginTop: 14 }}>
            {highlightMentions(state.text, state.result.mentions).map((segment, index) =>
              segment.kind === "plain" ? (
                <span key={index}>{segment.text}</span>
              ) : (
                <mark
                  key={index}
                  data-mention-kind={segment.kind}
                  className={segment.kind === "resolved" ? "chip chip-moss" : "chip chip-warn"}
                >
                  {segment.text}
                </mark>
              ),
            )}
          </p>
          <p className="dim" style={{ marginTop: 14 }}>
            {state.result.published_uri !== null ? (
              <>Published as {state.result.published_uri}</>
            ) : (
              <>Not published — GraphDB isn&apos;t configured, so this result wasn&apos;t persisted.</>
            )}
          </p>
        </div>
      )}
    </main>
  );
}
