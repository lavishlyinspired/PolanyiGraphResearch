import { useState } from "react";
import { validateSql, type ValidationResult } from "@/api/validation";

export function ValidatorPage() {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<ValidationResult | null>(null);

  async function handleValidate() {
    setResult(await validateSql(sql));
  }

  return (
    <main>
      <h1>Validator</h1>
      <label>
        SQL
        <textarea value={sql} onChange={(event) => setSql(event.target.value)} />
      </label>
      <button type="button" onClick={handleValidate}>
        Validate
      </button>
      {result !== null && (
        <div role="status">{result.valid ? "PASSED" : "BLOCKED"}</div>
      )}
    </main>
  );
}
