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
async function executeTools(toolUseBlocks, tools) {
  const results = [];
  for (const block of toolUseBlocks) {
    const tool = tools.find((t) => t.name === block.name);
    if (!tool) {
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Tool "${block.name}" not found.`,
        is_error: true,
      });
      continue;
    }

    // 权限检查
    const permission = await tool.checkPermissions(block.input, {});
    if (permission.behavior === "deny") {
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
      const result = await tool.call(block.input, {});
      const resultBlock = tool.makeToolResultBlock(block.id, result.data);
      results.push(resultBlock);
    } catch (err) {
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
    const requestParams = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    };

    // 仅在有工具时传入 tools 参数
    if (tools.length > 0) {
      requestParams.tools = tools.map((t) => t.toToolParam());
    }

    // 4. 调用 Anthropic Messages API
    let response;
    try {
      response = await client.messages.create(requestParams);
    } catch (err) {
      const msg = `API 调用失败：${err?.message || String(err)}`;
      console.error(`[agent-engine] ${agentId} API error:`, msg);
      return { text: msg, tokens: inputTokensTotal + outputTokensTotal };
    }

    // 5. 累计 token 用量
    inputTokensTotal += response.usage?.input_tokens ?? 0;
    outputTokensTotal += response.usage?.output_tokens ?? 0;

    // 6. 将 assistant 消息追加到会话历史
    const assistantContent = response.content || [];
    appendToSession(agentId, sessionId, {
      role: "assistant",
      content: assistantContent,
    });

    // 7. 检测 stop_reason
    const stopReason = response.stop_reason;

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
      const toolResults = await executeTools(toolUseBlocks, tools);

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
