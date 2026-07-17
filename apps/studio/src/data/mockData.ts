export type DataSource = {
  id: string;
  name: string;
  type: string;
  connected: boolean;
  detail: string;
};

export const dataSources: DataSource[] = [
  { id: "databricks", name: "Databricks", type: "Data Lakehouse", connected: true, detail: "ABC Capital · Unity Catalog" },
  { id: "neo4j", name: "Neo4j", type: "Knowledge Graph", connected: true, detail: "Enterprise semantic model" },
  { id: "graphdb", name: "GraphDB", type: "Ontology Store", connected: true, detail: "FIBO ontology · SHACL" },
  { id: "snowflake", name: "Snowflake", type: "Data Warehouse", connected: false, detail: "Not connected" },
];

export type CatalogNode = {
  name: string;
  count?: number;
  tables?: string[];
  children?: CatalogNode[];
};

export const catalogs: CatalogNode[] = [
  {
    name: "finance",
    count: 128,
    children: [
      { name: "trades", count: 1 },
      { name: "settlements", count: 1 },
      { name: "counterparties", count: 1 },
    ],
  },
  {
    name: "trading",
    count: 94,
    children: [
      { name: "orders", count: 1 },
      { name: "executions", count: 1 },
      { name: "positions", count: 1 },
    ],
  },
  {
    name: "risk",
    count: 67,
    children: [
      { name: "exposures", count: 1 },
      { name: "limits", count: 1 },
      { name: "var_daily", count: 1 },
    ],
  },
  {
    name: "treasury",
    count: 53,
    children: [
      { name: "cash_flows", count: 1 },
      { name: "fx_hedges", count: 1 },
    ],
  },
];

export const discoveryStats = {
  tables: 342,
  columns: 5812,
  relationships: 1074,
  coverage: 82,
};

export const enterpriseSummary = {
  totalTables: 342,
  trading: 80,
  customer: 10,
  risk: 10,
  fiboConcepts: 41,
  inferredRelationships: 1200,
  unclassified: 18,
};

export type ColumnMapping = {
  column: string;
  fiboClass: string;
  fiboUri: string;
  confidence: number;
  status: "accepted" | "rejected" | "pending";
  rationale: string;
};

export type TableMapping = {
  table: string;
  schema: string;
  detectedConcepts: { name: string; confidence: number }[];
  columns: ColumnMapping[];
};

export const tableMappings: TableMapping[] = [
  {
    table: "trades",
    schema: "finance",
    detectedConcepts: [
      { name: "Trade", confidence: 97 },
      { name: "Financial Transaction", confidence: 89 },
      { name: "Contract", confidence: 61 },
    ],
    columns: [
      { column: "trade_id", fiboClass: "TradeIdentifier", fiboUri: "fibo:TradeIdentifier", confidence: 98, status: "accepted", rationale: "Primary key naming convention matches FIBO trade identifier pattern." },
      { column: "instrument_id", fiboClass: "FinancialInstrument", fiboUri: "fibo:FinancialInstrument", confidence: 94, status: "accepted", rationale: "Foreign key to instruments table, maps to FIBO instrument concept." },
      { column: "counterparty_id", fiboClass: "LegalEntity", fiboUri: "fibo:LegalEntity", confidence: 91, status: "accepted", rationale: "References entities table containing organization data." },
      { column: "quantity", fiboClass: "Quantity", fiboUri: "fibo:Quantity", confidence: 88, status: "pending", rationale: "Numeric field representing trade size; matches FIBO quantity." },
      { column: "price", fiboClass: "MonetaryAmount", fiboUri: "fibo:MonetaryAmount", confidence: 85, status: "pending", rationale: "Decimal field with currency context inferred from trade_currency." },
      { column: "settlement_date", fiboClass: "SettlementDate", fiboUri: "fibo:SettlementDate", confidence: 79, status: "pending", rationale: "Date column; could be trade date or settlement date. Sample data suggests settlement." },
    ],
  },
  {
    table: "positions",
    schema: "trading",
    detectedConcepts: [
      { name: "Position", confidence: 95 },
      { name: "Holding", confidence: 82 },
    ],
    columns: [
      { column: "position_id", fiboClass: "PositionIdentifier", fiboUri: "fibo:PositionIdentifier", confidence: 96, status: "accepted", rationale: "Primary key for position records." },
      { column: "account_id", fiboClass: "Account", fiboUri: "fibo:Account", confidence: 90, status: "accepted", rationale: "References accounts table." },
      { column: "instrument_id", fiboClass: "FinancialInstrument", fiboUri: "fibo:FinancialInstrument", confidence: 93, status: "accepted", rationale: "Held instrument reference." },
      { column: "quantity", fiboClass: "Quantity", fiboUri: "fibo:Quantity", confidence: 87, status: "pending", rationale: "Number of units held." },
      { column: "mark_to_market", fiboClass: "MonetaryAmount", fiboUri: "fibo:MonetaryAmount", confidence: 72, status: "pending", rationale: "Valuation field; may need separate valuation concept." },
    ],
  },
];

export type ReasoningStep = {
  id: string;
  label: string;
  detail: string;
  type: "planner" | "sql" | "execution" | "alignment" | "validation" | "answer";
};

