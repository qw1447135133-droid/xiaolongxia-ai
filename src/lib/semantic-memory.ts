import type { WorkspaceDeskNote, WorkspaceProjectMemory } from "@/types/desktop-workspace";
import { resolveBackendUrl } from "@/lib/backend-url";
import type {
  SemanticKnowledgeDocument,
  SemanticMemoryConfig,
  SemanticMemoryProviderId,
} from "@/types/semantic-memory";
import type { ModelProvider } from "@/store/types";

export interface SemanticMemorySearchContext {
  query?: string;
  workspaceRoot?: string | null;
  workspaceCurrentPath?: string | null;
  activePreviewPath?: string | null;
  pinnedPaths?: string[];
  recentTranscript?: string;
}

export type SemanticMemoryKind = "project-memory" | "desk-note" | "knowledge-doc";

export interface SemanticMemoryDocument<TItem> {
  id: string;
  kind: SemanticMemoryKind;
  title: string;
  content: string;
  rootPath: string | null;
  focusPath?: string | null;
  linkedPaths: string[];
  updatedAt: number;
  item: TItem;
}

export interface SemanticMemorySearchResult<TItem> {
  document: SemanticMemoryDocument<TItem>;
  score: number;
  reasons: string[];
}

export interface SemanticMemoryProvider {
  id: SemanticMemoryProviderId;
  search<TItem>(
    documents: SemanticMemoryDocument<TItem>[],
    context: SemanticMemorySearchContext,
    limit?: number,
  ): SemanticMemorySearchResult<TItem>[];
}

export interface SemanticMemorySearchOptions {
  limit?: number;
  provider?: SemanticMemoryProvider;
}

export interface SemanticMemoryAsyncSearchOptions extends SemanticMemorySearchOptions {
  config?: SemanticMemoryConfig;
  providers?: ModelProvider[];
}

function normalizePath(path: string | null | undefined) {
  return (path ?? "").replace(/\\/g, "/").toLowerCase();
}

function tokenize(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fa5/_\-.]+/i)
      .map(token => token.trim())
      .filter(token => token.length >= 2),
  );
}

function countIntersection(left: Set<string>, right: Set<string>) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

class LexicalSemanticMemoryProvider implements SemanticMemoryProvider {
  id: SemanticMemoryProviderId = "local";
  search<TItem>(
    documents: SemanticMemoryDocument<TItem>[],
    context: SemanticMemorySearchContext,
    limit = 3,
  ) {
    const queryTokens = new Set([
      ...tokenize(context.query),
      ...tokenize(context.recentTranscript),
      ...tokenize(context.workspaceCurrentPath),
      ...tokenize(context.activePreviewPath),
    ]);
    const workspaceRoot = normalizePath(context.workspaceRoot);
    const workspaceCurrentPath = normalizePath(context.workspaceCurrentPath);
    const activePreviewPath = normalizePath(context.activePreviewPath);
    const pinnedPaths = (context.pinnedPaths ?? []).map(path => normalizePath(path));

    return documents
      .map(document => {
        const reasons: string[] = [];
        let score = 0;

        const documentRoot = normalizePath(document.rootPath);
        const documentFocusPath = normalizePath(document.focusPath);
        const linkedPaths = document.linkedPaths.map(path => normalizePath(path));

        if (documentRoot && workspaceRoot && documentRoot === workspaceRoot) {
          score += 12;
          reasons.push("same root");
        } else if (documentRoot && workspaceCurrentPath && workspaceCurrentPath.startsWith(documentRoot)) {
          score += 8;
          reasons.push("current path under root");
        }

        if (documentFocusPath && activePreviewPath && documentFocusPath === activePreviewPath) {
          score += 8;
          reasons.push("same focus file");
        } else if (documentFocusPath && activePreviewPath && activePreviewPath.startsWith(documentFocusPath)) {
          score += 5;
          reasons.push("focus overlap");
        }

        const pinnedOverlap = linkedPaths.filter(path => pinnedPaths.includes(path)).length;
        if (pinnedOverlap > 0) {
          score += pinnedOverlap * 4;
          reasons.push(`${pinnedOverlap} pinned refs overlap`);
        }

        const documentTokens = new Set([
          ...tokenize(document.title),
          ...tokenize(document.content),
          ...tokenize(document.rootPath),
          ...tokenize(document.focusPath),
          ...linkedPaths.flatMap(path => Array.from(tokenize(path))),
        ]);
        const tokenHits = countIntersection(queryTokens, documentTokens);
        if (tokenHits > 0) {
          score += Math.min(tokenHits, 8) * 2;
          reasons.push(`${tokenHits} shared keywords`);
        }

        const recencyBoost = Math.max(0, 6 - Math.floor((Date.now() - document.updatedAt) / (1000 * 60 * 60 * 24)));
        if (recencyBoost > 0) {
          score += recencyBoost;
          reasons.push("recently updated");
        }

        return {
          document,
          score,
          reasons,
        } satisfies SemanticMemorySearchResult<TItem>;
      })
      .filter(item => item.score > 0)
      .sort((left, right) => right.score - left.score || right.document.updatedAt - left.document.updatedAt)
      .slice(0, limit);
  }
}

