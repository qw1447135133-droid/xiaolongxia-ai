"use client";

import { useMemo, useState } from "react";
import { sendExecutionDispatch } from "@/lib/execution-dispatch";
import {
  buildUserProfileKickoffInstruction,
  getUserProfileMissingFields,
  normalizeUserProfile,
} from "@/lib/user-profile";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";

function formatTimestamp(value: number | null) {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UserProfileCenter() {
  const locale = useStore(s => s.locale);
  const workspaceRoot = useStore(s => s.workspaceRoot);
  const activeSessionId = useStore(s => s.activeSessionId);
  const userProfile = useStore(s => s.userProfile);
  const onboarding = useStore(s => s.userProfileOnboarding);
  const createChatSession = useStore(s => s.createChatSession);
  const setActiveChatSession = useStore(s => s.setActiveChatSession);
  const setTab = useStore(s => s.setTab);
  const startUserProfileOnboarding = useStore(s => s.startUserProfileOnboarding);
  const resetUserProfile = useStore(s => s.resetUserProfile);

  const [launching, setLaunching] = useState(false);
  const profile = useMemo(() => normalizeUserProfile(userProfile), [userProfile]);
  const missingFields = useMemo(() => getUserProfileMissingFields(profile), [profile]);
  const hasProfileData = useMemo(() => (
    profile.updatedAt !== null
    || profile.organizationType !== "unknown"
    || Boolean(profile.displayName)
    || Boolean(profile.organizationName)
    || Boolean(profile.industry)
    || Boolean(profile.workSummary)
    || Boolean(profile.roleTitle)
    || profile.responsibilities.length > 0
    || profile.goals.length > 0
    || Boolean(profile.targetAudience)
    || profile.preferredChannels.length > 0
    || onboarding.status !== "idle"
  ), [onboarding.status, profile]);
  const completion = useMemo(() => {
    const total = 5;
    return Math.max(0, Math.min(100, Math.round(((total - missingFields.length) / total) * 100)));
  }, [missingFields.length]);

  const profileCards = [
    {
      label: pickLocaleText(locale, { "zh-CN": "主体类型", "zh-TW": "主體類型", en: "Entity Type", ja: "主体タイプ" }),
      value:
        profile.organizationType === "business"
          ? pickLocaleText(locale, { "zh-CN": "企业 / 团队", "zh-TW": "企業 / 團隊", en: "Business / Team", ja: "企業 / チーム" })
          : profile.organizationType === "individual"
            ? pickLocaleText(locale, { "zh-CN": "个人", "zh-TW": "個人", en: "Individual", ja: "個人" })
            : pickLocaleText(locale, { "zh-CN": "待录入", "zh-TW": "待錄入", en: "Pending", ja: "未入力" }),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "行业 / 工作", "zh-TW": "行業 / 工作", en: "Industry / Work", ja: "業界 / 仕事" }),
      value: profile.industry || profile.workSummary || pickLocaleText(locale, { "zh-CN": "待录入", "zh-TW": "待錄入", en: "Pending", ja: "未入力" }),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "职位 / 角色", "zh-TW": "職位 / 角色", en: "Role", ja: "役割" }),
      value: profile.roleTitle || pickLocaleText(locale, { "zh-CN": "待录入", "zh-TW": "待錄入", en: "Pending", ja: "未入力" }),
    },
    {
      label: pickLocaleText(locale, { "zh-CN": "主要目标", "zh-TW": "主要目標", en: "Goals", ja: "主な目標" }),
      value: profile.goals[0] || pickLocaleText(locale, { "zh-CN": "待录入", "zh-TW": "待錄入", en: "Pending", ja: "未入力" }),
    },
  ];

  const handleLaunchIntake = async () => {
    if (launching) return;
    setLaunching(true);
    try {
      createChatSession(workspaceRoot ?? null);
      const nextState = useStore.getState();
      const sessionId = nextState.activeSessionId;
      startUserProfileOnboarding(sessionId, true);
      setTab("tasks");
      await sendExecutionDispatch({
        instruction: buildUserProfileKickoffInstruction(),
        source: "chat",
        includeUserMessage: true,
        taskDescription: "开始录入用户信息",
        sessionId,
        includeActiveProjectMemory: false,
        skipUserProfileIngestion: true,
      });
    } finally {
      setLaunching(false);
    }
  };

  const handleContinue = () => {
    if (!onboarding.sessionId) {
      setActiveChatSession(activeSessionId);
    } else {
      setActiveChatSession(onboarding.sessionId);
    }
    setTab("tasks");
  };

  const handleResetProfile = () => {
    resetUserProfile();
  };

  return (
    <div className="control-center" style={{ gap: 14 }}>
      <section className="control-center__panel" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="control-center__eyebrow">
              {pickLocaleText(locale, { "zh-CN": "User Context", "zh-TW": "User Context", en: "User Context", ja: "ユーザー文脈" })}
            </div>
            <div className="control-center__hero-title" style={{ marginTop: 0 }}>
              {pickLocaleText(locale, { "zh-CN": "用户信息画像", "zh-TW": "使用者資訊畫像", en: "User Profile", ja: "ユーザープロファイル" })}
            </div>
            <div className="control-center__copy" style={{ maxWidth: 760 }}>
              {pickLocaleText(locale, {
                "zh-CN": "系统会把用户的企业/个人身份、行业、职位、职责和目标整理成规范画像，之后所有任务都会默认站在这个用户视角思考。",
                "zh-TW": "系統會把使用者的企業/個人身份、行業、職位、職責與目標整理成規範畫像，之後所有任務都會預設站在這個使用者視角思考。",
                en: "The app normalizes who the user is, what they do, and what they need so later work stays aligned to that perspective.",
                ja: "利用者の立場・仕事・目的を正規化し、以降の作業がその視点に沿うようにします。",
              })}
            </div>
          </div>

          <div className="control-center__quick-actions" style={{ marginTop: 0, gap: 8 }}>
            <span className={`control-center__scenario-badge is-${completion >= 80 ? "ready" : onboarding.status === "collecting" ? "partial" : "blocked"}`}>
              {pickLocaleText(locale, {
                "zh-CN": onboarding.status === "collecting" ? "采集中" : completion >= 80 ? "已建立画像" : "待录入",
                "zh-TW": onboarding.status === "collecting" ? "採集中" : completion >= 80 ? "已建立畫像" : "待錄入",
                en: onboarding.status === "collecting" ? "Collecting" : completion >= 80 ? "Ready" : "Pending",
                ja: onboarding.status === "collecting" ? "収集中" : completion >= 80 ? "準備完了" : "未入力",
              })}
            </span>
            <button type="button" className="btn-primary" onClick={() => void handleLaunchIntake()} disabled={launching}>
              {launching
                ? pickLocaleText(locale, { "zh-CN": "启动中...", "zh-TW": "啟動中...", en: "Launching...", ja: "起動中..." })
                : pickLocaleText(locale, { "zh-CN": "录入信息", "zh-TW": "錄入資訊", en: "Start Intake", ja: "情報を入力" })}
            </button>
            <button type="button" className="btn-ghost" onClick={handleResetProfile} disabled={!hasProfileData || launching}>
              {pickLocaleText(locale, { "zh-CN": "清空用户信息", "zh-TW": "清空使用者資訊", en: "Clear Profile", ja: "プロフィールをクリア" })}
            </button>
            {onboarding.status === "collecting" && onboarding.sessionId ? (
              <button type="button" className="btn-ghost" onClick={handleContinue}>
                {pickLocaleText(locale, { "zh-CN": "继续访谈", "zh-TW": "繼續訪談", en: "Continue Chat", ja: "続ける" })}
              </button>
            ) : null}
          </div>
        </div>

        <div className="control-center__stats" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "完整度", "zh-TW": "完整度", en: "Coverage", ja: "網羅率" })}</div>
            <div className="control-center__stat-value" style={{ color: "var(--accent)" }}>{completion}%</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "待补字段", "zh-TW": "待補欄位", en: "Missing", ja: "不足項目" })}</div>
            <div className="control-center__stat-value" style={{ color: missingFields.length === 0 ? "#22c55e" : "#f59e0b" }}>{missingFields.length}</div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "当前状态", "zh-TW": "目前狀態", en: "Status", ja: "状態" })}</div>
            <div className="control-center__stat-value" style={{ color: onboarding.status === "collecting" ? "#f59e0b" : "var(--text)" }}>
              {pickLocaleText(locale, {
                "zh-CN": onboarding.status === "collecting" ? "访谈中" : completion >= 80 ? "可用" : "未开始",
                "zh-TW": onboarding.status === "collecting" ? "訪談中" : completion >= 80 ? "可用" : "未開始",
                en: onboarding.status === "collecting" ? "Interviewing" : completion >= 80 ? "Ready" : "Idle",
                ja: onboarding.status === "collecting" ? "ヒアリング中" : completion >= 80 ? "利用可" : "未開始",
              })}
            </div>
          </div>
          <div className="control-center__stat-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "最后更新", "zh-TW": "最後更新", en: "Updated", ja: "更新日時" })}</div>
            <div className="control-center__stat-value" style={{ fontSize: 15 }}>{formatTimestamp(profile.updatedAt)}</div>
          </div>
        </div>
      </section>

      <div className="control-center__columns" style={{ gridTemplateColumns: "1.15fr 0.85fr" }}>
        <section className="control-center__panel" style={{ padding: 16, display: "grid", gap: 12 }}>
          <div>
            <div className="control-center__panel-title">
              {pickLocaleText(locale, { "zh-CN": "当前用户画像", "zh-TW": "目前使用者畫像", en: "Current Profile", ja: "現在のプロファイル" })}
            </div>
            <div className="control-center__copy" style={{ marginTop: 4 }}>
              {profile.perspectiveSummary || pickLocaleText(locale, {
                "zh-CN": "还没有足够信息，建议先点击“录入信息”，让鹦鹉螺主动完成一轮引导访谈。",
                "zh-TW": "目前資訊仍不足，建議先點擊「錄入資訊」，讓鸚鵡螺主動完成一輪引導訪談。",
                en: "There is not enough information yet. Start intake to let Nautilus build the user profile.",
                ja: "まだ情報が不足しています。まずはヒアリングを開始してください。",
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {profileCards.map(card => (
              <article key={card.label} className="control-center__dispatch-card">
                <div className="control-center__stat-label">{card.label}</div>
                <div className="control-center__panel-title" style={{ marginTop: 6 }}>{card.value}</div>
              </article>
            ))}
          </div>

          {profile.responsibilities.length > 0 || profile.preferredChannels.length > 0 || profile.targetAudience ? (
            <div style={{ display: "grid", gap: 10 }}>
              {profile.responsibilities.length > 0 ? (
                <div className="control-center__dispatch-card">
                  <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "主要职责", "zh-TW": "主要職責", en: "Responsibilities", ja: "主な責務" })}</div>
                  <div className="control-center__dispatch-note">{profile.responsibilities.join("、")}</div>
                </div>
              ) : null}
              {profile.targetAudience ? (
                <div className="control-center__dispatch-card">
                  <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "服务对象", "zh-TW": "服務對象", en: "Audience", ja: "対象" })}</div>
                  <div className="control-center__dispatch-note">{profile.targetAudience}</div>
                </div>
              ) : null}
              {profile.preferredChannels.length > 0 ? (
                <div className="control-center__dispatch-card">
                  <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "常用平台", "zh-TW": "常用平台", en: "Channels", ja: "利用チャネル" })}</div>
                  <div className="control-center__dispatch-note">{profile.preferredChannels.join("、")}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="control-center__panel" style={{ padding: 16, display: "grid", gap: 12, alignContent: "start" }}>
          <div className="control-center__panel-title">
            {pickLocaleText(locale, { "zh-CN": "系统会自动补齐什么", "zh-TW": "系統會自動補齊什麼", en: "What Gets Normalized", ja: "自動正規化される内容" })}
          </div>
          <div className="control-center__copy">
            {pickLocaleText(locale, {
              "zh-CN": "用户不需要按字段填写。系统会在后台把自然语言回答自动整理成规范画像，并把这份画像持续注入后续所有任务。",
              "zh-TW": "使用者不需要按欄位填寫。系統會在背景把自然語言回答整理成規範畫像，並持續注入後續所有任務。",
              en: "Users can answer naturally. The app normalizes those replies into a structured profile and injects it into later work.",
              ja: "自然な回答を構造化プロファイルへ正規化し、以降の作業に継続注入します。",
            })}
          </div>

          <div className="control-center__dispatch-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "仍待补齐", "zh-TW": "仍待補齊", en: "Still Missing", ja: "未取得項目" })}</div>
            <div className="control-center__dispatch-note">
              {missingFields.length > 0 ? missingFields.join("、") : pickLocaleText(locale, {
                "zh-CN": "核心字段已经齐全，后续任务会默认按该用户视角推进。",
                "zh-TW": "核心欄位已齊全，後續任務會預設依該使用者視角推進。",
                en: "Core fields are complete. Future work will use this perspective by default.",
                ja: "主要項目は取得済みです。今後はこの視点を既定で利用します。",
              })}
            </div>
          </div>

          <div className="control-center__dispatch-card">
            <div className="control-center__stat-label">{pickLocaleText(locale, { "zh-CN": "引导问题范围", "zh-TW": "引導問題範圍", en: "Interview Scope", ja: "ヒアリング範囲" })}</div>
            <div className="control-center__dispatch-note">
              {pickLocaleText(locale, {
                "zh-CN": "企业 / 个人、从事什么工作、职位是什么、主要职责、当前目标、服务对象、常用平台。",
                "zh-TW": "企業 / 個人、從事什麼工作、職位是什麼、主要職責、目前目標、服務對象、常用平台。",
                en: "Business or individual, what they do, role, responsibilities, goals, audience, and preferred channels.",
                ja: "企業 / 個人、仕事、役割、責務、目標、対象、利用チャネル。",
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
