import type { SemanticContext } from "@/api/context";

export function EntitiesRelationshipsTab({ context }: { context: SemanticContext }) {
  return (
    <div className="cols cols-2">
      <div className="panel" aria-label="Key entities">
        <div className="panel-h">
          <h2>Key entities · {context.key_entities.length}</h2>
          <span className="hint">ranked by foreign-key reference count</span>
        </div>
        {context.key_entities.length === 0 ? (
          <p className="dim" style={{ padding: 14, margin: 0 }}>
            No entities derived yet.
          </p>
        ) : (
          <ol style={{ margin: 0, padding: "6px 14px 14px", listStylePosition: "inside" }}>
            {context.key_entities.map((entity) => (
              <li key={entity} style={{ padding: "5px 0" }}>
                <code>{entity}</code>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="panel" aria-label="Relationships">
        <div className="panel-h">
          <h2>Relationships · {context.relationships.length}</h2>
        </div>
        {context.relationships.length === 0 ? (
          <p className="dim" style={{ padding: 14, margin: 0 }}>
            No relationships derived yet.
          </p>
        ) : (
          <div className="tblwrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Via</th>
                </tr>
              </thead>
              <tbody>
                {context.relationships.map((rel) => (
                  <tr key={`${rel.from_entity}-${rel.to_entity}-${rel.foreign_key}`}>
                    <td>
                      <code>{rel.from_entity}</code>
                    </td>
                    <td>
                      <code>{rel.to_entity}</code>
                    </td>
                    <td className="dim mono">{rel.foreign_key}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
