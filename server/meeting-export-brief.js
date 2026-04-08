function cleanText(input) {
  return String(input ?? "").replace(/\r/g, "").trim();
}

function normalizeLine(line) {
  return String(line ?? "")
    .replace(/^[\s-]*[-*•]\s*/, "")
    .replace(/^[\d一二三四五六七八九十]+[.、)\s-]*/, "")
    .trim();
}

function splitIntoLines(input) {
  return cleanText(input)
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);
}

function extractSummaryItems(summary) {
  const lines = splitIntoLines(summary);
  if (lines.length > 0) return lines;

  return cleanText(summary)
    .split(/[。；;]+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function parseSummarySections(summary) {
  const lines = cleanText(summary).split("\n");
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headingMatch = line.match(/^([一二三四五六七八九十\d]+)[、.．]\s*(.+)$/);
    if (headingMatch) {
      if (current) {
        current.body = current.lines.join("\n").trim();
        sections.push(current);
      }
      current = {
        title: headingMatch[2].trim(),
        lines: [],
        body: "",
      };
      continue;
    }

    if (!current) {
      current = { title: "概述", lines: [], body: "" };
    }
    current.lines.push(line);
  }

  if (current) {
    current.body = current.lines.join("\n").trim();
    sections.push(current);
  }

  return sections;
}

function findSection(sections, keywords = []) {
  return sections.find(section => keywords.some(keyword => section.title.includes(keyword)));
}

function parseJsonObject(input) {
  const raw = cleanText(input);
  if (!raw) return null;

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeLine(item))
      .filter(Boolean);
  }

  const text = cleanText(value);
  if (!text) return fallback;
  return splitIntoLines(text);
}

function deriveRhythm(index) {
  return ["立即启动", "本周内", "两周内"][index] ?? "尽快推进";
}

function normalizeActionItem(value, index, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const task = cleanText(value.task ?? value.action ?? value.title ?? fallback.task);
    return {
      task: task || `执行动作 ${index + 1}`,
      owner: cleanText(value.owner ?? value.assignee ?? fallback.owner) || "待指定",
      deadline: cleanText(value.deadline ?? value.due ?? value.when ?? fallback.deadline) || deriveRhythm(index),
      successMetric: cleanText(value.successMetric ?? value.metric ?? value.result ?? fallback.successMetric) || "形成可复核结果",
      note: cleanText(value.note ?? value.remark ?? fallback.note),
    };
  }

  const text = cleanText(value);
  if (!text) {
    return {
      task: cleanText(fallback.task) || `执行动作 ${index + 1}`,
      owner: cleanText(fallback.owner) || "待指定",
      deadline: cleanText(fallback.deadline) || deriveRhythm(index),
      successMetric: cleanText(fallback.successMetric) || "形成可复核结果",
      note: cleanText(fallback.note),
    };
  }

  const ownerMatch = text.match(/(?:主责|负责人|owner)[:：]\s*([^，；。]+)/i);
  const deadlineMatch = text.match(/(?:截止|时间|节奏|deadline)[:：]\s*([^，；。]+)/i);
  const metricMatch = text.match(/(?:指标|标准|success\s*metric)[:：]\s*([^，；。]+)/i);
  const task = text
    .replace(/(?:主责|负责人|owner)[:：]\s*([^，；。]+)/gi, "")
    .replace(/(?:截止|时间|节奏|deadline)[:：]\s*([^，；。]+)/gi, "")
    .replace(/(?:指标|标准|success\s*metric)[:：]\s*([^，；。]+)/gi, "")
    .replace(/[；;，,]+$/g, "")
    .trim();

  return {
    task: task || `执行动作 ${index + 1}`,
    owner: ownerMatch?.[1]?.trim() || cleanText(fallback.owner) || "待指定",
    deadline: deadlineMatch?.[1]?.trim() || cleanText(fallback.deadline) || deriveRhythm(index),
    successMetric: metricMatch?.[1]?.trim() || cleanText(fallback.successMetric) || "形成可复核结果",
    note: cleanText(fallback.note),
  };
}

function normalizeRejectedAlternatives(value, fallback = []) {
  const items = Array.isArray(value) ? value : normalizeStringList(value, []);
  const normalized = items
    .map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const option = cleanText(item.option ?? item.name ?? item.title);
        const reason = cleanText(item.reason ?? item.why);
        if (!option && !reason) return null;
        return {
          option: option || "备选方向",
          reason: reason || "与最佳方案相比优先级不足",
        };
      }

      const text = cleanText(item);
      if (!text) return null;
      const [option, ...rest] = text.split(/[:：]/);
      return {
        option: option?.trim() || "备选方向",
        reason: rest.join("：").trim() || "与最佳方案相比优先级不足",
      };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : fallback;
}

