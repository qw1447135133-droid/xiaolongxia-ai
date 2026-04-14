(function () {
  var STYLE_ID = "starcraw-web-widget-style";
  var DEFAULT_POLL_INTERVAL = 2500;
  var DEFAULT_STORAGE_KEY = "starcraw-web-widget-visitor-id";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".starcraw-widget-root{position:fixed;right:24px;bottom:24px;z-index:2147483000;font-family:'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a}",
      ".starcraw-widget-button{display:flex;align-items:center;gap:10px;border:none;border-radius:999px;background:linear-gradient(135deg,#0f172a,#1e293b);color:#f8fafc;padding:12px 16px;box-shadow:0 18px 40px rgba(15,23,42,.28);cursor:pointer}",
      ".starcraw-widget-dot{width:10px;height:10px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.18)}",
      ".starcraw-widget-panel{position:absolute;right:0;bottom:68px;width:min(360px,calc(100vw - 32px));height:min(560px,calc(100vh - 116px));display:flex;flex-direction:column;border-radius:24px;background:rgba(255,255,255,.97);border:1px solid rgba(148,163,184,.24);box-shadow:0 28px 80px rgba(15,23,42,.22);overflow:hidden;backdrop-filter:blur(18px)}",
      ".starcraw-widget-header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;background:linear-gradient(135deg,#f8fafc,#e2e8f0);border-bottom:1px solid rgba(148,163,184,.16)}",
      ".starcraw-widget-title{display:grid;gap:4px}",
      ".starcraw-widget-title strong{font-size:14px}",
      ".starcraw-widget-title span{font-size:11px;color:#475569}",
      ".starcraw-widget-close{border:none;background:transparent;color:#64748b;font-size:20px;line-height:1;cursor:pointer}",
      ".starcraw-widget-body{flex:1;overflow-y:auto;padding:16px;display:grid;gap:12px;background:linear-gradient(180deg,#f8fafc 0%,#eef2ff 100%)}",
      ".starcraw-widget-empty{border:1px dashed rgba(148,163,184,.35);border-radius:18px;padding:16px;background:rgba(255,255,255,.72);font-size:12px;line-height:1.7;color:#64748b}",
      ".starcraw-widget-bubble{max-width:82%;border-radius:18px;padding:11px 13px;display:grid;gap:6px}",
      ".starcraw-widget-bubble--visitor{justify-self:end;background:linear-gradient(135deg,#0f172a,#334155);color:#f8fafc;box-shadow:0 14px 28px rgba(15,23,42,.16)}",
      ".starcraw-widget-bubble--assistant{justify-self:start;background:rgba(255,255,255,.85);border:1px solid rgba(148,163,184,.22)}",
      ".starcraw-widget-meta{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:10px;opacity:.72}",
      ".starcraw-widget-text{font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word}",
      ".starcraw-widget-status{padding:10px 16px;border-top:1px solid rgba(148,163,184,.14);font-size:11px;color:#64748b;background:rgba(248,250,252,.92)}",
      ".starcraw-widget-form{padding:14px 14px 16px;display:grid;gap:10px;border-top:1px solid rgba(148,163,184,.14);background:#fff}",
      ".starcraw-widget-textarea{width:100%;min-height:92px;resize:none;border-radius:16px;border:1px solid rgba(148,163,184,.28);padding:12px 13px;font:inherit;line-height:1.6;outline:none}",
      ".starcraw-widget-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      ".starcraw-widget-actions small{font-size:10px;color:#64748b;line-height:1.5}",
      ".starcraw-widget-send{border:none;border-radius:14px;background:#0f172a;color:#fff;padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer}",
      ".starcraw-widget-send[disabled]{background:#94a3b8;cursor:not-allowed}",
      "@media (max-width: 640px){.starcraw-widget-root{right:12px;left:12px;bottom:12px}.starcraw-widget-button{width:100%;justify-content:center}.starcraw-widget-panel{right:0;left:0;width:100%;height:min(70vh,560px)}}"
    ].join("");
    document.head.appendChild(style);
  }

  function createElement(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (typeof text === "string") element.textContent = text;
    return element;
  }

  function formatTime(timestamp) {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(timestamp);
    } catch (_error) {
      return new Date(timestamp).toLocaleTimeString();
    }
  }

  function randomVisitorId() {
    return "visitor_" + Math.random().toString(36).slice(2, 10);
  }

  function getStableVisitorId(storageKey) {
    try {
      var existing = window.localStorage.getItem(storageKey);
      if (existing) return existing;
      var nextId = randomVisitorId();
      window.localStorage.setItem(storageKey, nextId);
      return nextId;
    } catch (_error) {
      return randomVisitorId();
    }
  }

  function normalizeBaseUrl(baseUrl) {
    var value = String(baseUrl || "").trim();
    if (!value) return window.location.origin;
    return value.replace(/\/+$/, "");
  }

  function normalizeConversationRef(visitorId, conversationRef) {
    var value = String(conversationRef || "").trim();
    if (value) return value;
    return visitorId ? "visitor:" + visitorId : "";
  }

  function buildHeaders(config) {
    var headers = { "Content-Type": "application/json" };
    if (config.widgetToken) {
      headers["x-starcraw-widget-token"] = config.widgetToken;
    } else if (config.secret) {
      headers["x-starcraw-secret"] = config.secret;
    }
    return headers;
  }

  function createWidget(config) {
    if (!config || (!config.widgetToken && !config.secret)) {
      throw new Error("Starcraw Web Widget 需要传入 widgetToken 或 secret。");
    }

    ensureStyles();

    var storageKey = String(config.storageKey || DEFAULT_STORAGE_KEY);
    var visitorId = String(config.visitorId || getStableVisitorId(storageKey)).trim();
    var conversationRef = normalizeConversationRef(visitorId, config.conversationRef);
    var participantLabel = String(config.participantLabel || "官网访客").trim();
    var title = String(config.title || "在线咨询").trim();
    var subtitle = String(config.subtitle || "消息会直接进入 STARCRAW 渠道中枢").trim();
    var baseUrl = normalizeBaseUrl(config.baseUrl);
    var pollInterval = Math.max(1200, Number(config.pollInterval || DEFAULT_POLL_INTERVAL));
    var mountTarget = config.mount ? document.querySelector(config.mount) : null;
    var host = mountTarget || document.body;
    var transcript = [];
    var ackIds = [];
    var pollingTimer = null;
    var destroyed = false;

    var root = createElement("div", "starcraw-widget-root");
    var button = createElement("button", "starcraw-widget-button");
    button.type = "button";
    button.appendChild(createElement("span", "starcraw-widget-dot"));
    button.appendChild(createElement("span", "", config.buttonLabel || "打开 STARCRAW 客服"));

    var panel = createElement("section", "starcraw-widget-panel");
    panel.hidden = !config.openOnMount;

    var header = createElement("header", "starcraw-widget-header");
    var titleBox = createElement("div", "starcraw-widget-title");
    titleBox.appendChild(createElement("strong", "", title));
    titleBox.appendChild(createElement("span", "", subtitle));
    var closeButton = createElement("button", "starcraw-widget-close", "×");
    closeButton.type = "button";
    header.appendChild(titleBox);
    header.appendChild(closeButton);

    var body = createElement("div", "starcraw-widget-body");
    var statusBar = createElement("div", "starcraw-widget-status", "正在连接 STARCRAW 渠道...");
    var form = createElement("form", "starcraw-widget-form");
    var textarea = createElement("textarea", "starcraw-widget-textarea");
    textarea.placeholder = config.placeholder || "请输入你想咨询的问题...";
    var actions = createElement("div", "starcraw-widget-actions");
    var helper = createElement("small", "", "访客 ID: " + visitorId);
    var sendButton = createElement("button", "starcraw-widget-send", "发送");
    sendButton.type = "submit";
    actions.appendChild(helper);
    actions.appendChild(sendButton);
    form.appendChild(textarea);
    form.appendChild(actions);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(statusBar);
    panel.appendChild(form);
    root.appendChild(button);
    root.appendChild(panel);
    host.appendChild(root);

    function setStatus(text) {
      statusBar.textContent = text;
    }

    function renderTranscript() {
      body.innerHTML = "";
      if (transcript.length === 0) {
        body.appendChild(createElement("div", "starcraw-widget-empty", "先发一条消息试试。访客消息会进入 STARCRAW 渠道层，AI 回复会自动拉回这里。"));
        return;
      }

      transcript.forEach(function (item) {
        var bubble = createElement(
          "article",
          "starcraw-widget-bubble " + (item.role === "visitor" ? "starcraw-widget-bubble--visitor" : "starcraw-widget-bubble--assistant")
        );
        var meta = createElement("div", "starcraw-widget-meta");
        meta.appendChild(createElement("span", "", item.role === "visitor" ? "访客" : "AI"));
        meta.appendChild(createElement("span", "", formatTime(item.at)));
        bubble.appendChild(meta);
        bubble.appendChild(createElement("div", "starcraw-widget-text", item.text));
        body.appendChild(bubble);
      });

      body.scrollTop = body.scrollHeight;
    }

    function pushTranscript(item) {
      var exists = transcript.some(function (entry) { return entry.id === item.id; });
      if (exists) return;
      transcript.push(item);
      renderTranscript();
    }

    async function postJson(path, payload) {
      var response = await fetch(baseUrl + path, {
        method: "POST",
        headers: buildHeaders(config),
        body: JSON.stringify(payload)
      });
      var result = {};
      try {
        result = await response.json();
      } catch (_error) {
        result = {};
      }
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || "请求失败");
      }
      return result;
    }

    async function pollReplies() {
      if (destroyed) return;
      try {
        var result = await postJson("/api/web-channel/pull", {
          visitorId: visitorId,
          conversationRef: conversationRef,
          ackIds: ackIds,
          limit: 20
        });
        var messages = Array.isArray(result.messages) ? result.messages : [];
        if (messages.length > 0) {
          ackIds = messages.map(function (item) { return item.id; });
          messages.forEach(function (item) {
            pushTranscript({
              id: item.id,
              role: "assistant",
              text: item.text,
              at: item.createdAt || Date.now()
            });
          });
          setStatus("已同步 " + messages.length + " 条 AI 回复。");
        } else {
          ackIds = [];
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }

    async function sendMessage(text) {
      var message = String(text || "").trim();
      if (!message) return;
      sendButton.disabled = true;
      setStatus("正在把访客消息送入 STARCRAW 渠道...");
      try {
        await postJson("/webhook/web", {
          visitorId: visitorId,
          conversationRef: conversationRef,
          participantLabel: participantLabel,
          text: message
        });
        pushTranscript({
          id: "visitor-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          role: "visitor",
          text: message,
          at: Date.now()
        });
        textarea.value = "";
        setStatus("消息已送达，正在等待 AI 回复...");
        await pollReplies();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        sendButton.disabled = false;
      }
    }

    function setOpen(nextOpen) {
      panel.hidden = !nextOpen;
      button.hidden = nextOpen;
      if (nextOpen) {
        textarea.focus();
      }
    }

    button.addEventListener("click", function () {
      setOpen(true);
    });
    closeButton.addEventListener("click", function () {
      setOpen(false);
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      void sendMessage(textarea.value);
    });

    renderTranscript();
    void pollReplies();
    pollingTimer = window.setInterval(function () {
      void pollReplies();
    }, pollInterval);

    return {
      sendMessage: sendMessage,
      open: function () { setOpen(true); },
      close: function () { setOpen(false); },
      destroy: function () {
        destroyed = true;
        if (pollingTimer) window.clearInterval(pollingTimer);
        root.remove();
      }
    };
  }

  window.StarcrawWebChannel = {
    init: createWidget
  };
})();
