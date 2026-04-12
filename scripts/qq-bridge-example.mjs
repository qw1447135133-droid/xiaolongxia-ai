import readline from "node:readline";

const [, , baseUrlArg = "http://localhost:3001", secretArg = "dev-qq-bridge-secret", userIdArg = "qq_demo_001"] = process.argv;

const baseUrl = String(baseUrlArg || "http://localhost:3001").replace(/\/+$/, "");
const bridgeSecret = String(secretArg || "dev-qq-bridge-secret").trim();
const userId = String(userIdArg || "qq_demo_001").trim();
const conversationRef = `qq:${userId}`;
let ackIds = [];

function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "x-starcraw-secret": bridgeSecret,
  };
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || `Request failed: ${path}`);
  }
  return result;
}

async function pushInboundMessage(text) {
  const result = await postJson("/webhook/qq", {
    userId,
    conversationRef,
    participantLabel: `QQ 用户 ${userId}`,
    text,
  });
  console.log(`[qq-bridge] inbound accepted -> ${result.externalMessageId}`);
}

async function pullReplies() {
  const result = await postJson("/api/qq-bridge/pull", {
    userId,
    conversationRef,
    ackIds,
    limit: 20,
  });
  const messages = Array.isArray(result.messages) ? result.messages : [];
  if (messages.length === 0) {
    ackIds = [];
    return;
  }

  ackIds = messages.map(item => item.id);
  for (const item of messages) {
    const timestamp = new Date(item.createdAt || Date.now()).toLocaleTimeString("zh-CN", { hour12: false });
    console.log(`[ai ${timestamp}] ${item.text}`);
  }
}

async function main() {
  console.log("QQ Bridge Example");
  console.log(`baseUrl: ${baseUrl}`);
  console.log(`userId: ${userId}`);
  console.log("Type a message and press Enter to simulate QQ inbound traffic.");
  console.log("Press Ctrl+C to exit.\n");

  const timer = setInterval(() => {
    void pullReplies().catch((error) => {
      console.error(`[qq-bridge] pull failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, 2500);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  rl.on("line", (line) => {
    const text = line.trim();
    if (!text) return;
    void pushInboundMessage(text).catch((error) => {
      console.error(`[qq-bridge] inbound failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  rl.on("close", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
