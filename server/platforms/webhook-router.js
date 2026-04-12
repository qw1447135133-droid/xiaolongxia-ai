import {
  findPlatformRegistryEntryByWebhookPath,
  getPlatformWebhookConfig,
  PLATFORM_WEBHOOK_PATHS,
} from "./registry.js";

export { PLATFORM_WEBHOOK_PATHS };

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function buildProbePayload(entry, adapter) {
  return {
    ok: true,
    platformId: entry.id,
    route: entry.webhook?.path,
    adapterReady: Boolean(adapter),
    accepts: entry.webhook?.methods ?? [],
    message: adapter
      ? `${entry.id.toUpperCase()} Webhook 路由可达，适配器已挂载。`
      : `${entry.id.toUpperCase()} Webhook 路由可达，但适配器尚未挂载。`,
  };
}

function buildSuccessStatus(platformId, detail) {
  return {
    status: "connected",
    detail,
    healthScore: 100,
    webhookUrl: PLATFORM_WEBHOOK_PATHS[platformId],
    lastEventAt: Date.now(),
  };
}

function buildFailureStatus(platformId, detail, healthScore = 45) {
  return {
    status: "webhook_unreachable",
    detail,
    errorMsg: detail,
    healthScore,
    webhookUrl: PLATFORM_WEBHOOK_PATHS[platformId],
    lastEventAt: Date.now(),
  };
}

function writeWebhookResponse(res, result = {}) {
  const statusCode = Number(result.statusCode || 200);
  const responseType = result.responseType || "empty";
  const responseHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-STARCRAW-SECRET, X-STARCRAW-SIGNATURE, X-STARCRAW-TIMESTAMP, X-STARCRAW-WIDGET-TOKEN",
    ...(result.responseHeaders ?? {}),
  };

  if (responseType === "json") {
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      ...responseHeaders,
    });
    res.end(JSON.stringify(result.responseBody ?? {}));
    return;
  }

  if (responseType === "text") {
    res.writeHead(statusCode, responseHeaders);
    res.end(String(result.responseBody ?? ""));
    return;
  }

  res.writeHead(statusCode, responseHeaders);
  res.end();
}

export function createPlatformWebhookRouter({
  port,
  getPlatformAdapter,
  broadcastPlatformStatus,
  writeJson,
}) {
  async function handlePlatformWebhookHttpRequest(req, res, url) {
    if (!url?.pathname) return false;
    const entry = findPlatformRegistryEntryByWebhookPath(url.pathname);
    if (!entry?.webhook?.path) {
      return false;
    }

    const adapter = getPlatformAdapter(entry.id);

    if (req.method === "GET" && url.searchParams.get("probe") === "1") {
      writeJson(res, 200, buildProbePayload(entry, adapter));
      return true;
    }

    if (!entry.webhook.methods.includes(req.method || "")) {
      res.writeHead(405, {
        Allow: entry.webhook.methods.join(", "),
      });
      res.end();
      return true;
    }

    if (!adapter) {
      res.writeHead(404);
      res.end();
      return true;
    }

    if (typeof adapter.handleWebhookRequest !== "function") {
      broadcastPlatformStatus(entry.id, buildFailureStatus(entry.id, `${entry.id} 适配器未实现 handleWebhookRequest。`, 25));
      res.writeHead(501);
      res.end();
      return true;
    }

    try {
      const rawBody = req.method === "GET" ? "" : await collectRequestBody(req);
      const result = await adapter.handleWebhookRequest({
        method: req.method || "GET",
        url,
        headers: req.headers,
        query: Object.fromEntries(url.searchParams),
        body: rawBody,
      });
      const detail = result?.statusDetail
        || (result?.ok ? `已收到 ${entry.id} Webhook 回调。` : `${entry.id} Webhook 处理失败。`);
      const healthScore = result?.ok ? 100 : (typeof result?.healthScore === "number" ? result.healthScore : 45);

      broadcastPlatformStatus(
        entry.id,
        result?.ok ? buildSuccessStatus(entry.id, detail) : buildFailureStatus(entry.id, detail, healthScore),
      );
      writeWebhookResponse(res, result);
    } catch {
      broadcastPlatformStatus(entry.id, buildFailureStatus(entry.id, `${entry.id} Webhook 处理失败。`));
      res.writeHead(500);
      res.end();
    }

    return true;
  }

  async function probePlatformWebhook(platformId, configuredPublicUrl = "") {
    const webhookRoute = getPlatformWebhookConfig(platformId)?.path;
    if (!webhookRoute) {
      throw new Error("当前平台不是 Webhook 型接入，无需探测。");
    }

    const localProbeUrl = `http://127.0.0.1:${port}${webhookRoute}?probe=1`;
    const response = await fetch(localProbeUrl, { method: "GET" });
    const payload = await response.json().catch(() => ({}));
    const adapterReady = Boolean(payload?.adapterReady);
    const localReachable = response.ok;
    const pathMatches = configuredPublicUrl ? configuredPublicUrl.endsWith(webhookRoute) : false;
    const summary = localReachable
      ? adapterReady
        ? (configuredPublicUrl
            ? (pathMatches
                ? "Webhook 本机路由可达，适配器已挂载，公网地址路径也匹配。"
                : "Webhook 本机路由可达，适配器已挂载，但公网地址路径与预期不一致。")
            : "Webhook 本机路由可达，适配器已挂载，但还没填写公网地址标记。")
        : "Webhook 路由可达，但适配器尚未挂载，通常说明平台未成功启用。"
      : "Webhook 本机路由探测失败。";

    return {
      platformId,
      webhookRoute,
      localProbeUrl,
      configuredPublicUrl,
      localReachable,
      adapterReady,
      pathMatches,
      probeStatus: response.status,
      summary,
    };
  }

  return {
    handlePlatformWebhookHttpRequest,
    probePlatformWebhook,
  };
}
