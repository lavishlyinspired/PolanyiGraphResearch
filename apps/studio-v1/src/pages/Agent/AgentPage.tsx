import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AgentUnavailableError,
  askStream,
  fetchSessionMessages,
  fetchSessions,
  type AgentStep,
  type SessionMessage,
  type SessionSummary,
} from "@/api/agent";
import {
  clearProviderOverride,
  loadProviderOverride,
  saveProviderOverride,
  type ProviderOverride,
} from "@/lib/providerSettings";
import { fetchProviderModels, PROVIDER_BASE_URLS, type ProviderId, type ProviderModel } from "@/api/providers";

type AskState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unavailable"; detail: string }
  | { kind: "error" };

function newSessionId(): string {
  return crypto.randomUUID();
}

function StepRow({ step }: { step: AgentStep }) {
  const status = step.kind === "validation" ? step.name : undefined;
  return (
    <li
      role="listitem"
      data-step-status={status}
      className={status === "blocked" ? "dim" : undefined}
      style={{ marginBottom: 6 }}
    >
      <b>{step.kind}</b>
      {step.name ? ` · ${step.name}` : ""}
      {step.detail ? <div className="dim">{step.detail}</div> : null}
    </li>
  );
}

export function AgentPage() {
  const [sessionId, setSessionId] = useState<string>(newSessionId);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<AskState>({ kind: "idle" });
  const [latestSteps, setLatestSteps] = useState<AgentStep[]>([]);
  const [streamingSteps, setStreamingSteps] = useState<AgentStep[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [override, setOverride] = useState<ProviderOverride | null>(() => loadProviderOverride());
  const [showProviderPanel, setShowProviderPanel] = useState(false);
  const [draftProvider, setDraftProvider] = useState<ProviderId>("nvidia");
  const [draftModel, setDraftModel] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [availableModels, setAvailableModels] = useState<ProviderModel[]>([]);

  useEffect(() => {
    if (!showProviderPanel) return;
    void fetchProviderModels(draftProvider, draftApiKey || undefined)
      .then(setAvailableModels)
      .catch(() => setAvailableModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProviderPanel, draftProvider]);

  useEffect(() => {
    void fetchSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [messages]);

  function handleResume(summary: SessionSummary) {
    setSessionId(summary.session_id);
    setLatestSteps([]);
    setState({ kind: "idle" });
    void fetchSessionMessages(summary.session_id)
      .then(setMessages)
      .catch(() => setMessages([]));
  }

  function handleNewSession() {
    setSessionId(newSessionId());
    setMessages([]);
    setLatestSteps([]);
    setState({ kind: "idle" });
  }

  function handleSaveOverride() {
    const saved: ProviderOverride = {
      model: draftModel,
      apiKey: draftApiKey,
      baseUrl: PROVIDER_BASE_URLS[draftProvider],
    };
    saveProviderOverride(saved);
    setOverride(saved);
  }

  function handleClearOverride() {
    clearProviderOverride();
    setOverride(null);
    setDraftModel("");
    setDraftApiKey("");
  }

  function handleAsk() {
    const asked = question;
    setMessages((prev) => [...prev, { role: "human", content: asked }]);
    setQuestion("");
    setState({ kind: "loading" });
    setStreamingSteps([]);
    setStreamingAnswer("");

    // Local accumulators, not state reads -- state updates are async/
    // batched, so the "done" handler below builds off these instead of
    // (possibly stale) streamingSteps/streamingAnswer state values.
    const collectedSteps: AgentStep[] = [];
    let collectedAnswer = "";

    void askStream(
      asked,
      sessionId,
      (event) => {
        if (event.type === "tool_call" || event.type === "tool_result") {
          collectedSteps.push({ kind: event.type, name: event.name, detail: event.detail });
          setStreamingSteps([...collectedSteps]);
        } else if (event.type === "token") {
          collectedAnswer += event.content;
          setStreamingAnswer(collectedAnswer);
        } else if (event.type === "done") {
          setMessages((prev) => [...prev, { role: "ai", content: event.answer }]);
          setLatestSteps([...collectedSteps, { kind: "answer", name: "final", detail: event.answer }]);
          setStreamingSteps([]);
          setStreamingAnswer("");
          setState({ kind: "idle" });
        } else if (event.type === "error") {
          setState({ kind: "error" });
        }
      },
      override ?? undefined,
    ).catch((error) => {
      if (error instanceof AgentUnavailableError) {
        setState({ kind: "unavailable", detail: error.message });
      } else {
        setState({ kind: "error" });
      }
    });
  }

  return (
    <main className="view">
      <div className="view-head">
        <div>
          <h1>Agent</h1>
          <p className="sub">Ask a grounded question — every SQL statement is checked against business rules before it runs.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 18 }}>
        <aside style={{ width: 260 }}>
          <div className="panel-h">
            <h2>Sessions</h2>
          </div>
          <button type="button" className="btn" style={{ margin: "8px 0" }} onClick={handleNewSession}>
            New session
          </button>
          <ul role="list" aria-label="Sessions" style={{ listStyle: "none", padding: 0 }}>
            {sessions.map((summary) => (
              <li key={summary.session_id} style={{ marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-current={summary.session_id === sessionId ? "true" : undefined}
                  onClick={() => handleResume(summary)}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  <div>{summary.last_message || "(no messages yet)"}</div>
                  <span className="dim">{summary.turn_count} turns</span>
                </button>
              </li>
            ))}
            {sessions.length === 0 && <p className="dim">No sessions yet.</p>}
          </ul>
        </aside>

        <section style={{ flex: 1 }}>
          <div
            role="log"
            aria-label="Conversation"
            className="panel"
            style={{ padding: 16, marginBottom: 18, minHeight: 200 }}
          >
            {messages.length === 0 && state.kind !== "loading" ? (
              <p className="dim">Ask a question to start the conversation.</p>
            ) : (
              messages.map((message, index) =>
                message.role === "human" ? (
                  <p key={index}>
                    <b>You:</b> {message.content}
                  </p>
                ) : (
                  <div key={index}>
                    <b>Agent:</b>
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ),
              )
            )}
            {state.kind === "loading" && (
              <div>
                <b>Agent:</b>
                {streamingAnswer ? <ReactMarkdown>{streamingAnswer}</ReactMarkdown> : <p className="dim">Thinking…</p>}
              </div>
            )}
            {state.kind === "unavailable" && <p className="dim">{state.detail}</p>}
            {state.kind === "error" && <p className="dim">The agent request failed. Try again.</p>}
          </div>

          <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setShowProviderPanel((v) => !v)}
            >
              Provider {override ? `(${override.model})` : "(server default)"}
            </button>
            {showProviderPanel && (
              <div style={{ marginTop: 12 }}>
                <label htmlFor="override-provider">Provider</label>
                <br />
                <select
                  id="override-provider"
                  style={{ width: "100%" }}
                  value={draftProvider}
                  onChange={(e) => {
                    setDraftProvider(e.target.value as ProviderId);
                    setDraftModel("");
                  }}
                >
                  <option value="nvidia">NVIDIA</option>
                  <option value="opencode">OpenCode Zen</option>
                </select>
                <br />
                <label htmlFor="override-model">Model</label>
                <br />
                <select
                  id="override-model"
                  style={{ width: "100%" }}
                  value={draftModel}
                  onChange={(e) => setDraftModel(e.target.value)}
                >
                  <option value="">Select a model…</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                      {m.is_free ? " (FREE)" : ""}
                    </option>
                  ))}
                </select>
                <br />
                <label htmlFor="override-api-key">API key</label>
                <br />
                <input
                  id="override-api-key"
                  type="password"
                  style={{ width: "100%" }}
                  value={draftApiKey}
                  onChange={(e) => setDraftApiKey(e.target.value)}
                  autoComplete="off"
                />
                <br />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginTop: 8 }}
                  disabled={draftModel.trim() === "" || draftApiKey.trim() === ""}
                  onClick={handleSaveOverride}
                >
                  Save
                </button>{" "}
                <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={handleClearOverride}>
                  Use server default
                </button>
                <p className="dim">
                  Your API key stays in this browser and is sent only with your own requests — it is never
                  stored on the server.
                </p>
              </div>
            )}
          </div>

          <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
            <label htmlFor="agent-question">Ask a question</label>
            <br />
            <textarea
              id="agent-question"
              rows={2}
              style={{ width: "100%" }}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <br />
            <button
              type="button"
              className="btn btn-primary"
              disabled={question.trim() === "" || state.kind === "loading"}
              onClick={handleAsk}
              style={{ marginTop: 8 }}
            >
              {state.kind === "loading" ? "Asking…" : "Ask"}
            </button>
          </div>

          {(() => {
            const displaySteps = state.kind === "loading" ? streamingSteps : latestSteps;
            return (
              displaySteps.length > 0 && (
                <div className="panel" style={{ padding: 16 }}>
                  <div className="panel-h">
                    <h2>Reasoning trace</h2>
                  </div>
                  <ul role="list" aria-label="Reasoning trace" style={{ listStyle: "none", padding: 0 }}>
                    {displaySteps.map((step, index) => (
                      <StepRow key={index} step={step} />
                    ))}
                  </ul>
                </div>
              )
            );
          })()}
        </section>
      </div>
    </main>
  );
}
