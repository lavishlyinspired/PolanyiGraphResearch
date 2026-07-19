import { useEffect, useState } from "react";
import {
  AgentUnavailableError,
  ask,
  fetchSessionMessages,
  fetchSessions,
  type AgentStep,
  type SessionMessage,
  type SessionSummary,
} from "@/api/agent";

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

  function handleAsk() {
    const asked = question;
    setMessages((prev) => [...prev, { role: "human", content: asked }]);
    setQuestion("");
    setState({ kind: "loading" });
    void ask(asked, sessionId)
      .then((result) => {
        setMessages((prev) => [...prev, { role: "ai", content: result.answer }]);
        setLatestSteps(result.steps);
        setState({ kind: "idle" });
      })
      .catch((error) => {
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
          <div className="panel" style={{ padding: 16, marginBottom: 18, minHeight: 200 }}>
            {messages.length === 0 ? (
              <p className="dim">Ask a question to start the conversation.</p>
            ) : (
              messages.map((message, index) => (
                <p key={index}>
                  <b>{message.role === "human" ? "You" : "Agent"}:</b> {message.content}
                </p>
              ))
            )}
            {state.kind === "unavailable" && <p className="dim">{state.detail}</p>}
            {state.kind === "error" && <p className="dim">The agent request failed. Try again.</p>}
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

          {latestSteps.length > 0 && (
            <div className="panel" style={{ padding: 16 }}>
              <div className="panel-h">
                <h2>Reasoning trace</h2>
              </div>
              <ul role="list" aria-label="Reasoning trace" style={{ listStyle: "none", padding: 0 }}>
                {latestSteps.map((step, index) => (
                  <StepRow key={index} step={step} />
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