export const reasoningSteps: ReasoningStep[] = [
  {
    id: "1",
    label: "Planner",
    detail: "Decomposed query into: identify Apple Inc. as LegalEntity → find Instruments issued by Apple → join to Trades → aggregate exposure.",
    type: "planner",
  },
  {
    id: "2",
    label: "Databricks Skill",
    detail: "Generated SQL joining finance.trades → finance.instruments → finance.issuers WHERE issuer_name LIKE '%Apple%'.",
    type: "sql",
  },
  {
    id: "3",
    label: "Databricks Execution",
    detail: "Query executed on Unity Catalog. Returned 15,000 rows in 1.2s.",
    type: "execution",
  },
  {
    id: "4",
    label: "Semantic Alignment",
    detail: "Aligned Trade → Instrument → Issuer → Apple Inc. using FIBO ontology path.",
    type: "alignment",
  },
  {
    id: "5",
    label: "FIBO Validation",
    detail: "Verified exposure concept maps to fibo:ExposurePosition. SHACL constraints satisfied.",
    type: "validation",
  },
  {
    id: "6",
    label: "Answer",
    detail: "Aggregated exposure across 15,000 trades. Total exposure to Apple Inc.: $247.3M across 8 counterparties.",
    type: "answer",
  },
];

export const sampleQueries = [
  "Show me exposure to Apple",
  "Which counterparties have risk above $5M?",
  "What trades reference AAPL?",
  "Find positions in tech sector instruments",
];

// ── Semantic View (GraphDB Ontology) ──

export type OntologyConcept = {
  id: string;
  name: string;
  fiboClass: string;
  definition: string;
  parentClass: string;
  properties: { name: string; type: string; fiboProp: string }[];
  shaclConstraints: string[];
  relatedConcepts: string[];
  mappedTables: string[];
};

