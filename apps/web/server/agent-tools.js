/**
 * Tool Protocol - 移植自 hare/tool.py
 *
 * 定义标准化的工具接口（Tool Protocol），供 Agent 执行引擎使用。
 * 当前工具池为空，架构预留以便后续扩展（如 web_search、generate_image 等）。
 */

// ---------------------------------------------------------------------------
// ToolBase - 对应 Python ToolBase 基类
// ---------------------------------------------------------------------------

export class ToolBase {
  name = "";
  aliases = [];
  searchHint = "";
  maxResultSizeChars = 10_000;

  /** JSON Schema 定义工具输入参数 */
  inputSchema() {
    return { type: "object", properties: {}, required: [] };
  }

  /** 工具是否启用 */
  isEnabled() {
    return true;
  }

  /** 是否为只读操作 */
  isReadOnly(input) {
    return false;
  }

  /** 权限检查，返回 { behavior: "allow" | "deny", reason? } */
  async checkPermissions(input, context) {
    return { behavior: "allow" };
  }

  /** 执行工具，返回 { data: string | object } */
  async call(args, context) {
    return { data: "(not implemented)" };
  }

  /** 构建传给 Anthropic API 的工具参数 */
  toToolParam() {
    return {
      name: this.name,
      description: this.searchHint,
      input_schema: this.inputSchema(),
    };
  }

  /**
   * 将工具执行结果转换为 Anthropic tool_result 内容块
   * 对应 Python map_tool_result_to_tool_result_block_param()
   */
  makeToolResultBlock(toolUseId, data) {
    const content = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    // 截断防止超限
    const truncated = content.length > this.maxResultSizeChars
      ? content.slice(0, this.maxResultSizeChars) + "\n...(truncated)"
      : content;
    return {
      type: "tool_result",
      tool_use_id: toolUseId,
      content: truncated,
    };
  }
}

// ---------------------------------------------------------------------------
// 工具注册表 - 对应 Python tools.py 中的 assemble_tool_pool()
// ---------------------------------------------------------------------------

/** 当前内置工具列表（空，架构预留） */
const BUILT_IN_TOOLS = [];

/**
 * 获取指定 Agent 可用的工具列表
 * 对应 Python get_tools() / assemble_tool_pool()
 *
 * @param {string} agentId - Agent 标识符
 * @returns {ToolBase[]}
 */
export function getAgentTools(agentId) {
  return BUILT_IN_TOOLS.filter((tool) => tool.isEnabled());
}
