import os from "os";
import path from "path";
import fs from "fs";
import net from "net";
import { randomUUID } from "crypto";
import { chromium } from "playwright";

import { requestDesktopInstalledApplications, requestDesktopLaunch } from "./desktop-bridge.js";

const CDP_SESSION_WAIT_TIMEOUT_MS = 20_000;
const CDP_POLL_INTERVAL_MS = 400;
const CDP_DEFAULT_SNAPSHOT_LIMIT = 36;

const CDP_APP_PROFILES = [
  {
    id: "chrome",
    label: "Chrome",
    kind: "browser",
    aliases: ["browser", "chrome", "google chrome", "chrome.exe"],
    knownRelativePaths: [["Google", "Chrome", "Application", "chrome.exe"]],
    buildLaunchArgs: ({ port, url, userDataDir }) => [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      ...(url ? [url] : ["about:blank"]),
    ],
  },
  {
    id: "edge",
    label: "Edge",
    kind: "browser",
    aliases: ["edge", "microsoft edge", "msedge.exe"],
    knownRelativePaths: [["Microsoft", "Edge", "Application", "msedge.exe"]],
    buildLaunchArgs: ({ port, url, userDataDir }) => [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--new-window",
      ...(url ? [url] : ["about:blank"]),
    ],
  },
  {
    id: "feishu",
    label: "飞书",
    kind: "electron-app",
    aliases: ["feishu", "lark", "飞书"],
    buildLaunchArgs: ({ port }) => [`--remote-debugging-port=${port}`],
  },
  {
    id: "figma",
    label: "Figma",
    kind: "electron-app",
    aliases: ["figma"],
    buildLaunchArgs: ({ port }) => [`--remote-debugging-port=${port}`],
  },
  {
    id: "notion",
    label: "Notion",
    kind: "electron-app",
    aliases: ["notion"],
    buildLaunchArgs: ({ port }) => [`--remote-debugging-port=${port}`],
  },
];

const cdpSessions = new Map();
let lastCdpSessionId = null;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeBrowserUrl(url) {
  const trimmed = normalizeText(url);
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function buildProfileIdentitySet(profile) {
  const identities = new Set([profile.id, normalizeLower(profile.label)]);
  for (const alias of profile.aliases ?? []) {
    identities.add(normalizeLower(alias));
  }
  return identities;
}

function resolveCdpProfile({ app, target }) {
  const raw = normalizeLower(app || target);
  if (!raw) {
    return CDP_APP_PROFILES[0];
  }

  for (const profile of CDP_APP_PROFILES) {
    const identities = buildProfileIdentitySet(profile);
    if ([...identities].some(item => raw.includes(item))) {
      return profile;
    }
  }

  return null;
}

function findKnownBrowserTarget(profile) {
  if (!Array.isArray(profile?.knownRelativePaths)) return null;
  const candidates = [];
  const baseDirs = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter(Boolean);

  for (const baseDir of baseDirs) {
    for (const relativeParts of profile.knownRelativePaths) {
      const candidate = path.join(baseDir, ...relativeParts);
      if (fs.existsSync(candidate)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates[0] ?? null;
}

function findInstalledAppCandidate(installedApps, profile, explicitTarget = "") {
  const explicitLower = normalizeLower(explicitTarget);
  if (explicitLower) {
    const exact = installedApps.find(item => normalizeLower(item.target) === explicitLower);
    if (exact) return exact;
  }

  const aliases = buildProfileIdentitySet(profile);
  return installedApps.find((item) => {
    const haystack = [
      item.name,
      item.target,
      item.location,
    ]
      .filter(Boolean)
      .map(value => normalizeLower(value));

    return [...aliases].some(alias => haystack.some(value => value.includes(alias)));
  }) ?? null;
}

function createBrowserUserDataDir(profileId, port) {
  const dir = path.join(os.tmpdir(), "starcrawl-cdp", `${profileId}-${port}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function allocateTcpPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForDebuggerEndpoint(port, timeoutMs = CDP_SESSION_WAIT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const payload = await response.json();
        const webSocketDebuggerUrl = normalizeText(payload?.webSocketDebuggerUrl);
        if (webSocketDebuggerUrl) {
          return {
            endpoint: `http://127.0.0.1:${port}`,
            webSocketDebuggerUrl,
            browserVersion: normalizeText(payload?.Browser),
          };
        }
      }
    } catch {}
    await delay(CDP_POLL_INTERVAL_MS);
  }

  throw new Error(`未能在 ${timeoutMs}ms 内拿到 CDP 调试端口 ${port} 的响应。`);
}