class PgvectorSemanticMemoryProvider implements SemanticMemoryProvider {
  id: SemanticMemoryProviderId = "pgvector";

  constructor(private readonly lexical = new LexicalSemanticMemoryProvider()) {}

  search<TItem>(
    documents: SemanticMemoryDocument<TItem>[],
    context: SemanticMemorySearchContext,
    limit = 3,
  ) {
    // Pgvector transport is not wired yet. Keep runtime behavior stable by
    // falling back to lexical ranking until a backend endpoint is introduced.
    return this.lexical.search(documents, context, limit).map(result => ({
      ...result,
      reasons: ["pgvector fallback", ...result.reasons],
    }));
  }
}

let defaultProvider: SemanticMemoryProvider = new LexicalSemanticMemoryProvider();

export function getDefaultSemanticMemoryProvider() {
  return defaultProvider;
}

export function registerSemanticMemoryProvider(provider: SemanticMemoryProvider) {
  defaultProvider = provider;
}

export function resetSemanticMemoryProvider() {
  defaultProvider = new LexicalSemanticMemoryProvider();
}

export function createSemanticMemoryProvider(config: SemanticMemoryConfig): SemanticMemoryProvider {
  if (config.providerId === "pgvector" && config.pgvector.enabled) {
    return new PgvectorSemanticMemoryProvider();
  }
  return new LexicalSemanticMemoryProvider();
}

export function getSemanticMemoryProviderStatus(config: SemanticMemoryConfig) {
  if (config.providerId === "local") {
    return {
      label: "本地检索",
      detail: "当前使用本地词法检索，适合单机工作台和开发阶段。",
      tone: "ready" as const,
    };
  }

  if (!config.pgvector.enabled) {
    return {
      label: "Pgvector 未启用",
      detail: "已选择 pgvector，但还没有启用后端配置，当前仍建议使用本地检索。",
      tone: "partial" as const,
    };
  }

  if (!config.pgvector.connectionString.trim()) {
    return {
      label: "Pgvector 待配置",
      detail: "连接串为空，当前还不能切到真实向量后端。",
      tone: "partial" as const,
    };
  }

  return {
    label: "Pgvector 已配置",
    detail: "配置已经录入；召回会优先尝试 pgvector，不可用时再回退到本地检索。",
    tone: "ready" as const,
  };
}

export function searchSemanticMemory<TItem>(
  documents: SemanticMemoryDocument<TItem>[],
  context: SemanticMemorySearchContext,
  options: SemanticMemorySearchOptions = {},
) {
  return (options.provider ?? defaultProvider).search(documents, context, options.limit);
}

