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

/** OpenAI 兼容接口中，最多保留几张最近的工具返回图片进入上下文 */
const OPENAI_MAX_TOOL_IMAGES = 1;

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

function extractToolResultTextContent(content) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function extractToolResultImageParts(content) {
  if (!Array.isArray(content)) return [];

  return content
    .filter((block) => block?.type === "image" && block?.source?.type === "base64")
    .map((block) => {
      const mediaType = typeof block?.source?.media_type === "string" ? block.source.media_type : "image/jpeg";
      const data = typeof block?.source?.data === "string" ? block.source.data : "";
      if (!data) return null;

      return {
        type: "image_url",
        image_url: {
          url: `data:${mediaType};base64,${data}`,
          detail: "low",
        },
      };
    })
    .filter(Boolean);
}

function findRecentToolResultImageKeys(messages) {
  const keys = [];

  messages.forEach((message, messageIndex) => {
    if (message.role !== "user" || !Array.isArray(message.content)) return;
    message.content.forEach((block, blockIndex) => {
      if (block?.type !== "tool_result") return;
      if (extractToolResultImageParts(block.content).length === 0) return;
      keys.push(`${messageIndex}:${blockIndex}`);
    });
  });

  return new Set(keys.slice(-OPENAI_MAX_TOOL_IMAGES));
}

function resolveAbortReason(reason, fallback = "用户已中止本次生成。") {
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  if (reason && typeof reason === "object" && typeof reason.message === "string" && reason.message.trim()) {
    return reason.message.trim();
  }
  return fallback;
}

function createQueryAbortError(reason) {
  const error = new Error(resolveAbortReason(reason));
  error.name = "AbortError";
  return error;
}

function isAbortLikeError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  const message = typeof error?.message === "string" ? error.message : String(error ?? "");
  return (
    name === "AbortError"
    || name === "APIUserAbortError"
    || /aborted|aborterror|cancelled|canceled/i.test(message)
  );
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createQueryAbortError(signal.reason);
  }
}

function hasToolNamed(tools, toolName) {
  return Array.isArray(tools) && tools.some((tool) => tool?.name === toolName);
}

function shouldForceDesktopToolRetry(task, tools) {
  if (
    !hasToolNamed(tools, "desktop_control_input")
    || !hasToolNamed(tools, "desktop_capture_screenshot")
  ) {
    return false;
  }

  const text = String(task || "").trim().toLowerCase();
  if (!text) return false;

  const likelyDesktopIntent = [
    /(?:鼠标|鍵盤|键盘|接管|点开|點開|点击|點擊|双击|雙擊|右键|右鍵|滚动|滾動|输入|輸入|播放)/i,
    /(?:桌面|desktop).{0,12}(?:点击|點擊|操作|接管|程序|應用|应用|窗口|視窗|弹窗|彈窗)/i,
    /(?:点击|點擊|操作|接管|启动|啟動).{0,12}(?:桌面|desktop)/i,
    /(?:打开|打開|进入|進入|前往|跳转到|跳轉到|去到).{0,20}(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器)/i,
    /(?:b\s*站|bilibili|you\s*tube|youtube|优酷|腾讯视频|爱奇艺|抖音|tiktok|快手|视频站|視頻站|视频网站|視頻網站|播放器).{0,18}(?:打开|打開|点击|點擊|点开|點開|播放|进入|進入)/i,
  ];

  return likelyDesktopIntent.some((pattern) => pattern.test(text));
}

