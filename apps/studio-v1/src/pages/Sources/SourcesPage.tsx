import { useEffect, useState } from "react";
import {
  fetchSchema,
  fetchSources,
  fetchDatabricksStatus,
  fetchDatabricksSchemas,
  connectSource,
  disconnectSource,
  introspectSource,
  editSource,
  type ConnectSourceInput,
  type EditSourceInput,
  type SchemaSnapshot,
  type Source,
  type DatabricksStatus,
} from "@/api/schema";
import { fetchContext, regenerateContext, type SemanticContext } from "@/api/context";
import { useNavigation } from "@/navigation";

function statusChip(status: string): string {
  if (status === "connected") return "chip-good";
  if (status === "error") return "chip-bad";
  return "";
}

function isDatabricksEnv(source: Source): boolean {
  return source.dialect === "databricks" && !source.removable;
}

function schemaHint(source: Source | null): string {
  if (source === null) return "";
  if (source.dialect === "sqlite") return `${source.name} · foreign keys become relationships`;
  if (isDatabricksEnv(source)) return `${source.name} · Unity Catalog`;
  return source.name;
}

/** What to pass fetchSchema() for a given source — null means "nothing to
 *  browse yet" (the Databricks connection has no catalog/schema configured). */
function schemaFetchArgsFor(
  source: Source,
): { source?: string; name?: string; catalog?: string; schemaName?: string } | null {
  if (source.is_primary) return {};
  if (isDatabricksEnv(source)) {
    if (source.catalog && source.schema_name) {
      return { source: "databricks", catalog: source.catalog, schemaName: source.schema_name };
    }
    return null;
  }
  return { name: source.name };
}

// A column's semantic term is matched structurally (table + column name
// against the glossary's source_tables/source_columns) — real for any source
// whose schema happens to share names with what the context was derived
// from, honestly absent ("—") otherwise. Not gated to one specific source.
function semanticTermFor(context: SemanticContext | null, tableName: string, columnName: string): string | null {
  if (context === null) return null;
  const entry = context.glossary.find(
    (g) => g.source_tables.includes(tableName) && g.source_columns.includes(columnName),
  );
  return entry?.term ?? null;
}

/* ── Toast ────────────────────────────────────────────────────────────── */

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 2400);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="toast show" role="status">
      {message}
    </div>
  );
}

/* ── Connect Source Modal ─────────────────────────────────────────────── */

type SourceKind = "sqlite" | "databricks" | "postgres" | "mysql";