export const ontologyConcepts: OntologyConcept[] = [
  {
    id: "trade",
    name: "Trade",
    fiboClass: "fibo:Trade",
    definition: "A transaction involving the exchange of financial instruments between two parties, typically executed on a trading venue or bilaterally.",
    parentClass: "fibo:Transaction",
    properties: [
      { name: "tradeIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "executionDateTime", type: "dateTime", fiboProp: "fibo:hasExecutionDate" },
      { name: "tradeAmount", type: "decimal", fiboProp: "fibo:hasMonetaryAmount" },
      { name: "settlementDate", type: "date", fiboProp: "fibo:hasSettlementDate" },
    ],
    shaclConstraints: [
      "sh:property requires fibo:hasIdentifier on all Trade instances",
      "sh:minCount 1 on fibo:hasMonetaryAmount",
      "sh:nodeKind sh:IRI for trade identifier",
    ],
    relatedConcepts: ["FinancialInstrument", "LegalEntity", "SettlementDate", "MonetaryAmount"],
    mappedTables: ["finance.trades", "trading.orders", "trading.executions"],
  },
  {
    id: "financial-instrument",
    name: "Financial Instrument",
    fiboClass: "fibo:FinancialInstrument",
    definition: "A tradable asset of any kind, or a claim on the legal entity that issues the instrument, representing a financial obligation or ownership interest.",
    parentClass: "fibo:Instrument",
    properties: [
      { name: "instrumentIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "instrumentType", type: "string", fiboProp: "fibo:hasInstrumentType" },
      { name: "issuer", type: "IRI", fiboProp: "fibo:hasIssuer" },
      { name: "faceValue", type: "decimal", fiboProp: "fibo:hasFaceValue" },
    ],
    shaclConstraints: [
      "sh:property requires fibo:hasIssuer",
      "sh:in (Equity, Debt, Derivative, FX) on instrument type",
    ],
    relatedConcepts: ["Trade", "LegalEntity", "Equity", "Debt"],
    mappedTables: ["finance.instruments", "finance.equities", "finance.bonds"],
  },
  {
    id: "legal-entity",
    name: "Legal Entity",
    fiboClass: "fibo:LegalEntity",
    definition: "A legal person or organizational entity that can enter into contracts, own property, and conduct business activities.",
    parentClass: "fibo:BusinessEntity",
    properties: [
      { name: "legalEntityIdentifier", type: "string", fiboProp: "fibo:hasLEI" },
      { name: "legalName", type: "string", fiboProp: "fibo:hasLegalName" },
      { name: "domicileCountry", type: "string", fiboProp: "fibo:hasDomicile" },
      { name: "entityType", type: "string", fiboProp: "fibo:hasEntityType" },
    ],
    shaclConstraints: [
      "sh:minCount 1 on fibo:hasLegalName",
      "sh:pattern ^[A-Z]{2} on LEI country code prefix",
    ],
    relatedConcepts: ["Trade", "FinancialInstrument", "BusinessEntity", "Country"],
    mappedTables: ["finance.counterparties", "finance.issuers", "crm.customers"],
  },
  {
    id: "account",
    name: "Account",
    fiboClass: "fibo:Account",
    definition: "A record of financial transactions between parties, representing a contractual relationship for holding assets or tracking obligations.",
    parentClass: "fibo:Contract",
    properties: [
      { name: "accountIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "accountHolder", type: "IRI", fiboProp: "fibo:hasAccountHolder" },
      { name: "accountType", type: "string", fiboProp: "fibo:hasAccountType" },
    ],
    shaclConstraints: [
      "sh:property requires fibo:hasAccountHolder",
      "sh:minCount 1 on account identifier",
    ],
    relatedConcepts: ["LegalEntity", "Position", "MonetaryAmount"],
    mappedTables: ["finance.accounts", "trading.positions"],
  },
  {
    id: "position",
    name: "Position",
    fiboClass: "fibo:Position",
    definition: "A holding of a financial instrument in an account at a point in time, representing the current state of ownership or obligation.",
    parentClass: "fibo:Holding",
    properties: [
      { name: "positionIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "heldInstrument", type: "IRI", fiboProp: "fibo:holdsInstrument" },
      { name: "quantity", type: "decimal", fiboProp: "fibo:hasQuantity" },
      { name: "valuationDate", type: "date", fiboProp: "fibo:hasValuationDate" },
    ],
    shaclConstraints: [
      "sh:property requires fibo:holdsInstrument",
      "sh:minCount 0 on quantity (allows short positions)",
    ],
    relatedConcepts: ["Account", "FinancialInstrument", "MonetaryAmount", "Quantity"],
    mappedTables: ["trading.positions", "risk.exposures"],
  },
  {
    id: "market",
    name: "Market",
    fiboClass: "fibo:Market",
    definition: "A venue or mechanism where financial instruments are traded, including exchanges, alternative trading venues, and over-the-counter markets.",
    parentClass: "fibo:Organization",
    properties: [
      { name: "marketIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "marketType", type: "string", fiboProp: "fibo:hasMarketType" },
      { name: "operatingHours", type: "string", fiboProp: "fibo:hasOperatingHours" },
    ],
    shaclConstraints: [
      "sh:in (Exchange, ECN, OTC, DarkPool) on market type",
    ],
    relatedConcepts: ["Trade", "FinancialInstrument"],
    mappedTables: ["trading.exchanges", "trading.venues"],
  },
];

// ── Knowledge View (Neo4j Enterprise Semantic Graph) ──

export type SemanticConcept = {
  id: string;
  name: string;
  fiboClass: string;
  description: string;
  hierarchy: string[];
  relationships: { label: string; target: string; count: string }[];
  properties: { name: string; type: string; fiboProp: string }[];
  instances: string;
  coverage: number;
  provenance: {
    origin: string;
    createdBy: string;
    approvedBy: string;
    confidence: number;
    lastSynced: string;
  };
  validation: {
    passed: { rule: string }[];
    failed: { rule: string; detail: string }[];
    warnings: { rule: string; detail: string }[];
  };
  quality: { completeness: number; consistency: number; shacl: number; freshness: number; trust: number };
  aiInsights: string[];
  sampleInstances: { id: string; counterparty: string; instrument: string; amount: string }[];
  dataSources: { system: string; mappingCount: number; mappings: { table: string; status: "complete" | "partial" | "candidate"; columns: number }[] }[];
  aiQueries: string[];
  lineage: { source: string; step: string; detail: string }[];
  history: { user: string; action: string; timestamp: string }[];
};

export const semanticConcepts: SemanticConcept[] = [
  {
    id: "trade",
    name: "Trade",
    fiboClass: "fibo:Trade",
    description: "A transaction involving the exchange of financial instruments between two parties, typically executed on a trading venue or bilaterally.",
    hierarchy: ["Thing", "Entity", "Transaction", "FinancialTransaction", "Trade"],
    relationships: [
      { label: "TRADED_IN", target: "Instrument", count: "12M" },
      { label: "HAS_COUNTERPARTY", target: "LegalEntity", count: "642K" },
      { label: "EXECUTED_ON", target: "Market", count: "8M" },
      { label: "SETTLED_BY", target: "Settlement", count: "7M" },
      { label: "CREATES", target: "Position", count: "14M" },
    ],
    properties: [
      { name: "tradeIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "executionDateTime", type: "dateTime", fiboProp: "fibo:hasExecutionDate" },
      { name: "tradeAmount", type: "decimal", fiboProp: "fibo:hasMonetaryAmount" },
      { name: "settlementDate", type: "date", fiboProp: "fibo:hasSettlementDate" },
      { name: "tradeCurrency", type: "string", fiboProp: "fibo:hasCurrency" },
      { name: "tradeStatus", type: "string", fiboProp: "fibo:hasStatus" },
      { name: "executionVenue", type: "IRI", fiboProp: "fibo:executedOn" },
      { name: "reportingTimestamp", type: "dateTime", fiboProp: "fibo:reportedAt" },
    ],
    instances: "14.2M",
    coverage: 96,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 97,
      lastSynced: "2 hours ago",
    },
    validation: {
      passed: [
        { rule: "hasTradeIdentifier" },
        { rule: "hasCounterparty" },
        { rule: "hasMonetaryAmount" },
      ],
      failed: [
        { rule: "hasSettlementDate", detail: "1,247 instances missing settlement_date (0.009%)" },
      ],
      warnings: [
        { rule: "hasExecutionVenue", detail: "3,891 OTC trades have null execution venue" },
        { rule: "hasReportingTimestamp", detail: "842 legacy trades pre-2018 lack reporting timestamp" },
      ],
    },
    quality: { completeness: 98, consistency: 96, shacl: 99, freshness: 94, trust: 96 },
    aiInsights: [
      "Trade is connected to Instrument because 98% of finance.trades rows contain instrument_id. This mapping was inferred from FIBO and approved by the ontology engineer.",
      "Confidence is high (97%) due to strong naming convention alignment and complete foreign key coverage across 3 source tables.",
      "1,247 instances fail SHACL validation for settlement_date. Consider adding a default settlement rule for OTC trades.",
      "Suggested improvement: Add a HAS_BROKER relationship to capture intermediary execution — currently inferred from executionVenue but not modeled semantically.",
    ],
    sampleInstances: [
      { id: "TRD-001", counterparty: "Goldman Sachs", instrument: "AAPL Equity", amount: "$2,500,000" },
      { id: "TRD-002", counterparty: "Morgan Stanley", instrument: "JPM Equity", amount: "$1,800,000" },
      { id: "TRD-003", counterparty: "Barclays", instrument: "US 10Y Treasury", amount: "$5,200,000" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 3,
        mappings: [
          { table: "finance.trades", status: "complete", columns: 21 },
          { table: "trading.executions", status: "complete", columns: 14 },
          { table: "trading.orders", status: "partial", columns: 7 },
        ],
      },
    ],
    aiQueries: [
      "What are all Apple trades?",
      "Show unsettled trades",
      "Find trades without counterparties",
      "Explain settlement failures",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.trades, trading.executions, trading.orders" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI Semantic Alignment v2 matched 28 columns to FIBO properties" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:Trade SHACL constraints" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 14.2M Trade nodes with 5 relationship types" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "John Smith", action: "Approved mapping (confidence 97%)", timestamp: "2024-01-15 11:15 AM" },
      { user: "Sarah Chen", action: "Added HAS_BROKER relationship suggestion", timestamp: "2024-01-16 2:30 PM" },
      { user: "Polanyi Works Agent", action: "Synced 15,000 new instances from Databricks", timestamp: "2 hours ago" },
    ],
  },
  {
    id: "instrument",
    name: "Instrument",
    fiboClass: "fibo:FinancialInstrument",
    description: "A tradable asset of any kind, representing a financial obligation or ownership interest.",
    hierarchy: ["Thing", "Entity", "Instrument", "FinancialInstrument"],
    relationships: [
      { label: "ISSUED_BY", target: "Issuer", count: "847K" },
      { label: "TRADED_IN", target: "Trade", count: "12M" },
      { label: "HELD_IN", target: "Position", count: "42M" },
      { label: "LISTED_ON", target: "Market", count: "234K" },
    ],
    properties: [
      { name: "instrumentIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "instrumentType", type: "string", fiboProp: "fibo:hasInstrumentType" },
      { name: "issuer", type: "IRI", fiboProp: "fibo:hasIssuer" },
      { name: "faceValue", type: "decimal", fiboProp: "fibo:hasFaceValue" },
      { name: "currency", type: "string", fiboProp: "fibo:hasCurrency" },
      { name: "maturityDate", type: "date", fiboProp: "fibo:hasMaturityDate" },
    ],
    instances: "847K",
    coverage: 94,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 94,
      lastSynced: "2 hours ago",
    },
    validation: {
      passed: [{ rule: "hasIdentifier" }, { rule: "hasInstrumentType" }],
      failed: [],
      warnings: [{ rule: "hasMaturityDate", detail: "Equity instruments have null maturity (expected)" }],
    },
    quality: { completeness: 95, consistency: 98, shacl: 100, freshness: 92, trust: 96 },
    aiInsights: [
      "Instrument maps to 3 Databricks tables (instruments, equities, bonds) with 34 columns aligned to FIBO properties.",
      "Instrument type distribution: 62% Equity, 28% Bond, 8% Derivative, 2% FX.",
    ],
    sampleInstances: [
      { id: "INS-42", counterparty: "Apple Inc.", instrument: "AAPL Equity", amount: "$178.50" },
      { id: "INS-18", counterparty: "JPMorgan Chase", instrument: "JPM Equity", amount: "$92.30" },
      { id: "INS-07", counterparty: "US Treasury", instrument: "US 10Y Bond", amount: "$98.75" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 3,
        mappings: [
          { table: "finance.instruments", status: "complete", columns: 18 },
          { table: "finance.equities", status: "complete", columns: 12 },
          { table: "finance.bonds", status: "partial", columns: 8 },
        ],
      },
    ],
    aiQueries: [
      "Show all equity instruments",
      "Find bonds maturing in 2025",
      "Which instruments have no issuer?",
      "Compare AAPL vs MSFT trading volume",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.instruments, finance.equities, finance.bonds" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 34 columns to FIBO properties" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:FinancialInstrument SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 847K Instrument nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "John Smith", action: "Approved mapping (confidence 94%)", timestamp: "2024-01-15 11:20 AM" },
    ],
  },
  {
    id: "counterparty",
    name: "Counterparty",
    fiboClass: "fibo:LegalEntity",
    description: "A legal person or organizational entity that can enter into contracts and conduct business.",
    hierarchy: ["Thing", "Entity", "BusinessEntity", "LegalEntity"],
    relationships: [
      { label: "HAS_COUNTERPARTY", target: "Trade", count: "642K" },
      { label: "OWNS", target: "Account", count: "89K" },
      { label: "DOMICILED_IN", target: "Country", count: "642K" },
    ],
    properties: [
      { name: "legalEntityIdentifier", type: "string", fiboProp: "fibo:hasLEI" },
      { name: "legalName", type: "string", fiboProp: "fibo:hasLegalName" },
      { name: "domicileCountry", type: "string", fiboProp: "fibo:hasDomicile" },
      { name: "entityType", type: "string", fiboProp: "fibo:hasEntityType" },
    ],
    instances: "12.4K",
    coverage: 91,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "Sarah Chen (Data Engineering)",
      confidence: 91,
      lastSynced: "5 hours ago",
    },
    validation: {
      passed: [{ rule: "hasLegalName" }, { rule: "hasEntityType" }],
      failed: [{ rule: "hasLEI", detail: "2,103 counterparties missing LEI (17%)" }],
      warnings: [{ rule: "hasDomicile", detail: "847 counterparties have country code but no full domicile" }],
    },
    quality: { completeness: 83, consistency: 91, shacl: 85, freshness: 88, trust: 87 },
    aiInsights: [
      "17% of counterparty instances are missing Legal Entity Identifiers (LEI). This affects regulatory reporting compliance.",
      "Counterparty overlaps with Customer concept — 3,847 entities appear in both crm.customers and finance.counterparties.",
    ],
    sampleInstances: [
      { id: "CP-01", counterparty: "Goldman Sachs", instrument: "—", amount: "—" },
      { id: "CP-02", counterparty: "Morgan Stanley", instrument: "—", amount: "—" },
      { id: "CP-03", counterparty: "Barclays", instrument: "—", amount: "—" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "finance.counterparties", status: "complete", columns: 18 }],
      },
    ],
    aiQueries: [
      "Show all counterparties without LEI",
      "Find counterparties domiciled in high-risk jurisdictions",
      "Which counterparties have exposure above $5M?",
      "List counterparties that are also customers",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.counterparties" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 18 columns to FIBO LegalEntity" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:LegalEntity SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 12.4K Counterparty nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "Sarah Chen", action: "Approved mapping (confidence 91%)", timestamp: "2024-01-15 3:45 PM" },
    ],
  },
  {
    id: "customer",
    name: "Customer",
    fiboClass: "fibo:LegalEntity",
    description: "A legal entity that maintains a business relationship with the organization, typically holding accounts and executing trades.",
    hierarchy: ["Thing", "Entity", "BusinessEntity", "LegalEntity", "Customer"],
    relationships: [
      { label: "OWNS", target: "Account", count: "5.8M" },
      { label: "PARTY_TO", target: "Trade", count: "8M" },
    ],
    properties: [
      { name: "customerIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "customerName", type: "string", fiboProp: "fibo:hasLegalName" },
      { name: "customerType", type: "string", fiboProp: "fibo:hasEntityType" },
      { name: "onboardingDate", type: "date", fiboProp: "fibo:hasStartDate" },
    ],
    instances: "3.1M",
    coverage: 88,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "Sarah Chen (Data Engineering)",
      confidence: 88,
      lastSynced: "5 hours ago",
    },
    validation: {
      passed: [{ rule: "hasIdentifier" }, { rule: "hasLegalName" }],
      failed: [],
      warnings: [{ rule: "hasEntityType", detail: "1.2M records use free-text type instead of enum" }],
    },
    quality: { completeness: 92, consistency: 78, shacl: 100, freshness: 90, trust: 88 },
    aiInsights: [
      "Customer is a subclass of LegalEntity. 3,847 customers also appear as counterparties in finance.counterparties.",
      "Customer type field has low consistency (78%) due to free-text values in the source CRM system.",
    ],
    sampleInstances: [
      { id: "CUS-001", counterparty: "Acme Corp", instrument: "—", amount: "—" },
      { id: "CUS-002", counterparty: "Globex Inc", instrument: "—", amount: "—" },
      { id: "CUS-003", counterparty: "Initech LLC", instrument: "—", amount: "—" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "crm.customers", status: "complete", columns: 22 }],
      },
    ],
    aiQueries: [
      "Show customers with multiple accounts",
      "Find customers onboarded in the last 30 days",
      "Which customers also appear as counterparties?",
      "List customers with missing entity type",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "crm.customers" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 22 columns to FIBO LegalEntity properties" },
      { source: "GraphDB", step: "Ontology", detail: "Validated as subclass of fibo:LegalEntity" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 3.1M Customer nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "Sarah Chen", action: "Approved as LegalEntity subclass", timestamp: "2024-01-15 4:10 PM" },
    ],
  },
  {
    id: "account",
    name: "Account",
    fiboClass: "fibo:Account",
    description: "A record of financial transactions between parties, representing a contractual relationship for holding assets or tracking obligations.",
    hierarchy: ["Thing", "Entity", "Contract", "Account"],
    relationships: [
      { label: "OWNED_BY", target: "Customer", count: "5.8M" },
      { label: "HOLDS", target: "Position", count: "42M" },
    ],
    properties: [
      { name: "accountIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "accountHolder", type: "IRI", fiboProp: "fibo:hasAccountHolder" },
      { name: "accountType", type: "string", fiboProp: "fibo:hasAccountType" },
      { name: "openDate", type: "date", fiboProp: "fibo:hasStartDate" },
      { name: "status", type: "string", fiboProp: "fibo:hasStatus" },
    ],
    instances: "5.8M",
    coverage: 90,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 90,
      lastSynced: "2 hours ago",
    },
    validation: {
      passed: [{ rule: "hasIdentifier" }, { rule: "hasAccountHolder" }],
      failed: [],
      warnings: [{ rule: "hasStatus", detail: "12K accounts have null status (legacy migration)" }],
    },
    quality: { completeness: 94, consistency: 95, shacl: 100, freshness: 96, trust: 95 },
    aiInsights: [
      "Account is held by Customer (5.8M) and holds Positions (42M). The account-customer relationship is fully mapped.",
      "12K legacy accounts have null status. Consider a data remediation task to classify these as 'dormant' or 'closed'.",
    ],
    sampleInstances: [
      { id: "ACC-1", counterparty: "Goldman Sachs", instrument: "—", amount: "$2.4M" },
      { id: "ACC-2", counterparty: "Morgan Stanley", instrument: "—", amount: "$1.8M" },
      { id: "ACC-3", counterparty: "Barclays", instrument: "—", amount: "$3.2M" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "finance.accounts", status: "complete", columns: 15 }],
      },
    ],
    aiQueries: [
      "Show accounts with zero balance",
      "Find dormant accounts (no trades in 90 days)",
      "Which accounts hold AAPL positions?",
      "List accounts by total exposure",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.accounts" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 15 columns to FIBO Account" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:Account SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 5.8M Account nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "John Smith", action: "Approved mapping (confidence 90%)", timestamp: "2024-01-15 11:30 AM" },
    ],
  },
  {
    id: "position",
    name: "Position",
    fiboClass: "fibo:Position",
    description: "A holding of a financial instrument in an account at a point in time, representing the current state of ownership or obligation.",
    hierarchy: ["Thing", "Entity", "Holding", "Position"],
    relationships: [
      { label: "HELD_IN", target: "Account", count: "42M" },
      { label: "REFERENCES", target: "Instrument", count: "42M" },
      { label: "CREATED_BY", target: "Trade", count: "14M" },
    ],
    properties: [
      { name: "positionIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "heldInstrument", type: "IRI", fiboProp: "fibo:holdsInstrument" },
      { name: "quantity", type: "decimal", fiboProp: "fibo:hasQuantity" },
      { name: "valuationDate", type: "date", fiboProp: "fibo:hasValuationDate" },
      { name: "markToMarket", type: "decimal", fiboProp: "fibo:hasMonetaryAmount" },
    ],
    instances: "42.7M",
    coverage: 95,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 95,
      lastSynced: "1 hour ago",
    },
    validation: {
      passed: [{ rule: "holdsInstrument" }, { rule: "heldInAccount" }],
      failed: [],
      warnings: [{ rule: "hasValuationDate", detail: "8M positions have stale valuation dates (>7 days)" }],
    },
    quality: { completeness: 97, consistency: 93, shacl: 100, freshness: 85, trust: 94 },
    aiInsights: [
      "Position is the largest node set (42.7M instances). It connects Accounts to Instruments.",
      "8M positions have stale valuations. Consider scheduling a nightly MTM refresh job.",
    ],
    sampleInstances: [
      { id: "POS-01", counterparty: "Goldman Sachs", instrument: "AAPL Equity", amount: "$1.78M" },
      { id: "POS-02", counterparty: "Morgan Stanley", instrument: "JPM Equity", amount: "$461K" },
      { id: "POS-03", counterparty: "Barclays", instrument: "US 10Y Treasury", amount: "$5.2M" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 2,
        mappings: [
          { table: "trading.positions", status: "complete", columns: 19 },
          { table: "risk.exposures", status: "partial", columns: 8 },
        ],
      },
    ],
    aiQueries: [
      "Show all AAPL positions",
      "Find positions with stale valuations",
      "Which accounts have the largest short positions?",
      "Calculate total exposure by instrument type",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "trading.positions, risk.exposures" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 27 columns to FIBO Position" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:Position SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 42.7M Position nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "John Smith", action: "Approved mapping (confidence 95%)", timestamp: "2024-01-15 11:35 AM" },
      { user: "Polanyi Works Agent", action: "Synced 2.1M new positions", timestamp: "1 hour ago" },
    ],
  },
  {
    id: "issuer",
    name: "Issuer",
    fiboClass: "fibo:LegalEntity",
    description: "An entity that issues financial instruments, creating obligations or ownership rights.",
    hierarchy: ["Thing", "Entity", "BusinessEntity", "LegalEntity", "Issuer"],
    relationships: [
      { label: "ISSUES", target: "Instrument", count: "847K" },
      { label: "LOCATED_IN", target: "Country", count: "8.9K" },
    ],
    properties: [
      { name: "issuerIdentifier", type: "string", fiboProp: "fibo:hasLEI" },
      { name: "legalName", type: "string", fiboProp: "fibo:hasLegalName" },
      { name: "domicile", type: "string", fiboProp: "fibo:hasDomicile" },
    ],
    instances: "8.9K",
    coverage: 89,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 89,
      lastSynced: "2 hours ago",
    },
    validation: {
      passed: [{ rule: "hasLegalName" }],
      failed: [],
      warnings: [{ rule: "hasLEI", detail: "1,203 issuers missing LEI" }],
    },
    quality: { completeness: 87, consistency: 94, shacl: 100, freshness: 92, trust: 91 },
    aiInsights: [
      "Issuer is a subclass of LegalEntity, specifically those that issue financial instruments.",
      "1,203 issuers are missing LEI codes, which may affect instrument traceability.",
    ],
    sampleInstances: [
      { id: "ISS-01", counterparty: "Apple Inc.", instrument: "AAPL Equity", amount: "—" },
      { id: "ISS-02", counterparty: "JPMorgan Chase", instrument: "JPM Equity", amount: "—" },
      { id: "ISS-03", counterparty: "US Treasury", instrument: "US 10Y Bond", amount: "—" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "finance.issuers", status: "complete", columns: 14 }],
      },
    ],
    aiQueries: [
      "Show all issuers without LEI",
      "Find issuers of equity instruments",
      "Which issuers are domiciled in the EU?",
      "List issuers by number of outstanding instruments",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.issuers" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 14 columns to FIBO LegalEntity" },
      { source: "GraphDB", step: "Ontology", detail: "Validated as subclass of fibo:LegalEntity" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 8.9K Issuer nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "John Smith", action: "Approved as LegalEntity subclass", timestamp: "2024-01-15 11:40 AM" },
    ],
  },
  {
    id: "settlement",
    name: "Settlement",
    fiboClass: "fibo:Settlement",
    description: "The process of fulfilling a trade through delivery of instruments and payment of funds.",
    hierarchy: ["Thing", "Entity", "Process", "Settlement"],
    relationships: [
      { label: "SETTLES", target: "Trade", count: "13.8M" },
    ],
    properties: [
      { name: "settlementIdentifier", type: "string", fiboProp: "fibo:hasIdentifier" },
      { name: "settlementDate", type: "date", fiboProp: "fibo:hasSettlementDate" },
      { name: "settlementStatus", type: "string", fiboProp: "fibo:hasStatus" },
      { name: "settlementAmount", type: "decimal", fiboProp: "fibo:hasMonetaryAmount" },
    ],
    instances: "13.8M",
    coverage: 87,
    provenance: {
      origin: "AI Semantic Alignment v2",
      createdBy: "Polanyi Works Agent",
      approvedBy: "Sarah Chen (Data Engineering)",
      confidence: 87,
      lastSynced: "3 hours ago",
    },
    validation: {
      passed: [{ rule: "hasIdentifier" }, { rule: "hasSettlementDate" }],
      failed: [{ rule: "hasSettlementStatus", detail: "1,247 settlements missing status" }],
      warnings: [],
    },
    quality: { completeness: 91, consistency: 88, shacl: 90, freshness: 89, trust: 89 },
    aiInsights: [
      "Settlement has 87% coverage — 13% of trades do not have corresponding settlement records, which may indicate failed settlements.",
      "1,247 settlements are missing status. This affects settlement failure reporting.",
    ],
    sampleInstances: [
      { id: "SET-001", counterparty: "Goldman Sachs", instrument: "AAPL Equity", amount: "$2.5M" },
      { id: "SET-002", counterparty: "Morgan Stanley", instrument: "JPM Equity", amount: "$1.8M" },
      { id: "SET-003", counterparty: "Barclays", instrument: "US 10Y Treasury", amount: "$5.2M" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "finance.settlements", status: "complete", columns: 12 }],
      },
    ],
    aiQueries: [
      "Show failed settlements",
      "Find trades without settlements",
      "Which settlements are overdue?",
      "Calculate settlement failure rate by counterparty",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "finance.settlements" },
      { source: "Mapping Engine", step: "Alignment", detail: "AI matched 12 columns to FIBO Settlement" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:Settlement SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 13.8M Settlement nodes" },
    ],
    history: [
      { user: "Polanyi Works Agent", action: "Created concept from AI alignment", timestamp: "2024-01-15 10:42 AM" },
      { user: "Sarah Chen", action: "Approved mapping (confidence 87%)", timestamp: "2024-01-15 4:20 PM" },
    ],
  },
  {
    id: "country",
    name: "Country",
    fiboClass: "fibo:Country",
    description: "A geopolitical entity representing a sovereign state or territory.",
    hierarchy: ["Thing", "Place", "Country"],
    relationships: [
      { label: "DOMICILE_OF", target: "Counterparty", count: "642K" },
      { label: "LOCATED_IN", target: "Issuer", count: "8.9K" },
    ],
    properties: [
      { name: "countryCode", type: "string", fiboProp: "fibo:hasCountryCode" },
      { name: "countryName", type: "string", fiboProp: "fibo:hasName" },
      { name: "region", type: "string", fiboProp: "fibo:inRegion" },
    ],
    instances: "249",
    coverage: 100,
    provenance: {
      origin: "Reference Data Import",
      createdBy: "Data Engineering Team",
      approvedBy: "John Smith (Ontology Team)",
      confidence: 100,
      lastSynced: "1 day ago",
    },
    validation: {
      passed: [{ rule: "hasCountryCode" }, { rule: "hasName" }],
      failed: [],
      warnings: [],
    },
    quality: { completeness: 100, consistency: 100, shacl: 100, freshness: 98, trust: 100 },
    aiInsights: [
      "Country is a reference data concept with 100% data quality. All 249 countries are mapped.",
      "Country is connected to both Counterparty (domicile) and Issuer (location).",
    ],
    sampleInstances: [
      { id: "US", counterparty: "United States", instrument: "—", amount: "—" },
      { id: "GB", counterparty: "United Kingdom", instrument: "—", amount: "—" },
      { id: "JP", counterparty: "Japan", instrument: "—", amount: "—" },
    ],
    dataSources: [
      {
        system: "Databricks",
        mappingCount: 1,
        mappings: [{ table: "ref.countries", status: "complete", columns: 6 }],
      },
    ],
    aiQueries: [
      "Show all countries in the EU",
      "Find counterparties domiciled in high-risk countries",
      "Which countries have the most issuers?",
      "List countries by total trade volume",
    ],
    lineage: [
      { source: "Databricks", step: "Source", detail: "ref.countries" },
      { source: "Mapping Engine", step: "Alignment", detail: "Direct reference data import" },
      { source: "GraphDB", step: "Ontology", detail: "Validated against fibo:Country SHACL" },
      { source: "Neo4j", step: "Knowledge Graph", detail: "Created 249 Country nodes" },
    ],
    history: [
      { user: "Data Engineering Team", action: "Imported reference data", timestamp: "2024-01-10 9:00 AM" },
      { user: "John Smith", action: "Approved as reference concept", timestamp: "2024-01-10 10:15 AM" },
    ],
  },
];

