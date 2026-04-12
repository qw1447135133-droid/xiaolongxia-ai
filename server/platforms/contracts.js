/**
 * 平台适配器统一契约与能力声明。
 *
 * 这层只描述协议，不承载业务实体、客户画像或值守逻辑。
 * ws-server / channel orchestrator 只应该依赖这里定义的能力边界。
 */

/**
 * @typedef {"webhook" | "long-poll" | "websocket" | "hybrid"} PlatformConnectionMode
 */

/**
 * @typedef {Object} PlatformCapabilities
 * @property {boolean} supportsWebhook
 * @property {boolean} supportsPush
 * @property {boolean} supportsFileSend
 * @property {boolean} supportsMediaSend
 * @property {boolean} supportsGroupChat
 * @property {boolean} supportsDirectChat
 * @property {boolean} supportsThreadReply
 * @property {boolean} supportsOwnerConversation
 * @property {boolean} supportsSessionResume
 * @property {boolean} supportsProbe
 */

/**
 * @typedef {Object} InboundPlatformEnvelope
 * @property {string} platformId
 * @property {string} conversationRef
 * @property {string} replyTargetId
 * @property {"text" | "image" | "audio" | "file" | "system"} [contentType]
 * @property {string} [text]
 * @property {string} [externalMessageId]
 * @property {string} [inboundMessageKey]
 * @property {string} [remoteUserId]
 * @property {string} [remoteThreadId]
 * @property {string} [participantLabel]
 * @property {string} [title]
 * @property {number} [timestamp]
 * @property {unknown} [raw]
 */

/**
 * @typedef {Object} OutboundPlatformEnvelope
 * @property {string} platformId
 * @property {string} targetId
 * @property {string} [text]
 * @property {string} [conversationRef]
 * @property {"auto" | "manual" | "workflow"} [trigger]
 * @property {{
 *   kind?: "file" | "image";
 *   filePath: string;
 *   fileName: string;
 *   mimeType?: string;
 *   caption?: string;
 * }} [attachment]
 */

/**
 * @typedef {Object} PlatformStatusEvent
 * @property {string} platformId
 * @property {string} status
 * @property {string} [detail]
 * @property {number} [timestamp]
 * @property {unknown} [raw]
 */

/**
 * @typedef {Object} PlatformProbeResult
 * @property {boolean} ok
 * @property {string} status
 * @property {string} message
 * @property {number} [checkedAt]
 * @property {unknown} [raw]
 */

/**
 * @typedef {Object} PlatformAdapterHandlers
 * @property {(message: InboundPlatformEnvelope) => void | Promise<void>} onInboundMessage
 * @property {(status: PlatformStatusEvent) => void | Promise<void>} [onStatusChange]
 * @property {(event: unknown) => void | Promise<void>} [onDebugEvent]
 */

/**
 * @typedef {Object} PlatformWebhookConfig
 * @property {string} path
 * @property {Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">} methods
 */

/**
 * @typedef {Object} PlatformWebhookResult
 * @property {boolean} ok
 * @property {number} [statusCode]
 * @property {"text" | "json" | "empty"} [responseType]
 * @property {string | object | null} [responseBody]
 * @property {Record<string, string>} [responseHeaders]
 * @property {string} [statusDetail]
 * @property {number} [healthScore]
 */

/**
 * @param {Partial<PlatformCapabilities>} overrides
 * @returns {PlatformCapabilities}
 */
export function createPlatformCapabilities(overrides = {}) {
  return {
    supportsWebhook: false,
    supportsPush: true,
    supportsFileSend: false,
    supportsMediaSend: false,
    supportsGroupChat: false,
    supportsDirectChat: true,
    supportsThreadReply: false,
    supportsOwnerConversation: true,
    supportsSessionResume: false,
    supportsProbe: false,
    ...overrides,
  };
}