function ConnectSourceModal({
  onConnect,
  onClose,
}: {
  onConnect: (source: ConnectSourceInput) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SourceKind>("sqlite");
  const [name, setName] = useState("");
  const [uri, setUri] = useState("");
  const [host, setHost] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [token, setToken] = useState("");

  const placeholders: Record<Exclude<SourceKind, "databricks">, string> = {
    sqlite: "sqlite:///path/to/database.db",
    postgres: "postgresql://user:pass@host:5432/dbname",
    mysql: "mysql://user:pass@host:3306/dbname",
  };

  const isDatabricks = kind === "databricks";
  const canSubmit =
    name.trim() !== "" &&
    (isDatabricks
      ? host.trim() !== "" && warehouseId.trim() !== "" && token.trim() !== ""
      : uri.trim() !== "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (isDatabricks) {
      onConnect({
        name: name.trim(),
        kind: "databricks",
        host: host.trim(),
        warehouseId: warehouseId.trim(),
        token: token.trim(),
      });
    } else {
      onConnect({ name: name.trim(), kind, uri: uri.trim() });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Connect a data source</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label>
              Source type
              <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}>
                <option value="sqlite">SQLite</option>
                <option value="databricks">Databricks Unity Catalog</option>
                <option value="postgres">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </label>
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. production-db"
                autoFocus
              />
            </label>
            {isDatabricks ? (
              <>
                <label>
                  Workspace host
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="dbc-xxxxxxxx-xxxx.cloud.databricks.com"
                  />
                </label>
                <label>
                  SQL warehouse ID
                  <input
                    type="text"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    placeholder="a1b2c3d4e5f6g7h8"
                  />
                </label>
                <label>
                  Access token
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="dapi…"
                  />
                </label>
              </>
            ) : (
              <label>
                Connection URI
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder={placeholders[kind]}
                />
              </label>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Edit Source Modal ────────────────────────────────────────────────── */

function EditSourceModal({
  source,
  dbStatus,
  onSave,
  onClose,
}: {
  source: Source;
  dbStatus: DatabricksStatus | null;
  onSave: (input: EditSourceInput) => void;
  onClose: () => void;
}) {
  const editingDatabricksEnv = isDatabricksEnv(source);
  const editingDatabricksExtra = source.removable && source.dialect === "databricks";

  // The primary source's URI has no secrets (sqlite paths aren't redacted),
  // so it's safe to prefill for editing. Removable sources may have real
  // credentials embedded and are shown redacted — prefilling those would let
  // an unedited save silently persist the literal "***" over the real value,
  // so those start blank ("leave blank to keep current" instead).
  const [uri, setUri] = useState(source.is_primary ? source.uri : "");
  const [host, setHost] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [token, setToken] = useState("");
  const [catalog, setCatalog] = useState(source.catalog ?? "");
  const [schemaName, setSchemaName] = useState(source.schema_name ?? "");
  const [dbSchemas, setDbSchemas] = useState<string[]>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);

  useEffect(() => {
    if (!editingDatabricksEnv || !catalog) return;
    let cancelled = false;
    setLoadingSchemas(true);
    void fetchDatabricksSchemas(catalog)
      .then((res) => {
        if (!cancelled) setDbSchemas(res.schemas);
      })
      .finally(() => {
        if (!cancelled) setLoadingSchemas(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  function handleCatalogChange(next: string) {
    setCatalog(next);
    setSchemaName("");
    setDbSchemas([]);
  }

  const canSubmit = editingDatabricksEnv
    ? catalog.trim() !== "" && schemaName.trim() !== ""
    : editingDatabricksExtra
      ? true // all three optional — blank means "keep the existing connection"
      : uri.trim() !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (editingDatabricksEnv) {
      onSave({ catalog: catalog.trim(), schemaName: schemaName.trim() });
    } else if (editingDatabricksExtra) {
      onSave({ host: host.trim(), warehouseId: warehouseId.trim(), token: token.trim() });
    } else {
      onSave({ uri: uri.trim() });
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Edit “{source.name}”</h3>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {editingDatabricksEnv ? (
              <>
                <label>
                  Catalog
                  <select value={catalog} onChange={(e) => handleCatalogChange(e.target.value)}>
                    <option value="">Select catalog…</option>
                    {dbStatus?.catalogs.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Schema
                  <select
                    value={schemaName}
                    onChange={(e) => setSchemaName(e.target.value)}
                    disabled={!catalog || loadingSchemas}
                  >
                    <option value="">{loadingSchemas ? "Loading schemas…" : "Select schema…"}</option>
                    {dbSchemas.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : editingDatabricksExtra ? (
              <>
                <p className="dim" style={{ margin: "0 0 4px" }}>
                  Leave a field blank to keep its current value.
                </p>
                <label>
                  Workspace host
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="leave blank to keep current"
                  />
                </label>
                <label>
                  SQL warehouse ID
                  <input
                    type="text"
                    value={warehouseId}
                    onChange={(e) => setWarehouseId(e.target.value)}
                    placeholder="leave blank to keep current"
                  />
                </label>
                <label>
                  Access token
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="leave blank to keep current"
                  />
                </label>
              </>
            ) : (
              <label>
                Connection URI
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder={source.is_primary ? undefined : "leave blank to keep current"}
                />
              </label>
            )}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */

export function SourcesPage() {
  const { navigate } = useNavigation();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);

  const [dbStatus, setDbStatus] = useState<DatabricksStatus | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [context, setContext] = useState<SemanticContext | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<{
    terms: number;
    relationships: number;
    rules: number;
  } | null>(null);

  /* ── Shared schema-loading logic ───────────────────────────────────── */

  function loadSchemaFor(source: Source) {
    setSchema(null);
    setSchemaError(null);
    setActiveTable(null);
    const args = schemaFetchArgsFor(source);
    if (args === null) return;
    void fetchSchema(args)
      .then((sc) => {
        setSchema(sc);
        setActiveTable(sc.tables[0]?.name ?? null);
      })
      .catch(() => setSchemaError(`Couldn't load the schema for "${source.name}".`));
  }

  /* ── Initial data load ─────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    void fetchContext()
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch(() => {
        // Semantic term column just falls back to "—" without context.
      });
    void fetchSources().then((s) => {
      if (cancelled) return;
      setSources(s);
      const first = s[0] ?? null;
      setSelectedSource(first);
      if (first !== null) loadSchemaFor(first);
      if (s.some((src) => isDatabricksEnv(src))) {
        void fetchDatabricksStatus().then((status) => {
          if (!cancelled) setDbStatus(status);
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sources === null) {
    return <p>Loading…</p>;
  }

  /* ── Actions (no hooks below this line) ────────────────────────────── */

  function handleSelectSource(source: Source) {
    setSelectedSource(source);
    loadSchemaFor(source);
  }

  function handleConnectSource(src: ConnectSourceInput) {
    void connectSource(src)
      .then((updated) => {
        setSources(updated);
        setShowConnectModal(false);
        setToast(`Connected "${src.name}". Click Introspect to derive its schema.`);
      })
      .catch((err) => {
        setToast(err instanceof Error ? err.message : `Couldn't connect "${src.name}".`);
      });
  }

  function handleIntrospect(source: Source, e: React.MouseEvent) {
    e.stopPropagation();
    void introspectSource(source.name)
      .then((updated) => {
        setSources(updated);
        const refreshed = updated.find((s) => s.name === source.name) ?? source;
        setSelectedSource(refreshed);
        setToast(`Introspected "${source.name}".`);
        loadSchemaFor(refreshed);
      })
      .catch((err) => {
        setToast(err instanceof Error ? err.message : `Couldn't introspect "${source.name}".`);
      });
  }

  function handleDisconnect(source: Source, e: React.MouseEvent) {
    e.stopPropagation();
    void disconnectSource(source.name).then((updated) => {
      setSources(updated);
      if (selectedSource?.name === source.name) {
        const next = updated[0] ?? null;
        setSelectedSource(next);
        if (next !== null) loadSchemaFor(next);
      }
      setToast(`Disconnected "${source.name}".`);
    });
  }

  function handleEditSource(input: EditSourceInput) {
    if (editingSource === null) return;
    const name = editingSource.name;
    void editSource(name, input)
      .then((updated) => {
        setSources(updated);
        setEditingSource(null);
        const refreshed = updated.find((s) => s.name === name);
        if (refreshed !== undefined) {
          setSelectedSource(refreshed);
          loadSchemaFor(refreshed);
        }
        setToast(`Saved changes to "${name}".`);
      })
      .catch((err) => {
        setToast(err instanceof Error ? err.message : `Couldn't save changes to "${name}".`);
      });
  }

  function handleGenerateContext() {
    void regenerateContext()
      .then((ctx) => {
        setContext(ctx);
        setGenerateResult({
          terms: ctx.glossary.length,
          relationships: ctx.relationships.length,
          rules: ctx.business_rules.length,
        });
      })
      .catch(() => setToast("Couldn't generate context."));
  }

  const table = schema !== null ? schema.tables.find((t) => t.name === activeTable) ?? null : null;
  const isDatabricks = selectedSource !== null && isDatabricksEnv(selectedSource);
  // The Semantic term column is only worth showing once the semantic pipeline
  // has actually enriched something — otherwise it's a column of dashes.
  // FIBO alignment setting ontology_class on any term is real signal that
  // enrichment has run; a no-op until then, lights up automatically once it has.
  const hasSemanticEnrichment = context !== null && context.glossary.some((g) => g.ontology_class !== null);

  /* ── Render ─────────────────────────────────────────────────────────── */

  return (
    <main className="view">
      {toast !== null && <Toast message={toast} onDone={() => setToast(null)} />}
      {showConnectModal && (
        <ConnectSourceModal
          onConnect={handleConnectSource}
          onClose={() => setShowConnectModal(false)}
        />
      )}
      {editingSource !== null && (
        <EditSourceModal
          source={editingSource}
          dbStatus={dbStatus}
          onSave={handleEditSource}
          onClose={() => setEditingSource(null)}
        />
      )}

      <div className="view-head">
        <div>
          <h1>Data Sources</h1>
          <p className="sub">
            Connect any SQLAlchemy URI. Introspection derives entities, relationships and a
            first-pass glossary deterministically — an LLM key only enriches definitions.
          </p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => setShowConnectModal(true)}
          >
            Connect source
          </button>
          <button type="button" className="btn btn-primary" onClick={handleGenerateContext}>
            Generate context
          </button>
        </div>
      </div>

      {generateResult !== null && (
        <div className="callout callout-moss">
          <div>✓</div>
          <div style={{ flex: 1 }}>
            <div className="ttl">Context generated</div>
            <div>
              {generateResult.terms} glossary terms · {generateResult.relationships} entity
              relationships · {generateResult.rules} business rules derived from your schema.
              This grounds the Semantic Model, Business Rules, and Validator pages — nothing
              else to do here.
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setGenerateResult(null);
                  navigate("glossary");
                }}
              >
                View Semantic Model →
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setGenerateResult(null);
                  navigate("validator");
                }}
              >
                Try the Validator →
              </button>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setGenerateResult(null)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-h">
          <h2>Connections</h2>
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Objects</th>
                <th scope="col">Last introspected</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr
                  key={source.name}
                  className="rowlink"
                  aria-current={selectedSource?.name === source.name ? "true" : undefined}
                  onClick={() => handleSelectSource(source)}
                  style={
                    selectedSource?.name === source.name
                      ? { background: "var(--moss-tint)" }
                      : undefined
                  }
                >
                  <td>
                    <code>{source.name}</code>
                    <div className="dim" style={{ fontSize: 12 }}>
                      {source.uri}
                    </div>
                  </td>
                  <td>{source.kind}</td>
                  <td>
                    <span className={`chip ${statusChip(source.status)}`}>
                      {source.status === "connected" && "● "}
                      {source.status}
                    </span>
                  </td>
                  <td className="num">{source.objects_label || source.table_count}</td>
                  <td className="dim">{source.last_introspected ?? "—"}</td>
                  <td className="num" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={(e) => handleIntrospect(source, e)}
                    >
                      {source.status === "connected" ? "Re-introspect" : "Introspect"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSource(source);
                      }}
                    >
                      Edit
                    </button>
                    {source.removable && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={(e) => handleDisconnect(source, e)}
                      >
                        Disconnect
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Schema browser</h2>
          <span className="hint">{schemaHint(selectedSource)}</span>
        </div>

        {schema === null ? (
          <p className="dim" style={{ padding: 14, margin: 0 }}>
            {schemaError !== null
              ? schemaError
              : isDatabricks && !(selectedSource?.catalog && selectedSource?.schema_name)
                ? 'Not configured yet. Click "Edit" to choose a catalog and schema.'
                : selectedSource?.status === "configured"
                  ? "Not yet introspected. Click Introspect to derive the schema."
                  : "Loading schema…"}
          </p>
        ) : schema.tables.length === 0 ? (
          <p className="dim" style={{ padding: 14, margin: 0 }}>
            {selectedSource?.status === "configured"
              ? "Not yet introspected. Click Introspect to derive the schema."
              : "No tables found."}
          </p>
        ) : (
          <div className="schema">
            <div className="tables" role="listbox" aria-label="Tables">
              {schema.tables.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  className={`t-item${t.name === activeTable ? " sel" : ""}`}
                  role="option"
                  aria-selected={t.name === activeTable}
                  onClick={() => setActiveTable(t.name)}
                >
                  <span>{t.name}</span>
                  <span className="n">{t.columns.length}</span>
                </button>
              ))}
            </div>
            <div className="cols-panel">
              {table !== null ? (
                <div className="tblwrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th scope="col">Column</th>
                        <th scope="col">Type</th>
                        <th scope="col">Keys</th>
                        {hasSemanticEnrichment && <th scope="col">Semantic term</th>}
                        <th scope="col">Nullable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.columns.map((column) => {
                        const fk = table.foreign_keys.find((f) => f.column === column.name);
                        const term = hasSemanticEnrichment
                          ? semanticTermFor(context, table.name, column.name)
                          : null;
                        return (
                          <tr key={column.name}>
                            <td>
                              <code>{column.name}</code>
                            </td>
                            <td className="dim">{column.type}</td>
                            <td>
                              {column.primary_key && (
                                <span className="keytag pk">PK</span>
                              )}
                              {fk !== undefined && (
                                <span className="keytag fk">FK → {fk.references_table}</span>
                              )}
                            </td>
                            {hasSemanticEnrichment && (
                              <td>
                                {term !== null ? (
                                  <span className="chip chip-moss">{term}</span>
                                ) : (
                                  <span className="dim">—</span>
                                )}
                              </td>
                            )}
                            <td className="dim">{column.nullable ? "yes" : "no"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="dim" style={{ padding: 14, margin: 0 }}>
                  Select a table to view its columns.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
