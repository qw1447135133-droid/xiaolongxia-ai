import { Client } from "pg";
import OpenAI from "openai";
import { createHash } from "crypto";

function assertIdentifier(value, label) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`${label} 非法，只允许字母、数字和下划线，且不能以数字开头。`);
  }
  return normalized;
}

function toVectorLiteral(values) {
  return `[${values.map(value => Number.isFinite(value) ? Number(value).toFixed(8) : "0").join(",")}]`;
}

function normalizeVector(values, dimensions) {
  const next = Array.from({ length: dimensions }, (_, index) => Number(values[index] ?? 0));
  const magnitude = Math.sqrt(next.reduce((sum, value) => sum + value * value, 0)) || 1;
  return next.map(value => value / magnitude);
}

function hashTokenToIndex(token, dimensions) {
  const digest = createHash("sha256").update(token).digest();
  return digest.readUInt32BE(0) % dimensions;
}

function buildLocalHashEmbedding(text, dimensions) {
  const vector = Array.from({ length: dimensions }, () => 0);
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fa5/_\-.]+/i)
    .map(token => token.trim())
    .filter(token => token.length > 0);

  tokens.forEach((token, index) => {
    const bucket = hashTokenToIndex(`${token}:${index % 7}`, dimensions);
    vector[bucket] += 1;
  });

  return normalizeVector(vector, dimensions);
}

async function buildEmbedding(text, dimensions, embedding) {
  const model = String(embedding?.model || "").trim();
  const apiKey = String(embedding?.apiKey || "").trim();
  const baseUrl = String(embedding?.baseUrl || "").trim();

  if (!model || !apiKey) {
    return {
      vector: buildLocalHashEmbedding(text, dimensions),
      provider: "local-hash",
    };
  }

  try {
    const client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    const response = await client.embeddings.create({
      model,
      input: text,
    });
    const embeddingVector = Array.isArray(response.data?.[0]?.embedding) ? response.data[0].embedding : [];
    if (embeddingVector.length === 0) {
      throw new Error("Embedding response is empty.");
    }

    return {
      vector: normalizeVector(embeddingVector, dimensions),
      provider: model,
    };
  } catch {
    return {
      vector: buildLocalHashEmbedding(text, dimensions),
      provider: "local-hash",
    };
  }
}

function buildReasons(row, context, provider) {
  const reasons = [`${provider} similarity`];
  const workspaceRoot = String(context?.workspaceRoot || "").trim().toLowerCase();
  const activePreviewPath = String(context?.activePreviewPath || "").trim().toLowerCase();
  const pinnedPaths = Array.isArray(context?.pinnedPaths)
    ? context.pinnedPaths.map(item => String(item).trim().toLowerCase()).filter(Boolean)
    : [];

  if (workspaceRoot && String(row.root_path || "").trim().toLowerCase() === workspaceRoot) {
    reasons.push("same root");
  }
  if (activePreviewPath && String(row.focus_path || "").trim().toLowerCase() === activePreviewPath) {
    reasons.push("same focus file");
  }
  const linkedPaths = Array.isArray(row.linked_paths) ? row.linked_paths.map(item => String(item).toLowerCase()) : [];
  const pinnedOverlap = linkedPaths.filter(path => pinnedPaths.includes(path)).length;
  if (pinnedOverlap > 0) {
    reasons.push(`${pinnedOverlap} pinned refs overlap`);
  }
  return reasons;
}

async function withClient(connectionString, fn) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureStore(client, config) {
  const schema = assertIdentifier(config.schema || "public", "schema");
  const table = assertIdentifier(config.table || "semantic_memory_documents", "table");
  const dimensions = Number(config.dimensions || 1536);

  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.${table} (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      root_path TEXT NULL,
      focus_path TEXT NULL,
      linked_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at BIGINT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      embedding vector(${dimensions}) NOT NULL
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
    ON ${schema}.${table}
    USING ivfflat (embedding vector_cosine_ops)
  `).catch(() => {});

  return { schema, table, dimensions };
}

export async function querySemanticMemoryStore({
  connectionString,
  config,
  documents,
  context,
  limit = 5,
  embedding,
}) {
  const normalizedDocuments = Array.isArray(documents) ? documents : [];
  if (!String(connectionString || "").trim()) {
    throw new Error("pgvector connectionString 为空。");
  }

  return withClient(connectionString, async (client) => {
    const { schema, table, dimensions } = await ensureStore(client, config);
    const dedupedDocuments = normalizedDocuments.filter(document => document && document.id && document.content);

    for (const document of dedupedDocuments) {
      const { vector } = await buildEmbedding(
        [document.title, document.content, ...(document.linkedPaths || [])].filter(Boolean).join("\n"),
        dimensions,
        embedding,
      );
      await client.query(
        `
          INSERT INTO ${schema}.${table}
            (id, kind, title, content, root_path, focus_path, linked_paths, updated_at, payload, embedding)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::vector)
          ON CONFLICT (id) DO UPDATE SET
            kind = EXCLUDED.kind,
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            root_path = EXCLUDED.root_path,
            focus_path = EXCLUDED.focus_path,
            linked_paths = EXCLUDED.linked_paths,
            updated_at = EXCLUDED.updated_at,
            payload = EXCLUDED.payload,
            embedding = EXCLUDED.embedding
        `,
        [
          document.id,
          document.kind,
          document.title,
          document.content,
          document.rootPath ?? null,
          document.focusPath ?? null,
          JSON.stringify(document.linkedPaths ?? []),
          Number(document.updatedAt || Date.now()),
          JSON.stringify(document),
          toVectorLiteral(vector),
        ],
      );
    }

    const queryText = [
      context?.query,
      context?.recentTranscript,
      context?.workspaceCurrentPath,
      context?.activePreviewPath,
    ].filter(Boolean).join("\n");
    const queryEmbedding = await buildEmbedding(queryText || "semantic memory", dimensions, embedding);
    const rows = (
      await client.query(
        `
          SELECT
            id,
            kind,
            title,
            root_path,
            focus_path,
            linked_paths,
            updated_at,
            payload,
            1 - (embedding <=> $1::vector) AS similarity
          FROM ${schema}.${table}
          ORDER BY embedding <=> $1::vector
          LIMIT $2
        `,
        [toVectorLiteral(queryEmbedding.vector), Number(limit || 5)],
      )
    ).rows;

    return {
      provider: queryEmbedding.provider,
      results: rows.map(row => ({
        id: row.id,
        score: Number(row.similarity ?? 0),
        reasons: buildReasons(row, context, queryEmbedding.provider),
      })),
    };
  });
}

export async function checkSemanticMemoryStore({
  connectionString,
  config,
  embedding,
}) {
  if (!String(connectionString || "").trim()) {
    throw new Error("pgvector connectionString 为空。");
  }

  return withClient(connectionString, async (client) => {
    const { schema, table, dimensions } = await ensureStore(client, config);
    const countResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${schema}.${table}`);
    const sampleEmbedding = await buildEmbedding("semantic memory health check", dimensions, embedding);

    return {
      schema,
      table,
      dimensions,
      documentCount: Number(countResult.rows?.[0]?.count ?? 0),
      embeddingProvider: sampleEmbedding.provider,
    };
  });
}