// ── Knowledge Graph View (Visual Canvas) ──

export type GraphNode = {
  id: string;
  label: string;
  fiboClass: string;
  x: number;
  y: number;
  type: "concept" | "entity" | "data";
  confidence: number;
  tables: string[];
  sampleData: Record<string, string>[];
  sparql: string;
  cypher: string;
  definition: string;
};

export type GraphEdge = {
  from: string;
  to: string;
  label: string;
};

export const graphNodes: GraphNode[] = [
  {
    id: "trade",
    label: "Trade",
    fiboClass: "fibo:Trade",
    x: 150,
    y: 80,
    type: "concept",
    confidence: 97,
    tables: ["finance.trades", "trading.orders"],
    sampleData: [
      { trade_id: "TRD-001", instrument_id: "INS-42", quantity: "1,000", price: "178.50" },
      { trade_id: "TRD-002", instrument_id: "INS-18", quantity: "500", price: "92.30" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?trade WHERE { ?trade a fibo:Trade . }",
    cypher: "(:Trade)-[:EXECUTED_ON]->(:TradingVenue)\n(:Trade)-[:TRADES_IN]->(:FinancialInstrument)",
    definition: "A transaction involving the exchange of financial instruments between two parties.",
  },
  {
    id: "instrument",
    label: "Instrument",
    fiboClass: "fibo:FinancialInstrument",
    x: 400,
    y: 160,
    type: "concept",
    confidence: 94,
    tables: ["finance.instruments", "finance.equities"],
    sampleData: [
      { instrument_id: "INS-42", ticker: "AAPL", type: "Equity", issuer: "Apple Inc." },
      { instrument_id: "INS-18", ticker: "JPM", type: "Equity", issuer: "JPMorgan Chase" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?inst WHERE { ?inst a fibo:FinancialInstrument . }",
    cypher: "(:FinancialInstrument)-[:ISSUED_BY]->(:LegalEntity)\n(:Trade)-[:TRADES_IN]->(:FinancialInstrument)",
    definition: "A tradable asset of any kind, representing a financial obligation or ownership interest.",
  },
  {
    id: "counterparty",
    label: "Counterparty",
    fiboClass: "fibo:LegalEntity",
    x: 150,
    y: 280,
    type: "entity",
    confidence: 91,
    tables: ["finance.counterparties"],
    sampleData: [
      { cp_id: "CP-01", name: "Goldman Sachs", type: "Bank", country: "US" },
      { cp_id: "CP-02", name: "Morgan Stanley", type: "Bank", country: "US" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?entity WHERE { ?entity a fibo:LegalEntity . }",
    cypher: "(:Trade)-[:COUNTERPARTY]->(:LegalEntity)\n(:LegalEntity)-[:DOMICILED_IN]->(:Country)",
    definition: "A legal person or organizational entity that can enter into contracts and conduct business.",
  },
  {
    id: "issuer",
    label: "Issuer",
    fiboClass: "fibo:LegalEntity",
    x: 400,
    y: 340,
    type: "entity",
    confidence: 91,
    tables: ["finance.issuers"],
    sampleData: [
      { issuer_id: "ISS-01", name: "Apple Inc.", country: "US", lei: "HWUPKR0DCO3ESFSQ2B45" },
      { issuer_id: "ISS-02", name: "JPMorgan Chase", country: "US", lei: "7H6VUQZ6BB5NQXMRJX34" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?issuer WHERE { ?issuer a fibo:Issuer . }",
    cypher: "(:FinancialInstrument)-[:ISSUED_BY]->(:Issuer)\n(:Issuer)-[:LOCATED_IN]->(:Country)",
    definition: "An entity that issues financial instruments, creating obligations or ownership rights.",
  },
  {
    id: "position",
    label: "Position",
    fiboClass: "fibo:Position",
    x: 150,
    y: 480,
    type: "concept",
    confidence: 95,
    tables: ["trading.positions", "risk.exposures"],
    sampleData: [
      { pos_id: "POS-01", account_id: "ACC-1", instrument_id: "INS-42", quantity: "10,000" },
      { pos_id: "POS-02", account_id: "ACC-2", instrument_id: "INS-18", quantity: "-5,000" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?pos WHERE { ?pos a fibo:Position . }",
    cypher: "(:Position)-[:HELD_IN]->(:Account)\n(:Position)-[:HOLDS]->(:FinancialInstrument)",
    definition: "A holding of a financial instrument in an account at a point in time.",
  },
  {
    id: "account",
    label: "Account",
    fiboClass: "fibo:Account",
    x: 400,
    y: 500,
    type: "concept",
    confidence: 90,
    tables: ["finance.accounts"],
    sampleData: [
      { account_id: "ACC-1", holder: "Goldman Sachs", type: "Trading", balance: "2.4M" },
      { account_id: "ACC-2", holder: "Morgan Stanley", type: "Trading", balance: "1.8M" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?acc WHERE { ?acc a fibo:Account . }",
    cypher: "(:Account)-[:HELD_BY]->(:LegalEntity)\n(:Position)-[:HELD_IN]->(:Account)",
    definition: "A record of financial transactions between parties, representing a contractual relationship.",
  },
  {
    id: "country",
    label: "Country",
    fiboClass: "fibo:Country",
    x: 650,
    y: 420,
    type: "data",
    confidence: 99,
    tables: ["ref.countries"],
    sampleData: [
      { country_code: "US", name: "United States", region: "North America" },
      { country_code: "GB", name: "United Kingdom", region: "Europe" },
    ],
    sparql: "PREFIX fibo: <https://spec.edmcouncil.org/fibo/>\nSELECT ?country WHERE { ?country a fibo:Country . }",
    cypher: "(:LegalEntity)-[:DOMICILED_IN]->(:Country)",
    definition: "A geopolitical entity representing a sovereign state or territory.",
  },
];

export const graphEdges: GraphEdge[] = [
  { from: "trade", to: "instrument", label: "trades_in" },
  { from: "trade", to: "counterparty", label: "has_counterparty" },
  { from: "instrument", to: "issuer", label: "issued_by" },
  { from: "position", to: "instrument", label: "holds" },
  { from: "position", to: "account", label: "held_in" },
  { from: "account", to: "counterparty", label: "held_by" },
  { from: "issuer", to: "country", label: "located_in" },
  { from: "counterparty", to: "country", label: "domiciled_in" },
];