export interface FiboNode {
  id: string;
  label: string;
  iri: string;
  definition: string;
  source: "FIBO" | "Databricks";
  x: number;
  y: number;
  aligned: boolean;
  properties?: { name: string; type: string }[];
}

export interface AlignmentLink {
  id: string;
  sourceId: string;
  targetId: string;
  confidence: number;
  method: string;
  status: "pending" | "approved" | "rejected";
  relation: "equivalent" | "subsumption" | "part-of" | "related";
  rationale: string;
}

export const initialNodes: FiboNode[] = [
  {
    id: "n1",
    label: "Loan",
    iri: "fibo:Loan",
    definition: "A contractual obligation to repay a borrowed sum with interest over time.",
    source: "FIBO",
    x: 180,
    y: 120,
    aligned: true,
    properties: [
      { name: "principal", type: "decimal" },
      { name: "maturityDate", type: "date" },
      { name: "borrower", type: "Party" },
    ],
  },
  {
    id: "n2",
    label: "Mortgage",
    iri: "fibo:Mortgage",
    definition: "A secured loan using real property as collateral.",
    source: "FIBO",
    x: 380,
    y: 80,
    aligned: true,
    properties: [
      { name: "property", type: "RealEstate" },
      { name: "principal", type: "decimal" },
    ],
  },
  {
    id: "n3",
    label: "InterestRate",
    iri: "fibo:InterestRate",
    definition: "The percentage charged on a loan over a period of time.",
    source: "FIBO",
    x: 180,
    y: 300,
    aligned: true,
    properties: [{ name: "rateValue", type: "decimal" }],
  },
  {
    id: "n4",
    label: "Collateral",
    iri: "fibo:Collateral",
    definition: "An asset pledged by a borrower to secure a loan.",
    source: "FIBO",
    x: 380,
    y: 240,
    aligned: false,
    properties: [{ name: "assetValue", type: "decimal" }],
  },
  {
    id: "n5",
    label: "CreditRisk",
    iri: "fibo:CreditRisk",
    definition: "The risk of default on a debt arising from a borrower failing to make required payments.",
    source: "FIBO",
    x: 580,
    y: 160,
    aligned: true,
    properties: [{ name: "riskScore", type: "integer" }],
  },
  {
    id: "n6",
    label: "loan_portfolio",
    iri: "dbx:loan_portfolio",
    definition: "Databricks table containing all active loan records with outstanding balances.",
    source: "Databricks",
    x: 180,
    y: 460,
    aligned: true,
    properties: [
      { name: "loan_amount", type: "double" },
      { name: "end_date", type: "date" },
      { name: "customer_id", type: "string" },
    ],
  },
  {
    id: "n7",
    label: "rate_index",
    iri: "dbx:rate_index",
    definition: "Databricks view of benchmark interest rates (SOFR, LIBOR) used for pricing.",
    source: "Databricks",
    x: 380,
    y: 420,
    aligned: true,
    properties: [{ name: "current_rate", type: "double" }],
  },
  {
    id: "n8",
    label: "borrower_score",
    iri: "dbx:borrower_score",
    definition: "Databricks ML feature table with credit scores and risk classifications.",
    source: "Databricks",
    x: 580,
    y: 360,
    aligned: true,
    properties: [{ name: "fico_score", type: "int" }],
  },
  {
    id: "n9",
    label: "Derivative",
    iri: "fibo:Derivative",
    definition: "A financial contract whose value depends on an underlying asset.",
    source: "FIBO",
    x: 780,
    y: 100,
    aligned: false,
  },
  {
    id: "n10",
    label: "Swap",
    iri: "fibo:Swap",
    definition: "A derivative contract where two parties exchange cash flows.",
    source: "FIBO",
    x: 780,
    y: 280,
    aligned: false,
  },
];

export const initialLinks: AlignmentLink[] = [
  {
    id: "l1",
    sourceId: "n1",
    targetId: "n6",
    confidence: 0.92,
    method: "Lexical Match (TF-IDF + Levenshtein)",
    status: "approved",
    relation: "equivalent",
    rationale: "High lexical similarity. Properties 'principal' and 'loan_amount' have matching types and semantic equivalence.",
  },
  {
    id: "l2",
    sourceId: "n3",
    targetId: "n7",
    confidence: 0.88,
    method: "Graph Embedding (Node2Vec)",
    status: "approved",
    relation: "equivalent",
    rationale: "Vector cosine similarity 0.88. Contextual meaning aligns despite lexical differences.",
  },
  {
    id: "l3",
    sourceId: "n5",
    targetId: "n8",
    confidence: 0.81,
    method: "Community Detection (Louvain)",
    status: "pending",
    relation: "related",
    rationale: "Neo4j graph traversal shows shared neighborhoods. 'riskScore' and 'fico_score' correlate empirically.",
  },
  {
    id: "l4",
    sourceId: "n2",
    targetId: "n6",
    confidence: 0.74,
    method: "Taxonomic Reasoning (OWL Reasoner)",
    status: "pending",
    relation: "subsumption",
    rationale: "Mortgage is a subclass of Loan. Databricks table lacks specific mortgage distinction, suggesting subsumption.",
  },
  {
    id: "l5",
    sourceId: "n4",
    targetId: "n8",
    confidence: 0.45,
    method: "Lexical Match (TF-IDF + Levenshtein)",
    status: "rejected",
    relation: "related",
    rationale: "Low lexical and semantic overlap. Collateral assets do not map directly to credit scores.",
  },
  {
    id: "l6",
    sourceId: "n10",
    targetId: "n8",
    confidence: 0.52,
    method: "Graph Embedding (Node2Vec)",
    status: "pending",
    relation: "related",
    rationale: "Weak structural link via shared counterparties in Neo4j graph.",
  },
];

// Simulated alignment engine output based on Neo4j GDS / GoingMeta approaches
export function runAlignmentSimulation(nodes: FiboNode[]): AlignmentLink[] {
  const fiboNodes = nodes.filter(n => n.source === "FIBO");
  const dbxNodes = nodes.filter(n => n.source === "Databricks");
  
  const newLinks: AlignmentLink[] = [];
  let linkId = 100;

  fiboNodes.forEach(fNode => {
    dbxNodes.forEach(dNode => {
      // Simulate Lexical Match
      const lexicalScore = Math.random() * 0.4 + 0.2;
      // Simulate Graph Embedding similarity
      const embeddingScore = Math.random() * 0.5 + 0.4;
      // Simulate Structural/Community overlap
      const communityScore = Math.random() * 0.3 + 0.5;

      // Aggregate confidence
      const confidence = (lexicalScore + embeddingScore + communityScore) / 3;

      if (confidence > 0.55) {
        newLinks.push({
          id: `l${linkId++}`,
          sourceId: fNode.id,
          targetId: dNode.id,
          confidence: parseFloat(confidence.toFixed(2)),
          method: confidence > 0.7 ? "Graph Embedding (Node2Vec)" : "Lexical Match (TF-IDF + Levenshtein)",
          status: "pending",
          relation: confidence > 0.8 ? "equivalent" : "related",
          rationale: `Simulated match via ${confidence > 0.7 ? "Graph Embedding" : "Lexical Analysis"}. Cosine similarity: ${embeddingScore.toFixed(2)}.`
        });
      }
    });
  });

  return newLinks;
}