export function buildFallbackMeetingExportBrief(meeting = {}) {
  const topic = cleanText(meeting.topic) || "会议议题";
  const summary = cleanText(meeting.summary);
  const sections = parseSummarySections(summary);
  const bestSection = findSection(sections, ["最佳方案", "最终方案", "结论"]);
  const reasonSection = findSection(sections, ["为什么", "胜出", "原因"]);
  const rejectSection = findSection(sections, ["被否决", "替代方案", "否决"]);
  const actionSection = findSection(sections, ["执行动作", "行动", "执行"]);
  const ownerSection = findSection(sections, ["主责", "推进", "负责人"]);
  const summaryItems = extractSummaryItems(summary);

  const bestPlan = cleanText(bestSection?.body) || summaryItems[0] || "建议按当前最佳方向推进。";
  const winningReasons = normalizeStringList(reasonSection?.body, summaryItems.slice(1, 4)).slice(0, 4);
  const rejectedAlternatives = normalizeRejectedAlternatives(rejectSection?.body, summaryItems.slice(4, 6).map((item) => ({
    option: item,
    reason: "与当前最佳方案相比优先级不足。",
  }))).slice(0, 3);
  const actionItems = normalizeStringList(actionSection?.body, summaryItems.slice(0, 3))
    .slice(0, 3)
    .map((item, index) => normalizeActionItem(item, index));
  const ownerRecommendation = cleanText(ownerSection?.body)
    || actionItems.find(item => item.owner && item.owner !== "待指定")?.owner
    || "建议由最贴近落地结果的负责人牵头推进。";

  return {
    reportTitle: `${topic} 决策结论`,
    executiveSummary: [bestPlan, winningReasons[0]].filter(Boolean).join("；").slice(0, 120),
    finalDecision: bestPlan,
    bestPlan,
    winningReasons: winningReasons.length > 0 ? winningReasons : ["当前最佳方案在综合收益与落地稳定性上更优。"],
    rejectedAlternatives: rejectedAlternatives.length > 0 ? rejectedAlternatives : [
      { option: "其他备选方向", reason: "优先级与确定性不如当前最佳方案。" },
    ],
    actionItems: actionItems.length > 0 ? actionItems : [
      normalizeActionItem("立即明确主责与分工", 0),
      normalizeActionItem("本周内完成关键资源准备", 1),
      normalizeActionItem("两周内验证阶段性结果", 2),
    ],
    ownerRecommendation,
    riskAlerts: [
      "推进过程中应持续校验结果是否偏离既定目标。",
      "如关键假设发生变化，应及时复盘并更新动作优先级。",
    ],
    decisionNote: "本稿仅保留会议结论与执行结果，不含讨论过程。",
  };
}

export function normalizeMeetingExportBrief(input, meeting = {}) {
  const fallback = buildFallbackMeetingExportBrief(meeting);
  const parsed = typeof input === "string" ? parseJsonObject(input) : input;
  const raw = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};

  const winningReasons = normalizeStringList(raw.winningReasons, fallback.winningReasons).slice(0, 5);
  const rejectedAlternatives = normalizeRejectedAlternatives(raw.rejectedAlternatives, fallback.rejectedAlternatives).slice(0, 3);
  const rawActions = Array.isArray(raw.actionItems) ? raw.actionItems : normalizeStringList(raw.actionItems, []);
  const actionItems = (rawActions.length > 0 ? rawActions : fallback.actionItems)
    .slice(0, 4)
    .map((item, index) => normalizeActionItem(item, index, fallback.actionItems[index]));
  const riskAlerts = normalizeStringList(raw.riskAlerts, fallback.riskAlerts).slice(0, 4);

  return {
    reportTitle: cleanText(raw.reportTitle) || fallback.reportTitle,
    executiveSummary: cleanText(raw.executiveSummary) || fallback.executiveSummary,
    finalDecision: cleanText(raw.finalDecision) || cleanText(raw.bestPlan) || fallback.finalDecision,
    bestPlan: cleanText(raw.bestPlan) || cleanText(raw.finalDecision) || fallback.bestPlan,
    winningReasons: winningReasons.length > 0 ? winningReasons : fallback.winningReasons,
    rejectedAlternatives: rejectedAlternatives.length > 0 ? rejectedAlternatives : fallback.rejectedAlternatives,
    actionItems: actionItems.length > 0 ? actionItems : fallback.actionItems,
    ownerRecommendation: cleanText(raw.ownerRecommendation ?? raw.recommendedOwner ?? raw.owner) || fallback.ownerRecommendation,
    riskAlerts: riskAlerts.length > 0 ? riskAlerts : fallback.riskAlerts,
    decisionNote: cleanText(raw.decisionNote ?? raw.note) || fallback.decisionNote,
  };
}

export function buildMeetingExportCaption(meeting = {}) {
  const brief = normalizeMeetingExportBrief(meeting.exportBrief, meeting);
  return `鹦鹉螺会议结论：${cleanText(meeting.topic) || brief.reportTitle}\n${brief.executiveSummary || brief.finalDecision}`;
}