async function resolveUsablePage(browser, normalizedUrl = "") {
  const deadline = Date.now() + CDP_SESSION_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const contexts = browser.contexts();
    const pages = contexts
      .flatMap(context => context.pages())
      .filter(page => {
        const currentUrl = normalizeText(page.url());
        return !currentUrl.startsWith("devtools://");
      });

    if (pages.length > 0) {
      const preferred = normalizedUrl
        ? pages.find(page => normalizeText(page.url()).includes(normalizedUrl))
        : null;
      const page = preferred ?? pages[0];
      return { page, context: contexts[0] ?? null };
    }

    if (contexts[0]) {
      const page = await contexts[0].newPage();
      if (normalizedUrl) {
        await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      }
      return { page, context: contexts[0] };
    }

    await delay(CDP_POLL_INTERVAL_MS);
  }

  throw new Error("已连接 CDP，但未找到可用页面。");
}

function compactSessionSummary(session, extra = {}) {
  return {
    sessionId: session.id,
    app: session.profile.id,
    label: session.profile.label,
    kind: session.profile.kind,
    port: session.port,
    endpoint: session.endpoint,
    target: session.target,
    launchArgs: session.launchArgs,
    pageTitle: session.lastPageTitle ?? "",
    pageUrl: session.lastPageUrl ?? "",
    connectedAt: session.connectedAt,
    ...extra,
  };
}

async function getSessionPage(session) {
  if (!session?.browser || !session.browser.isConnected()) {
    throw new Error("CDP 会话已断开，请重新打开应用。");
  }

  const contexts = session.browser.contexts();
  const pages = contexts
    .flatMap(context => context.pages())
    .filter(page => !normalizeText(page.url()).startsWith("devtools://"));

  const page = pages[0] ?? null;
  if (!page) {
    throw new Error("当前 CDP 会话没有可用页面。");
  }

  session.lastPageTitle = await page.title().catch(() => session.lastPageTitle ?? "");
  session.lastPageUrl = normalizeText(page.url());
  return page;
}

async function connectCdpBrowser({ endpoint }) {
  const browser = await chromium.connectOverCDP(endpoint);
  browser.on("disconnected", () => {
    for (const [sessionId, session] of cdpSessions.entries()) {
      if (session.browser !== browser) continue;
      cdpSessions.delete(sessionId);
      if (lastCdpSessionId === sessionId) {
        lastCdpSessionId = null;
      }
    }
  });
  return browser;
}

function buildActionableElementSnapshot(page, limit) {
  return page.evaluate((maxElements) => {
    function isVisible(element) {
      const style = window.getComputedStyle(element);
      if (!style || style.visibility === "hidden" || style.display === "none") {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function escapeAttr(value) {
      return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }

    function cssPart(element) {
      const tag = element.tagName.toLowerCase();
      const id = element.getAttribute("id");
      if (id) {
        return `#${CSS.escape(id)}`;
      }

      const dataTestId = element.getAttribute("data-testid");
      if (dataTestId) {
        return `${tag}[data-testid="${escapeAttr(dataTestId)}"]`;
      }

      const name = element.getAttribute("name");
      if (name) {
        return `${tag}[name="${escapeAttr(name)}"]`;
      }

      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) {
        return `${tag}[aria-label="${escapeAttr(ariaLabel)}"]`;
      }

      const role = element.getAttribute("role");
      if (role) {
        return `${tag}[role="${escapeAttr(role)}"]`;
      }

      const siblings = Array.from(element.parentElement?.children ?? []).filter(sibling => sibling.tagName === element.tagName);
      if (siblings.length <= 1) {
        return tag;
      }
      const index = siblings.indexOf(element) + 1;
      return `${tag}:nth-of-type(${index})`;
    }

    function cssPath(element) {
      const parts = [];
      let current = element;
      let guard = 0;
      while (current && current.nodeType === Node.ELEMENT_NODE && guard < 8) {
        const part = cssPart(current);
        parts.unshift(part);
        if (part.startsWith("#")) {
          break;
        }
        current = current.parentElement;
        guard += 1;
      }
      return parts.join(" > ");
    }

    function inferRole(element) {
      const explicitRole = element.getAttribute("role");
      if (explicitRole) return explicitRole;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "link";
      if (tag === "button") return "button";
      if (tag === "input") {
        const type = (element.getAttribute("type") || "text").toLowerCase();
        return type === "checkbox" ? "checkbox" : type === "radio" ? "radio" : "textbox";
      }
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      if (element.getAttribute("contenteditable") === "true") return "textbox";
      return tag;
    }

    function describe(element) {
      const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
      const ariaLabel = (element.getAttribute("aria-label") || "").trim();
      const placeholder = ("placeholder" in element ? (element.placeholder || "") : "").trim();
      const value = ("value" in element ? (element.value || "") : "").trim();
      const name = ariaLabel || placeholder || value || text || (element.getAttribute("title") || "").trim();
      return {
        text: text.slice(0, 120),
        name: name.slice(0, 120),
        placeholder: placeholder.slice(0, 120),
        value: value.slice(0, 120),
      };
    }

    const candidates = Array.from(document.querySelectorAll(
      'button, a, input, textarea, select, summary, [role], [contenteditable="true"]',
    ));

    const elements = [];
    const seenSelectors = new Set();

    for (const element of candidates) {
      if (!isVisible(element)) continue;
      const selector = cssPath(element);
      if (!selector || seenSelectors.has(selector)) continue;
      seenSelectors.add(selector);

      const rect = element.getBoundingClientRect();
      const described = describe(element);
      const ref = `e${elements.length + 1}`;
      elements.push({
        ref,
        selector,
        tag: element.tagName.toLowerCase(),
        role: inferRole(element),
        name: described.name,
        text: described.text,
        placeholder: described.placeholder,
        value: described.value,
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });

      if (elements.length >= maxElements) {
        break;
      }
    }

    return {
      title: document.title,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      elements,
      textPreview: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 800),
    };
  }, limit);
}

