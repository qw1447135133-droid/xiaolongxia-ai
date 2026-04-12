import {
  estimateContextTokens,
  LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS,
} from "@/lib/memory-compression";
import type { SemanticKnowledgeDocument } from "@/types/semantic-memory";

export type HermesContextLayerId =
  | "feedback"
  | "user_profile"
  | "onboarding"
  | "project_scope"
  | "recent_chat"
  | "explicit_mentions"
  | "project_memory"
  | "desk_notes"
  | "knowledge_docs"
  | "customer_portfolio"
  | "business_graph"
  | "world_state"
  | "compressed_memory"
  | "user_request";

export interface HermesContextLayer {
  id: HermesContextLayerId;
  title: string;
  content: string;
  enabled: boolean;
  summary: string;
  estimatedTokens: number;
}

export interface HermesContextBundle {
  standardInstruction: string;
  finalInstruction: string;
  estimatedStandardTokens: number;
  estimatedFinalTokens: number;
  compressionEnabled: boolean;
  activeLayers: HermesContextLayer[];
  finalLayers: HermesContextLayer[];
  compressedDocument: SemanticKnowledgeDocument | null;
  diagnosticSummary: string;
}

type BuildHermesContextBundleInput = {
  feedbackSnippet?: string;
  userProfileSnippet?: string;
  userProfileOnboardingSnippet?: string;
  projectScopeSnippet?: string;
  recentConversationSnippet?: string;
  explicitMentionSnippet?: string;
  projectMemorySnippet?: string;
  deskNoteSnippet?: string;
  knowledgeSnippet?: string;
  customerPortfolioSnippet?: string;
  businessGraphSnippet?: string;
  worldSnippet?: string;
  userRequest: string;
  compressionDoc?: SemanticKnowledgeDocument | null;
};

function normalizeContent(value: string | undefined) {
  return String(value || "").trim();
}

function summarizeLayer(value: string, maxLength = 120) {
  const normalized = normalizeContent(value).replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function createLayer(id: HermesContextLayerId, title: string, content: string): HermesContextLayer {
  const normalized = normalizeContent(content);
  return {
    id,
    title,
    content: normalized,
    enabled: Boolean(normalized),
    summary: summarizeLayer(normalized),
    estimatedTokens: estimateContextTokens(normalized),
  };
}

function joinEnabledLayers(layers: HermesContextLayer[]) {
  return layers
    .filter(layer => layer.enabled)
    .map(layer => layer.content)
    .join("\n\n---\n\n");
}

export function buildHermesContextBundle(input: BuildHermesContextBundleInput): HermesContextBundle {
  const standardLayers = [
    createLayer("feedback", "反馈档案", input.feedbackSnippet || ""),
    createLayer("user_profile", "用户画像", input.userProfileSnippet || ""),
    createLayer("onboarding", "用户补档", input.userProfileOnboardingSnippet || ""),
    createLayer("project_scope", "项目范围", input.projectScopeSnippet || ""),
    createLayer("recent_chat", "当前会话短期记忆", input.recentConversationSnippet || ""),
    createLayer("explicit_mentions", "@ 显式外部上下文", input.explicitMentionSnippet || ""),
    createLayer("project_memory", "项目记忆", input.projectMemorySnippet || ""),
    createLayer("desk_notes", "Desk Notes", input.deskNoteSnippet || ""),
    createLayer("knowledge_docs", "知识文档", input.knowledgeSnippet || ""),
    createLayer("customer_portfolio", "客户画像总览", input.customerPortfolioSnippet || ""),
    createLayer("business_graph", "业务关系图", input.businessGraphSnippet || ""),
    createLayer("world_state", "世界状态", input.worldSnippet || ""),
    createLayer("user_request", "用户请求", `User request:\n${normalizeContent(input.userRequest)}`),
  ];

  const standardInstruction = joinEnabledLayers(standardLayers);
  const estimatedStandardTokens = estimateContextTokens(standardInstruction);
  const compressionEnabled = Boolean(input.compressionDoc?.content?.trim());

  const finalLayers = compressionEnabled
    ? [
        createLayer("feedback", "反馈档案", input.feedbackSnippet || ""),
        createLayer("user_profile", "用户画像", input.userProfileSnippet || ""),
        createLayer("onboarding", "用户补档", input.userProfileOnboardingSnippet || ""),
        createLayer("project_scope", "项目范围", input.projectScopeSnippet || ""),
        createLayer("recent_chat", "当前会话短期记忆", input.recentConversationSnippet || ""),
        createLayer("explicit_mentions", "@ 显式外部上下文", input.explicitMentionSnippet || ""),
        createLayer(
          "compressed_memory",
          "压缩后的长期记忆",
          [
            `System note: Long-term memory compression triggered automatically because the estimated context is approaching ${LONG_TERM_MEMORY_CONTEXT_LIMIT_TOKENS} tokens. Use the compressed snapshot below as the working memory baseline, and do not ask the user to repeat context that is already captured here.`,
            input.customerPortfolioSnippet ? normalizeContent(input.customerPortfolioSnippet) : "",
            `Compressed context snapshot:\n${normalizeContent(input.compressionDoc?.content || "")}`,
          ].filter(Boolean).join("\n\n"),
        ),
        createLayer("user_request", "用户请求", `User request:\n${normalizeContent(input.userRequest)}`),
      ]
    : standardLayers;

  const finalInstruction = joinEnabledLayers(finalLayers);
  const estimatedFinalTokens = estimateContextTokens(finalInstruction);
  const activeLayers = standardLayers.filter(layer => layer.enabled);
  const activeFinalLayers = finalLayers.filter(layer => layer.enabled);
  const diagnosticSummary = [
    `Hermes context assembled with ${activeFinalLayers.length} active layers.`,
    compressionEnabled
      ? `Compression on (${estimatedStandardTokens.toLocaleString()} -> ${estimatedFinalTokens.toLocaleString()} tokens).`
      : `Compression off (${estimatedFinalTokens.toLocaleString()} tokens).`,
    `Layers: ${activeFinalLayers.map(layer => layer.title).join(" / ")}`,
  ].join(" ");

  return {
    standardInstruction,
    finalInstruction,
    estimatedStandardTokens,
    estimatedFinalTokens,
    compressionEnabled,
    activeLayers,
    finalLayers: activeFinalLayers,
    compressedDocument: input.compressionDoc ?? null,
    diagnosticSummary,
  };
}