function mapSessionMessagesToOpenAiMessages(messages, systemPrompt) {
  const mapped = [];
  const recentToolImageKeys = findRecentToolResultImageKeys(messages);

  if (systemPrompt?.trim()) {
    mapped.push({ role: "system", content: systemPrompt });
  }

  for (const [messageIndex, message] of messages.entries()) {
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
      for (const [blockIndex, block] of message.content.entries()) {
        if (block?.type !== "tool_result") continue;
        const textContent = extractToolResultTextContent(block.content);
        const imageParts = extractToolResultImageParts(block.content);
        const fallbackSummary = imageParts.length > 0
          ? `Tool returned ${imageParts.length} image result${imageParts.length > 1 ? "s" : ""}.`
          : "(no textual tool result)";

        mapped.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: textContent || fallbackSummary,
        });

        const imageKey = `${messageIndex}:${blockIndex}`;
        if (!recentToolImageKeys.has(imageKey) || imageParts.length === 0) {
          continue;
        }

        mapped.push({
          role: "user",
          content: [
            {
              type: "text",
              text:
                `${textContent || "以下是工具刚返回的最新视觉结果。"}\n`
                + "请只基于这张最新图片继续判断下一步；旧图片可忽略。若这是桌面截图，坐标系以图片左上角为 (0,0)。",
            },
            ...imageParts,
          ],
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
    throwIfAborted(context.signal);
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
    throwIfAborted(context.signal);
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
      throwIfAborted(context.signal);
      if (typeof context.onToolEvent === "function") {
        await context.onToolEvent({
          phase: "start",
          toolName: block.name,
          input: block.input,
          toolUseId: block.id,
        });
      }
      const result = await tool.call(block.input, context);
      throwIfAborted(context.signal);
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
  onTextDelta,
  onReasoningEvent,
  signal,
}) {
  throwIfAborted(signal);
  // 1. 追加用户消息到会话历史
  appendToSession(agentId, sessionId, { role: "user", content: task });

  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let turnCount = 0;
  let forcedSummary = false;
  let forcedDesktopToolRetry = false;
  const emitTextDelta = (delta) => {
    if (!delta || typeof onTextDelta !== "function") return;
    try {
      Promise.resolve(onTextDelta(delta)).catch(() => {});
    } catch {
      // Ignore non-critical streaming callback failures.
    }
  };
  const emitReasoningEvent = (payload) => {
    if (typeof onReasoningEvent !== "function") return;
    try {
      Promise.resolve(onReasoningEvent(payload)).catch(() => {});
    } catch {
      // Ignore non-critical reasoning callback failures.
    }
  };

  // 2. 查询循环（对应 Python while True 循环）
  while (true) {
    throwIfAborted(signal);
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
        emitReasoningEvent({
          status: "running",
          summary: turnCount === 1 ? "正在分析需求与上下文" : "正在结合工具结果继续推理",
          detail: turnCount === 1
            ? `已向 ${model} 发起生成请求。`
            : "已收到工具结果，正在判断下一步动作。",
        });

        const stream = await client.chat.completions.create(
          {
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
            stream: true,
          },
          signal ? { signal } : undefined,
        );

        let text = "";
        let sawVisibleText = false;
        let sawToolDecision = false;
        /** @type {Map<number, { id: string, name: string, arguments: string }>} */
        const toolCallBuffer = new Map();

        for await (const chunk of stream) {
          throwIfAborted(signal);
          if (chunk?.usage) {
            inputTokensTotal = Math.max(inputTokensTotal, chunk.usage.prompt_tokens ?? 0);
            outputTokensTotal = Math.max(outputTokensTotal, chunk.usage.completion_tokens ?? 0);
          }

          const choice = chunk?.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta ?? {};
          if (typeof delta.content === "string" && delta.content) {
            if (!sawVisibleText) {
              sawVisibleText = true;
              emitReasoningEvent({
                status: "running",
                summary: "正在起草可见回复",
                detail: "模型已开始整理对用户可见的最终回答。",
              });
            }
            text += delta.content;
            emitTextDelta(delta.content);
          }

          if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
            if (!sawToolDecision) {
              sawToolDecision = true;
              emitReasoningEvent({
                status: "running",
                summary: "正在决定调用工具",
                detail: "模型判断需要先借助工具补充信息再继续回答。",
              });
            }
            for (const toolCallPart of delta.tool_calls) {
              const index = Number.isFinite(toolCallPart?.index) ? toolCallPart.index : toolCallBuffer.size;
              const current = toolCallBuffer.get(index) ?? { id: "", name: "", arguments: "" };
              if (typeof toolCallPart?.id === "string" && toolCallPart.id) {
                current.id = toolCallPart.id;
              }
              if (typeof toolCallPart?.function?.name === "string" && toolCallPart.function.name) {
                current.name = toolCallPart.function.name;
              }
              if (typeof toolCallPart?.function?.arguments === "string" && toolCallPart.function.arguments) {
                current.arguments += toolCallPart.function.arguments;
              }
              toolCallBuffer.set(index, current);
            }
          }

          if (choice.finish_reason) {
            stopReason = choice.finish_reason === "tool_calls" ? "tool_use" : "end_turn";
          }
        }

        assistantContent = [
          ...(text ? [{ type: "text", text }] : []),
          ...[...toolCallBuffer.values()].map((call) => ({
            type: "tool_use",
            id: call.id,
            name: call.name || "",
            input: parseOpenAiToolArguments(call.arguments),
          })),
        ];
        if (stopReason !== "tool_use" && assistantContent.some((block) => block.type === "tool_use")) {
          stopReason = "tool_use";
        }
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

        emitReasoningEvent({
          status: "running",
          summary: turnCount === 1 ? "正在分析需求与上下文" : "正在结合工具结果继续推理",
          detail: turnCount === 1
            ? `已向 ${model} 发起生成请求。`
            : "已收到工具结果，正在判断下一步动作。",
        });

        const stream = await client.messages.create(
          {
            ...requestParams,
            stream: true,
          },
          signal ? { signal } : undefined,
        );
        /** @type {Array<any>} */
        const blocks = [];
        let sawVisibleText = false;
        let sawToolDecision = false;

        for await (const event of stream) {
          throwIfAborted(signal);
          switch (event.type) {
            case "message_start":
              inputTokensTotal += event.message?.usage?.input_tokens ?? 0;
              break;
            case "content_block_start": {
              const block = event.content_block ? { ...event.content_block } : null;
              blocks[event.index] = block;
              if (block?.type === "text" && typeof block.text === "string" && block.text) {
                if (!sawVisibleText) {
                  sawVisibleText = true;
                  emitReasoningEvent({
                    status: "running",
                    summary: "正在起草可见回复",
                    detail: "模型已开始整理对用户可见的最终回答。",
                  });
                }
                emitTextDelta(block.text);
              }
              if (block?.type === "tool_use" && !sawToolDecision) {
                sawToolDecision = true;
                emitReasoningEvent({
                  status: "running",
                  summary: "正在决定调用工具",
                  detail: "模型判断需要先借助工具补充信息再继续回答。",
                });
              }
              break;
            }
            case "content_block_delta": {
              const block = blocks[event.index];
              if (!block) break;

              if (event.delta?.type === "text_delta" && block.type === "text") {
                block.text = `${block.text || ""}${event.delta.text || ""}`;
                if (event.delta.text) {
                  if (!sawVisibleText) {
                    sawVisibleText = true;
                    emitReasoningEvent({
                      status: "running",
                      summary: "正在起草可见回复",
                      detail: "模型已开始整理对用户可见的最终回答。",
                    });
                  }
                  emitTextDelta(event.delta.text);
                }
              }

              if (event.delta?.type === "input_json_delta" && block.type === "tool_use") {
                if (!sawToolDecision) {
                  sawToolDecision = true;
                  emitReasoningEvent({
                    status: "running",
                    summary: "正在决定调用工具",
                    detail: "模型判断需要先借助工具补充信息再继续回答。",
                  });
                }
                const nextRaw = `${block.__rawInputJson || ""}${event.delta.partial_json || ""}`;
                block.__rawInputJson = nextRaw;
                try {
                  block.input = nextRaw ? JSON.parse(nextRaw) : {};
                } catch {
                  // Partial JSON is expected while streaming tool arguments.
                }
              }
              break;
            }
            case "message_delta":
              stopReason = event.delta?.stop_reason || stopReason;
              outputTokensTotal = Math.max(outputTokensTotal, event.usage?.output_tokens ?? 0);
              break;
            default:
              break;
          }
        }

        assistantContent = blocks
          .filter(Boolean)
          .map((block) => {
            if (block?.type === "tool_use") {
              return {
                type: "tool_use",
                id: block.id,
                name: block.name,
                input: block.input ?? {},
              };
            }
            if (block?.type === "text") {
              return {
                type: "text",
                text: block.text ?? "",
              };
            }
            return block;
          });
      }
    } catch (err) {
      if (signal?.aborted || isAbortLikeError(err)) {
        const abortError = createQueryAbortError(signal?.reason ?? err);
        emitReasoningEvent({
          status: "failed",
          summary: "已停止生成",
          detail: abortError.message,
        });
        throw abortError;
      }
      const msg = `API 调用失败：${err?.message || String(err)}`;
      console.error(`[agent-engine] ${agentId} API error:`, msg);
      emitReasoningEvent({
        status: "failed",
        summary: "模型调用失败",
        detail: msg,
      });
      return { text: msg, tokens: inputTokensTotal + outputTokensTotal };
    }

    throwIfAborted(signal);
    appendToSession(agentId, sessionId, {
      role: "assistant",
      content: assistantContent,
    });

    if (stopReason === "tool_use") {
      const toolUseBlocks = assistantContent.filter((b) => b.type === "tool_use");
      if (toolUseBlocks.length > 0) {
        emitReasoningEvent({
          status: "running",
          summary: "正在执行工具链",
          detail: `准备调用 ${toolUseBlocks.map((block) => block.name).filter(Boolean).join("、")}。`,
        });
      }
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
        signal,
        ...(toolContext ?? {}),
      });

      // 将工具结果作为用户消息追加，继续循环
      throwIfAborted(signal);
      appendToSession(agentId, sessionId, {
        role: "user",
        content: toolResults,
      });
      emitReasoningEvent({
        status: "running",
        summary: "已获取工具结果",
        detail: `已收到 ${toolResults.length} 个工具结果，继续整理最终回答。`,
      });
      continue; // 继续下一轮
    }

    // end_turn 或其他：提取文本块返回
    const textBlock = assistantContent.find((b) => b.type === "text");
    const text = textBlock?.text ?? "(无输出)";

    if (
      !forcedDesktopToolRetry
      && shouldForceDesktopToolRetry(task, tools)
      && !assistantContent.some((block) => block.type === "tool_use")
    ) {
      forcedDesktopToolRetry = true;
      emitReasoningEvent({
        status: "running",
        summary: "正在补强桌面执行",
        detail: "上一轮还没有真正调用桌面工具，已要求模型先进入工具链后再回复。",
      });
      appendToSession(agentId, sessionId, {
        role: "user",
        content:
          "这是一条真实桌面操作任务。不要只给解释或建议，必须先实际调用合适的桌面工具链完成至少一次工具调用，然后再继续回复。若目标是 Chrome、Edge、飞书、Figma、Notion 这类 Chromium / Electron 应用，优先使用 desktop_cdp_open_app、desktop_cdp_snapshot、desktop_cdp_act；只有结构化控制不可用时，才回退到 desktop_open_external_browser、desktop_capture_screenshot、desktop_control_input。只有在验证码、人机验证、OTP/2FA 或明确需要人工接管时，才允许停止自动操作并说明原因。",
      });
      continue;
    }

    emitReasoningEvent({
      status: "done",
      summary: "回答已完成",
      detail: "本轮可见回复已经生成完成。",
    });
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