function resolveSessionTarget(sessionId) {
  if (sessionId) {
    const exact = cdpSessions.get(sessionId);
    if (!exact) {
      throw new Error("未找到指定的 CDP 会话。");
    }
    return exact;
  }

  if (lastCdpSessionId && cdpSessions.has(lastCdpSessionId)) {
    return cdpSessions.get(lastCdpSessionId);
  }

  throw new Error("当前没有可用的 CDP 会话，请先打开支持 CDP 的应用。");
}

function resolveLocator(page, session, args) {
  const ref = normalizeText(args.ref);
  const selector = normalizeText(args.selector);
  const role = normalizeText(args.role);
  const name = normalizeText(args.name || args.label);
  const text = normalizeText(args.textMatch || args.targetText);

  if (ref) {
    const snapshotEntry = session.lastSnapshotRefs?.[ref];
    if (!snapshotEntry?.selector) {
      throw new Error(`未找到 ref=${ref} 对应的结构化元素，请先重新抓取 desktop_cdp_snapshot。`);
    }
    return page.locator(snapshotEntry.selector).first();
  }

  if (selector) {
    return page.locator(selector).first();
  }

  if (role && name) {
    return page.getByRole(role, { name, exact: false }).first();
  }

  if (text) {
    return page.getByText(text, { exact: false }).first();
  }

  throw new Error("缺少可定位参数。请提供 ref，或 selector，或 role+name，或 textMatch。");
}

