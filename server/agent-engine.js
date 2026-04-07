/**
 * AgentEngine - QueryEngine 模式实现
 * 移植自 hare/query/__init__.py + hare/query_engine.py
 *
 * 核心职责：
 * - 每个 Agent + Session 维护独立对话历史（messages[]）
 * - queryAgent() 实现多轮查询循环：调用模型 → 检测 tool_use → 执行工具 → 追加结果 → 循环
 * - 对应 Python QueryEngine.submit_message() + _query_loop()
 */

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 单次查询最大轮次（防止无限循环），对应 Python MAX_TURNS */
const MAX_TURNS = 10;

/** 会话历史最大消息数（超过后截断保留最近条目） */
const SESSION_MAX_MESSAGES = 30;

/** 会话历史截断后保留条数 */
const SESSION_KEEP_MESSAGES = 20;

// ---------------------------------------------------------------------------
// 会话历史存储
// 对应 Python QueryEngine._mutable_messages
// key: "agentId:sessionId"
// ---------------------------------------------------------------------------

/** @type {Map<string, Array<{role: string, content: any}>>} */
const agentSessions = new Map();

function sessionKey(agentId, sessionId) {
  return `${agentId}:${sessionId}`;
}

function getSessionMessages(agentId, sessionId) {
  const key = sessionKey(agentId, sessionId);
  if (!agentSessions.has(key)) {
    agentSessions.set(key, []);
  }
  return agentSessions.get(key);
}

function appendToSession(agentId, sessionId, ...messages) {
  const history = getSessionMessages(agentId, sessionId);
  history.push(...messages);
  // 截断：防止上下文过长
  if (history.length > SESSION_MAX_MESSAGES) {
    history.splice(0, history.length - SESSION_KEEP_MESSAGES);
  }
}

function parseOpenAiToolArguments(rawArguments) {
  if (!rawArguments || typeof rawArguments !== "string") return {};
  try {
    return JSON.parse(rawArguments);
  } catch {
    return {};
  }
}

function flattenAnthropicContentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function mapSessionMessagesToOpenAiMessages(messages, systemPrompt) {
  const mapped = [];

  if (systemPrompt?.trim()) {
    mapped.push({ role: "system", content: systemPrompt });
  }

  for (const message of messages) {
    if (message.role === "user" && typeof message.content === "string") {
      mapped.push({ role: "user", content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const content = Array.isArray(message.content) ? message.content : [];
      const text = flattenAnthropicContentToText(content);
      const toolCalls = content
        .filter((block) => block?.type === "tool_use")
        .map((block) => ({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        }));

      if (text || toolCalls.length > 0) {
        mapped.push({
          role: "assistant",
          ...(text ? { content: text } : { content: "" }),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      }
      continue;
    }

    if (message.role === "user" && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block?.type !== "tool_result") continue;
        mapped.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""),
        });
      }
    }
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// 工具执行
// 对应 Python _query_loop() 中的 tool_use 处理段
// ---------------------------------------------------------------------------

/**
 * 执行所有 tool_use 块，返回 tool_result 内容块数组
 *
 * @param {Array} toolUseBlocks - response.content 中 type==="tool_use" 的块
 * @param {Array} tools         - 可用工具列表（ToolBase 实例）
 * @returns {Promise<Array>}    - Anthropic tool_result 内容块数组
 */
async function executeTools(toolUseBlocks, tools, context = {}) {
  const results = [];
  for (const block of toolUseBlocks) {
    const tool = tools.find((t) => t.name === block.name);
    if (!tool) {
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "missing",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
        });
      }
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Tool "${block.name}" not found.`,
        is_error: true,
      });
      continue;
    }

    // 权限检查
    const permission = await tool.checkPermissions(block.input, context);
    if (permission.behavior === "deny") {
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "denied",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
          error: permission.reason || "not allowed",
        });
      }
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Permission denied: ${permission.reason || "not allowed"}`,
        is_error: true,
      });
      continue;
    }

    // 执行工具
    try {
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "start",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
        });
      }
      const result = await tool.call(block.input, context);
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "success",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
          result: result.data,
        });
      }
      const resultBlock = tool.makeToolResultBlock(block.id, result.data);
      results.push(resultBlock);
    } catch (err) {
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "error",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
          error: err?.message || String(err),
        });
      }
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Tool error: ${err?.message || String(err)}`,
        is_error: true,
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// queryAgent - 主查询循环
// 对应 Python QueryEngine.submit_message() + query() + _query_loop()
// ---------------------------------------------------------------------------

/**
 * 通过 Anthropic API 执行 Agent 查询，支持多轮工具执行。
 *
 * @param {object} params
 * @param {string}   params.agentId      - Agent 标识符
 * @param {string}   params.sessionId    - 会话 ID（用于维护对话历史）
 * @param {string}   params.task         - 用户输入的任务描述
 * @param {string}   params.systemPrompt - Agent 系统提示词
 * @param {Array}    params.tools        - 可用工具列表（ToolBase 实例）
 * @param {number}   params.maxTokens    - 最大输出 token 数
 * @param {string}   params.model        - 使用的 Claude 模型
 * @param {object}   params.client       - Anthropic SDK 客户端实例
 *
 * @returns {Promise<{ text: string, tokens: number }>}
 */
export async function queryAgent({
  agentId,
  sessionId,
  task,
  systemPrompt,
  tools = [],
  maxTokens,
  model,
  client,
  clientType = "anthropic",
  onToolEvent,
  toolContext,
}) {
  // 1. 追加用户消息到会话历史
  appendToSession(agentId, sessionId, { role: "user", content: task });

  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let turnCount = 0;
  let forcedSummary = false;

  // 2. 查询循环（对应 Python while True 循环）
  while (true) {
    if (turnCount >= MAX_TURNS) {
      console.warn(`[agent-engine] ${agentId} reached MAX_TURNS (${MAX_TURNS}), stopping.`);
      return {
        text: "(达到最大轮次限制，任务终止)",
        tokens: inputTokensTotal + outputTokensTotal,
      };
    }
    turnCount++;

    // 3. 构建 API 请求参数
    const messages = [...getSessionMessages(agentId, sessionId)];
    let assistantContent = [];
    let stopReason = "end_turn";

    try {
      if (clientType === "openai") {
        const response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: mapSessionMessagesToOpenAiMessages(messages, systemPrompt),
          ...(tools.length > 0
            ? {
                tools: tools.map((tool) => ({
                  type: "function",
                  function: {
                    name: tool.name,
                    description: tool.searchHint,
                    parameters: tool.inputSchema(),
                  },
                })),
                tool_choice: "auto",
              }
            : {}),
        });

        inputTokensTotal += response.usage?.prompt_tokens ?? 0;
        outputTokensTotal += response.usage?.completion_tokens ?? 0;

        const choice = response.choices?.[0];
        const message = choice?.message;
        const text = typeof message?.content === "string" ? message.content : "";
        const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

        assistantContent = [
          ...(text ? [{ type: "text", text }] : []),
          ...toolCalls.map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.function?.name || "",
            input: parseOpenAiToolArguments(call.function?.arguments),
          })),
        ];
        stopReason = toolCalls.length > 0 ? "tool_use" : "end_turn";
      } else {
        const requestParams = {
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
        };

        if (tools.length > 0) {
          requestParams.tools = tools.map((t) => t.toToolParam());
        }

        const response = await client.messages.create(requestParams);
        inputTokensTotal += response.usage?.input_tokens ?? 0;
        outputTokensTotal += response.usage?.output_tokens ?? 0;
        assistantContent = response.content || [];
        stopReason = response.stop_reason;
      }
    } catch (err) {
      const msg = `API 调用失败：${err?.message || String(err)}`;
      console.error(`[agent-engine] ${agentId} API error:`, msg);
      return { text: msg, tokens: inputTokensTotal + outputTokensTotal };
    }

    appendToSession(agentId, sessionId, {
      role: "assistant",
      content: assistantContent,
    });

    if (stopReason === "tool_use") {
      const toolUseBlocks = assistantContent.filter((b) => b.type === "tool_use");
      // 防止空 tool_use 死循环：注入提示让 Agent 强制总结
      if (toolUseBlocks.length === 0) {
        const textBlock = assistantContent.find((b) => b.type === "text");
        if (textBlock?.text) return { text: textBlock.text, tokens: inputTokensTotal + outputTokensTotal };
        if (!forcedSummary) {
          forcedSummary = true;
          appendToSession(agentId, sessionId, { role: "assistant", content: assistantContent });
          appendToSession(agentId, sessionId, { role: "user", content: "请根据你已经获取到的信息，直接给出结果总结。" });
          continue;
        }
        return { text: "(任务完成，无额外输出)", tokens: inputTokensTotal + outputTokensTotal };
      }
      const toolResults = await executeTools(toolUseBlocks, tools, {
        agentId,
        sessionId,
        onToolEvent,
        ...(toolContext ?? {}),
      });

      // 将工具结果作为用户消息追加，继续循环
      appendToSession(agentId, sessionId, {
        role: "user",
        content: toolResults,
      });
      continue; // 继续下一轮
    }

    // end_turn 或其他：提取文本块返回
    const textBlock = assistantContent.find((b) => b.type === "text");
    const text = textBlock?.text ?? "(无输出)";

    return {
      text,
      tokens: inputTokensTotal + outputTokensTotal,
    };
  }
}

// ---------------------------------------------------------------------------
// 会话管理工具函数
// ---------------------------------------------------------------------------

/**
 * 清除指定 Agent 在指定会话中的对话历史
 */
export function clearAgentSession(agentId, sessionId) {
  const key = sessionKey(agentId, sessionId);
  agentSessions.delete(key);
}

/**
 * 清除所有 Agent 的所有会话历史（新建对话时调用）
 */
export function clearAllSessions() {
  agentSessions.clear();
}

/**
 * 获取当前会话历史长度（调试用）
 */
export function getSessionLength(agentId, sessionId) {
  return getSessionMessages(agentId, sessionId).length;
}
