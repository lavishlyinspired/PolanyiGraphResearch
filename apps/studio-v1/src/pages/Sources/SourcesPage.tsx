import { useState } from "react";
import { fetchSchema, fetchSources, type SchemaSnapshot, type Source } from "@/api/schema";

function statusChip(status: string): string {
  if (status === "connected") return "chip-good";
  if (status === "error") return "chip-bad";
  return "";
}

export function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [schema, setSchema] = useState<SchemaSnapshot | null>(null);
  const [activeTable, setActiveTable] = useState<string | null>(null);

  if (sources === null || schema === null) {
    void Promise.all([fetchSources(), fetchSchema()]).then(([s, sc]) => {
      setSources(s);
      setSchema(sc);
      setActiveTable(sc.tables[0]?.name ?? null);
    });
    return <p>Loading…</p>;
  }

  const table = schema.tables.find((t) => t.name === activeTable) ?? null;

  return (
    <main className="view">
      <div className="view-head">
        <h1>Data Sources</h1>
      </div>
      <div className="panel tblwrap" style={{ marginBottom: 20 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Dialect</th>
              <th scope="col">Tables</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.name}>
                <td>{source.name}</td>
                <td className="mono">{source.dialect}</td>
                <td className="num">{source.table_count}</td>
                <td>
                  <span className={`chip ${statusChip(source.status)}`}>{source.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-h">
          <h2>Schema browser</h2>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: 14 }}>
          {schema.tables.map((t) => (
            <button
              key={t.name}
              type="button"
              className={`btn btn-sm${t.name === activeTable ? " btn-primary" : ""}`}
              onClick={() => setActiveTable(t.name)}
            >
              {t.name}
            </button>
          ))}
        </div>
        {table !== null && (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Column</th>
                  <th scope="col">Type</th>
                  <th scope="col">Key</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((column) => {
                  const fk = table.foreign_keys.find((f) => f.column === column.name);
                  return (
                    <tr key={column.name}>
                      <td>{column.name}</td>
                      <td className="mono">{column.type}</td>
                      <td>
                        {column.primary_key && "PK"}
                        {fk !== undefined && `FK → ${fk.references_table}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
