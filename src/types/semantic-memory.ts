export type SemanticMemoryProviderId = "local" | "pgvector";

export interface SemanticMemoryPgvectorConfig {
  enabled: boolean;
  connectionString: string;
  schema: string;
  table: string;
  embeddingModel: string;
  dimensions: number;
}

export interface SemanticMemoryConfig {
  providerId: SemanticMemoryProviderId;
  autoRecallProjectMemories: boolean;
  autoRecallDeskNotes: boolean;
  autoRecallKnowledgeDocs: boolean;
  pgvector: SemanticMemoryPgvectorConfig;
}

export interface SemanticKnowledgeDocument {
  id: string;
  projectId: string | null;
  rootPath: string | null;
  createdAt: number;
  updatedAt: number;
  title: string;
  content: string;
  tags: string[];
  sourceLabel: string;
  systemManaged?: boolean;
  manualInjectable?: boolean;
}