export function resolveSemanticMemoryEmbeddingTransport(
  providers: ModelProvider[] | undefined,
  config: SemanticMemoryConfig | undefined,
) {
  const model = String(config?.pgvector?.embeddingModel || "").trim();
  if (!providers || !model) return null;

  const provider = providers.find(item => {
    const apiKey = String(item.apiKey || "").trim();
    const baseUrl = String(item.baseUrl || "").trim().toLowerCase();
    return apiKey && (item.id.startsWith("openai") || baseUrl.includes("api.openai.com"));
  });

  if (!provider) return null;
  return {
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    model,
  };
}

export async function searchSemanticMemoryAsync<TItem>(
  documents: SemanticMemoryDocument<TItem>[],
  context: SemanticMemorySearchContext,
  options: SemanticMemoryAsyncSearchOptions = {},
) {
  const config = options.config;
  const limit = options.limit ?? 3;
  if (!config || config.providerId !== "pgvector" || !config.pgvector.enabled || !config.pgvector.connectionString.trim()) {
    return searchSemanticMemory(documents, context, options);
  }

  try {
    const url = await resolveBackendUrl("/api/semantic-memory/query");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: config.pgvector,
        documents: documents.map(document => ({
          id: document.id,
          kind: document.kind,
          title: document.title,
          content: document.content,
          rootPath: document.rootPath,
          focusPath: document.focusPath,
          linkedPaths: document.linkedPaths,
          updatedAt: document.updatedAt,
        })),
        context,
        limit,
        embedding: resolveSemanticMemoryEmbeddingTransport(options.providers, config),
      }),
    });
    const payload = await response.json();
    if (!payload?.ok || !Array.isArray(payload?.results)) {
      throw new Error(payload?.error || "Semantic memory query failed.");
    }

    const documentMap = new Map(documents.map(document => [document.id, document]));
    return payload.results
      .map((item: { id: string; score: number; reasons?: string[] }) => {
        const document = documentMap.get(item.id);
        if (!document) return null;
        return {
          document,
          score: Number(item.score ?? 0),
          reasons: Array.isArray(item.reasons) ? item.reasons : [],
        } satisfies SemanticMemorySearchResult<TItem>;
      })
      .filter((item: SemanticMemorySearchResult<TItem> | null): item is SemanticMemorySearchResult<TItem> => Boolean(item));
  } catch {
    return searchSemanticMemory(documents, context, options).map((result: SemanticMemorySearchResult<TItem>) => ({
      ...result,
      reasons: ["pgvector unavailable", ...result.reasons],
    }));
  }
}

export function buildProjectMemoryDocument(memory: WorkspaceProjectMemory): SemanticMemoryDocument<WorkspaceProjectMemory> {
  return {
    id: memory.id,
    kind: "project-memory",
    title: memory.name,
    content: [
      memory.scratchpad,
      ...memory.previews.map(preview => `${preview.name} ${preview.path}`),
      ...memory.deskNotes.map(note => `${note.title}\n${note.content}`),
    ]
      .filter(Boolean)
      .join("\n\n"),
    rootPath: memory.rootPath,
    focusPath: memory.focusPath,
    linkedPaths: [
      ...memory.previews.map(preview => preview.path),
      ...memory.deskNotes.map(note => note.linkedPath).filter((value): value is string => Boolean(value)),
    ],
    updatedAt: memory.updatedAt,
    item: memory,
  };
}

export function buildDeskNoteDocument(note: WorkspaceDeskNote): SemanticMemoryDocument<WorkspaceDeskNote> {
  return {
    id: note.id,
    kind: "desk-note",
    title: note.title,
    content: note.content,
    rootPath: note.rootPath,
    focusPath: note.linkedPath,
    linkedPaths: note.linkedPath ? [note.linkedPath] : [],
    updatedAt: note.updatedAt,
    item: note,
  };
}

export function buildKnowledgeDocumentDocument(
  document: SemanticKnowledgeDocument,
): SemanticMemoryDocument<SemanticKnowledgeDocument> {
  return {
    id: document.id,
    kind: "knowledge-doc",
    title: document.title,
    content: document.content,
    rootPath: document.rootPath,
    linkedPaths: [],
    updatedAt: document.updatedAt,
    item: document,
  };
}
