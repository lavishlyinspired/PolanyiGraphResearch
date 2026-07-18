# Plan: S1 — Validate a query against business rules

**Branch**: feat/studio-v1-validator
**Status**: Draft — awaiting acceptance-criteria approval (per-slice gate)
**Story**: `00-story-split.md` S1 · **Checklist**: `../checklist/checklist.md` Phase 1
**Design reference**: `docs/design/polanyi-studio-prototype.html` → Validator page (`#validator`), incl. seam diagram, verdict ledger, seg-control example queries

## Goal

A steward can paste a SQL query into the new Studio and see, before it ever runs, which business rules it violates — per-rule verdicts with the rule text and a fix suggestion.

## Ground truth (verified against code, not the prototype)

- `POST /api/validate` body `{sql: string}` → `{valid: bool, violations: [{rule_id, severity, message}], checked_rules: string[]}` (`apps/server/polanyi/api/__init__.py:145`, models in `packages/common/models.py:107-116`).
- **`valid` is `false` only when a violation has severity `CRITICAL`** (`validate.py:43-44`). Warnings/advisories return `valid: true` *with* violations — the UI verdict must distinguish BLOCKED (invalid) from PASSED-WITH-WARNINGS, not collapse them.
- Non-SELECT statements yield the synthetic `GUARD-DML` CRITICAL violation.
- `GET /api/rules` exists for rule names/descriptions (violations carry `rule_id` + message; the pretty rule *name* comes from the rules list).
- Known limitation (documented, NOT fixed here): `validate_sql` is a regex word-boundary *presence* check — it cannot prove predicate correctness. UI copy must say "checked against rules", never "proven safe".

## Structural decisions (this slice only)

- New app scaffolds at **`apps/studio-v1/`** (Vite + React + TypeScript strict + Vitest Browser Mode + Stryker). Old `apps/studio` untouched — retired at parity, not now. Dev server proxies `/api` → `:8000` exactly like the old app.
- API contract enforced schema-first at the trust boundary: Zod schemas for `ValidationResult`/`Violation` mirroring `packages/common/models.py`; types derived from schemas.
- Design tokens ported from the prototype **only as needed by this slice** (shell + panel + stamp + verdict-row + button + code block). No big-bang design system.
- App shell in this slice = wordmark + sidebar with the Validator entry only (other 15 destinations are NOT stubbed — they appear in later slices; an empty nav is honest, a fake nav is not).

## Acceptance Criteria (whole plan)

- [ ] Pasting the sanctioned-counterparty query (joins `trades`→`counterparties`, no `is_sanctioned`) and clicking Validate shows verdict **✕ BLOCKED** with a BR-001 row containing the rule's message text
- [ ] A compliant query shows **✓ PASSED** with each checked rule listed as a pass row
- [ ] A query with only advisory/warning violations shows **passed with warnings** (not blocked) — mirrors backend semantics exactly
- [ ] A non-SELECT statement (`DELETE FROM trades`) shows the GUARD-DML blocked verdict
- [ ] API unreachable → visible error state with retry; empty textarea → Validate disabled
- [ ] The known-limitation note and CLI equivalence line (`polanyi validate "…"`) are visible on the page
- [ ] All tests green, mutation report reviewed, typecheck/lint clean

## Slices

Every slice: load `tdd`, `testing`, `mutation-testing`, `refactoring` before code (plus `front-end-testing`/`react-testing` and `typescript-strict` — this is a new TS/React surface). Present slice AC → human confirms → RED → GREEN → MUTATE → KILL MUTANTS → REFACTOR → present + wait for commit approval.

### Slice 1: Walking skeleton — paste SQL, get a real verdict banner

**Value**: Steward sees the symbolic gate answer through the real production path (new UI → real API → `validate_sql`); proves the entire rebuild stack (scaffold, proxy, schema boundary, browser tests) in one PR.
**Path**: textarea + Validate button → `POST /api/validate` (Zod-parsed) → verdict banner ✕ BLOCKED / ✓ PASSED. Skipped states (later slices): per-rule rows, warnings distinction, error/empty states.
**Required skills before code**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`, `typescript-strict`.
**Acceptance criteria (confirm before code)**: given the API is running with the demo context, entering the BR-001-violating query and clicking Validate renders a BLOCKED banner; a compliant query renders PASSED. Network layer is the real fetch path (mocked at network boundary in browser tests, exercised live once manually against `polanyi serve`).
**RED**: browser-mode test — renders page, types violating SQL, clicks Validate, asserts BLOCKED banner (network mocked with contract-shaped fixture parsed by the real Zod schema). Likely mutants to pre-empt: verdict boolean inversion (`valid` → banner mapping), schema-optional-field deletions.
**GREEN**: scaffold app; `validateSql()` client (fetch + Zod parse); minimal page wiring.
**MUTATE / KILL MUTANTS**: Stryker on `src/`; strengthen tests for surviving verdict-mapping/schema mutants.
**REFACTOR**: assess only (scaffold is young; expect little).
**Done when**: AC met live against the real server once, mutation report reviewed, commit approved.

### Slice 2: Per-rule verdict ledger with rule text and fix guidance

**Value**: The differentiator — not just "blocked" but *which rule, why, and how to fix*.
**Path**: same submit → render one row per violation (stamp by severity: CRITICAL→BLOCKED, WARNING→warn, else advisory) + one pass row per `checked_rules` entry not in violations; rule display names joined from `GET /api/rules`; message text shown verbatim (it already contains the fix guidance).
**Required skills before code**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria (confirm before code)**: violating query → BR-001 row stamped BLOCKED with its message; BR-004-style advisory shows as warning row *while overall verdict stays passed-with-warnings*; compliant query lists ✓ rows for every checked rule. Severity→stamp mapping tested exhaustively (string-literal mutants).
**RED**: rows/stamps/passed-with-warnings assertions against contract fixtures.
**GREEN**: verdict-derivation function (pure, unit-tested) + row components.
**MUTATE / KILL MUTANTS / REFACTOR / Done when**: as above; pure derivation function is the mutation hot-spot — aim for 100% kill there.

### Slice 3: Honest edges — errors, empties, DML guard, limitation note

**Value**: Trust surface stays trustworthy at the edges; page is stakeholder-demoable without hand-holding.
**Path**: API failure → error panel with retry; empty/whitespace SQL → disabled button; `DELETE FROM trades` → GUARD-DML blocked row; static known-limitation note + CLI equivalence line; two example-query preset buttons (violating / corrected — the prototype's seg control) to make the demo one click.
**Required skills before code**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria (confirm before code)**: each edge above observable in a browser test; presets fill the textarea and validate on click.
**RED/GREEN/MUTATE/KILL/REFACTOR**: per protocol.
**Done when**: full plan AC list at top all check; `verify` pass driving the real app against `polanyi serve`; commit approved.

## Pre-PR Quality Gate

1. `mutation-testing` report (Stryker) reviewed, survivors addressed or explicitly accepted
2. `refactoring` assessment run
3. `tsc --noEmit` + lint clean
4. Live end-to-end check against `polanyi serve` (real demo context, no mocks)
5. Tick S1 in `../checklist/checklist.md` in the same commit

## Explicitly deferred out of this plan

SQL AST validation upgrade (parking lot) · query history/saved queries (S2's deferral) · running the query (S2) · any other page or nav destination · auth (v1 decision: internal-only).

---
*When S1 completes: update checklist, then plan S2–S4 (Query Console) as the next file `02-query-console.md` — they share this page shell.*