export async function openDesktopCdpApp(args = {}, context = {}) {
  const app = normalizeText(args.app || args.target || "chrome");
  const explicitTarget = normalizeText(args.target);
  const profile = resolveCdpProfile({ app, target: explicitTarget });
  if (!profile) {
    throw new Error("该应用当前不在 CDP App Mode 支持列表中。请使用 chrome、edge、feishu、figma 或 notion。");
  }

  if (!args.forceNew) {
    const reusable = [...cdpSessions.values()].find(item => item.profile.id === profile.id && item.browser?.isConnected());
    if (reusable) {
      const page = await getSessionPage(reusable);
      const normalizedUrl = profile.kind === "browser" ? normalizeBrowserUrl(args.url) : "";
      if (normalizedUrl) {
        await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
        reusable.lastPageUrl = normalizeText(page.url());
        reusable.lastPageTitle = await page.title().catch(() => reusable.lastPageTitle ?? "");
      }
      lastCdpSessionId = reusable.id;
      return compactSessionSummary(reusable, { reused: true });
    }
  }

  const installedApps = await requestDesktopInstalledApplications({ forceRefresh: Boolean(args.forceRefresh) }, {
    preferredWs: context.desktopClientWs,
  });

  const installedCandidate = findInstalledAppCandidate(installedApps, profile, explicitTarget);
  const launchTarget = explicitTarget || installedCandidate?.target || findKnownBrowserTarget(profile);
  if (!launchTarget) {
    throw new Error(`未找到 ${profile.label} 的可启动程序。请确认本机已安装，并且允许桌面端启动。`);
  }

  const port = await allocateTcpPort();
  const normalizedUrl = profile.kind === "browser" ? normalizeBrowserUrl(args.url) : "";
  const userDataDir = profile.kind === "browser" ? createBrowserUserDataDir(profile.id, port) : "";
  const launchArgs = profile.buildLaunchArgs({
    port,
    url: normalizedUrl,
    userDataDir,
  });

  await requestDesktopLaunch({
    target: launchTarget,
    args: launchArgs,
    reason: normalizeText(args.reason) || `以 CDP 模式打开 ${profile.label}`,
  }, {
    preferredWs: context.desktopClientWs,
  });

  const endpointInfo = await waitForDebuggerEndpoint(port);
  const browser = await connectCdpBrowser({ endpoint: endpointInfo.endpoint });
  const { page } = await resolveUsablePage(browser, normalizedUrl);

  const session = {
    id: `cdp-${randomUUID()}`,
    profile,
    target: launchTarget,
    port,
    endpoint: endpointInfo.endpoint,
    browser,
    connectedAt: Date.now(),
    browserVersion: endpointInfo.browserVersion,
    lastPageTitle: await page.title().catch(() => ""),
    lastPageUrl: normalizeText(page.url()),
    lastSnapshotRefs: {},
    launchArgs,
  };

  cdpSessions.set(session.id, session);
  lastCdpSessionId = session.id;
  return compactSessionSummary(session, { reused: false });
}

export async function snapshotDesktopCdpApp(args = {}) {
  const session = resolveSessionTarget(normalizeText(args.sessionId));
  const limit = Math.max(8, Math.min(80, Number(args.limit) || CDP_DEFAULT_SNAPSHOT_LIMIT));
  const page = await getSessionPage(session);
  const snapshot = await buildActionableElementSnapshot(page, limit);
  session.lastSnapshotRefs = Object.fromEntries(
    snapshot.elements.map(item => [item.ref, { selector: item.selector, role: item.role, name: item.name, text: item.text }]),
  );
  session.lastPageTitle = snapshot.title;
  session.lastPageUrl = snapshot.url;
  lastCdpSessionId = session.id;

  return {
    ...compactSessionSummary(session),
    viewport: snapshot.viewport,
    textPreview: snapshot.textPreview,
    elements: snapshot.elements.map(({ selector, ...rest }) => rest),
  };
}

export async function actDesktopCdpApp(args = {}) {
  const session = resolveSessionTarget(normalizeText(args.sessionId));
  const page = await getSessionPage(session);
  const action = normalizeLower(args.action || "click");
  const timeoutMs = Math.max(1_000, Math.min(20_000, Number(args.timeoutMs) || 8_000));
  const locator = action === "press" && !args.ref && !args.selector && !args.role && !args.name && !args.label && !args.textMatch && !args.targetText
    ? null
    : resolveLocator(page, session, args);

  if (locator) {
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    await locator.scrollIntoViewIfNeeded().catch(() => {});
  }

  switch (action) {
    case "click":
      await locator.click({ timeout: timeoutMs });
      break;
    case "double_click":
      await locator.dblclick({ timeout: timeoutMs });
      break;
    case "hover":
      await locator.hover({ timeout: timeoutMs });
      break;
    case "fill":
      await locator.fill(normalizeText(args.value), { timeout: timeoutMs });
      break;
    case "type":
      await locator.click({ timeout: timeoutMs });
      await locator.type(normalizeText(args.value), { delay: Math.max(0, Math.min(120, Number(args.delayMs) || 18)), timeout: timeoutMs });
      break;
    case "press":
      if (locator) {
        await locator.press(normalizeText(args.key), { timeout: timeoutMs });
      } else {
        await page.keyboard.press(normalizeText(args.key));
      }
      break;
    case "navigate":
      await page.goto(normalizeBrowserUrl(args.url), { waitUntil: "domcontentloaded", timeout: timeoutMs });
      break;
    default:
      throw new Error(`不支持的 CDP 动作：${action}`);
  }

  session.lastPageTitle = await page.title().catch(() => session.lastPageTitle ?? "");
  session.lastPageUrl = normalizeText(page.url());
  lastCdpSessionId = session.id;

  return compactSessionSummary(session, {
    action,
    ok: true,
  });
}

export function listDesktopCdpSessions() {
  return [...cdpSessions.values()].map(session => compactSessionSummary(session));
}
