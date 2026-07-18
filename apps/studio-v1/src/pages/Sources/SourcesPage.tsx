import { useState } from "react";
import { fetchSchema, fetchSources, type SchemaSnapshot, type Source } from "@/api/schema";

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
    <div>
      <h1>Data Sources</h1>
      <table>
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
              <td>{source.dialect}</td>
              <td>{source.table_count}</td>
              <td>{source.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Schema browser</h2>
      <div>
        {schema.tables.map((t) => (
          <button key={t.name} type="button" onClick={() => setActiveTable(t.name)}>
            {t.name}
          </button>
        ))}
      </div>
      {table !== null && (
        <table>
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
                  <td>{column.type}</td>
                  <td>
                    {column.primary_key && "PK"}
                    {fk !== undefined && `FK → ${fk.references_table}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
