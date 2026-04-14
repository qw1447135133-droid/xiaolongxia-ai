import type { AppTab, AutomationMode, UiLocale } from "@/store/types";

export function pickLocaleText<T>(locale: UiLocale, values: Record<UiLocale, T>): T {
  return values[locale];
}

export const UI_LOCALE_OPTIONS: Array<{ id: UiLocale; shortLabel: string; fullLabel: string }> = [
  { id: "zh-CN", shortLabel: "简", fullLabel: "简体中文" },
  { id: "zh-TW", shortLabel: "繁", fullLabel: "繁體中文" },
  { id: "en", shortLabel: "EN", fullLabel: "English" },
  { id: "ja", shortLabel: "日", fullLabel: "日本語" },
];

type LocaleText = {
  nav: Record<AppTab, { label: string; eyebrow: string }>;
  common: {
    newChat: string;
    hideSidebar: string;
    openSidebar: string;
    showSidebar: string;
    connection: string;
    desktop: string;
    running: string;
    mode: string;
    tokens: string;
    workflows: string;
      online: string;
      connecting: string;
      offline: string;
      partial: string;
      paused: string;
    manual: string;
    supervised: string;
    autonomous: string;
    provider: string;
    platforms: string;
    currentMode: string;
      currentProject: string;
      currentProjectSubtitle: string;
      navigation: string;
      systemSummary: string;
    systemSummarySubtitle: string;
    sessions: string;
    sessionsSubtitle: string;
    quickTasks: string;
    quickTasksSubtitle: string;
    scheduledTasks: string;
    scheduledTasksSubtitle: string;
    teamStatus: string;
    teamStatusSubtitle: string;
    activity: string;
    activitySubtitle: string;
    executionTrail: string;
    executionTrailSubtitle: string;
    desktopSummary: string;
    currentScene: string;
    sidebar: string;
    expanded: string;
    collapsed: string;
    workingMode: string;
    desktopOnline: string;
    waitingTakeover: string;
    openControlCenter: string;
    backToChat: string;
    checkSettings: string;
    manualTakeover: string;
    desktopConnection: string;
    messagePipeline: string;
    synced: string;
    recoveryNeeded: string;
    pipelineRecoveryTitle: string;
    desktopCapabilityTitle: string;
    brandEyebrow: string;
    desktopBrandEyebrow: string;
    desktopBrandTitle: string;
    iosCapsule: string;
    gptCapsule: string;
    generalProject: string;
  };
  dashboard: {
    eyebrow: string;
    title: string;
    copy: string;
    teamModePrefix: string;
    startTitle: string;
    startHint: string;
    continueEyebrow: string;
    continueCopy: string;
    surfacesEyebrow: string;
    surfacesCopy: string;
    chatCard: { eyebrow: string; title: string; copy: string; action: string };
    deskCard: { eyebrow: string; title: string; copy: string; action: string };
    meetCard: { eyebrow: string; title: string; copy: string; action: string };
    controlCard: { eyebrow: string; title: string; copy: string; action: string };
    runningRoles: string;
    runningRolesHint: string;
    completedReplies: string;
    completedRepliesHint: string;
    workflowRuns: string;
    workflowRunsHint: string;
    deskContext: string;
    deskContextHint: string;
  };
  tasks: {
    eyebrow: string;
    title: string;
    enterToSend: string;
    shiftEnter: string;
    newChatBadge: string;
    emptyTitle: string;
    emptyCopy: string;
    composerTitle: string;
    composerHint: string;
  };
};

const TEXT: Record<UiLocale, LocaleText> = {
  "zh-CN": {
    nav: {
      dashboard: { label: "首页", eyebrow: "Home" },
      tasks: { label: "聊天", eyebrow: "Chat" },
      workspace: { label: "工作区", eyebrow: "Desk" },
      dispatch: { label: "实时任务日志", eyebrow: "Live Log" },
      meeting: { label: "会议", eyebrow: "Meet" },
      settings: { label: "控制台", eyebrow: "Control" },
    },
    common: {
      newChat: "新对话",
      hideSidebar: "隐藏侧栏",
      openSidebar: "打开侧栏",
      showSidebar: "显示侧栏",
      connection: "连接",
      desktop: "桌面",
      running: "运行中",
      mode: "模式",
      tokens: "Tokens",
      workflows: "工作流",
      online: "在线",
      connecting: "连接中",
      offline: "离线",
      partial: "部分可用",
      paused: "已暂停",
      manual: "人工",
      supervised: "监督",
      autonomous: "自治",
      provider: "Provider",
      platforms: "平台",
      currentMode: "当前模式",
      currentProject: "当前项目",
      currentProjectSubtitle: "当前会话所属项目摘要",
      navigation: "导航",
      systemSummary: "系统摘要",
      systemSummarySubtitle: "当前工作台能力",
      sessions: "会话",
      sessionsSubtitle: "最近聊天与草稿",
      quickTasks: "快捷任务",
      quickTasksSubtitle: "一键派发常用动作",
      scheduledTasks: "计划任务",
      scheduledTasksSubtitle: "定时与补跑入口",
      teamStatus: "团队状态",
      teamStatusSubtitle: "当前角色与负载",
      activity: "动态记录",
      activitySubtitle: "最近执行结果",
      executionTrail: "执行轨迹",
      executionTrailSubtitle: "复用现有 run 与活动流观察 dispatch",
      desktopSummary: "桌面态摘要",
      currentScene: "当前场景",
      sidebar: "侧栏",
      expanded: "展开",
      collapsed: "收起",
      workingMode: "工作模式",
      desktopOnline: "桌面在线",
      waitingTakeover: "等待接管",
      openControlCenter: "打开控制台",
      backToChat: "回到聊天",
      checkSettings: "去检查设置",
      manualTakeover: "手动接管",
      desktopConnection: "桌面连接",
      messagePipeline: "消息链路",
      synced: "已同步",
      recoveryNeeded: "待恢复",
      pipelineRecoveryTitle: "消息链路需要恢复",
      desktopCapabilityTitle: "桌面能力尚未完全接入",
      brandEyebrow: "STARCRAW OS",
      desktopBrandEyebrow: "Desktop Workspace",
      desktopBrandTitle: "STARCRAW",
      iosCapsule: "iOS 玻璃感",
      gptCapsule: "GPT 式流转",
      generalProject: "通用项目",
    },
    dashboard: {
      eyebrow: "A ChatGPT-like command center",
      title: "今天想让 STARCRAW 帮你完成什么？",
      copy: "主界面只保留一个清晰的对话入口，其他工具和状态都收进侧栏。你可以像用 ChatGPT 一样先说目标，再从聊天、会议和控制台继续推进。",
      teamModePrefix: "当前团队模式",
      startTitle: "像 ChatGPT 一样开始",
      startHint: "直接提问、下发任务，或把当前项目上下文带进来。主页只负责开始，深入工作去左侧功能区。",
      continueEyebrow: "Continue Working",
      continueCopy: "首页只保留最值得继续推进的入口，其余状态交给右侧监督侧轨。",
      surfacesEyebrow: "Core Surfaces",
      surfacesCopy: "需要深入处理时，从这里切到具体工作面，不在首页堆更多仪表盘。",
      chatCard: {
        eyebrow: "Chat",
        title: "进入对话页",
        copy: "把输入框固定到底部，中间专心看对话，就像 ChatGPT 主聊天页。",
        action: "打开聊天",
      },
      deskCard: {
        eyebrow: "Context",
        title: "查看项目上下文",
        copy: "文件预览、上下文包和 Desk Notes 仍然可用，但统一回收到聊天与控制台内。",
        action: "打开聊天",
      },
      meetCard: {
        eyebrow: "Meet",
        title: "发起团队会议",
        copy: "当任务需要多角色辩论时，直接切到会议页，不打断聊天页心智。",
        action: "打开会议",
      },
      controlCard: {
        eyebrow: "Control",
        title: "配置与扩展",
        copy: "模型、插件、技能、工作流模板都放进控制台，侧边统一收纳。",
        action: "打开控制台",
      },
      runningRoles: "运行中角色",
      runningRolesHint: "团队当前正在处理的任务数量",
      completedReplies: "已完成回复",
      completedRepliesHint: "本轮会话里已经产出的有效结果",
      workflowRuns: "工作流 Run",
      workflowRunsHint: "可复用的编排入口与历史记录",
      deskContext: "Desk 上下文",
      deskContextHint: "当前项目下的固定引用、异步笔记和项目记忆总量",
    },
    tasks: {
      eyebrow: "Conversation",
      title: "中轴对话区",
      enterToSend: "Enter 发送",
      shiftEnter: "Shift + Enter 换行",
      newChatBadge: "New Chat",
      emptyTitle: "先用一句话告诉团队，你现在想推进什么。",
      emptyCopy: "这里保留和 ChatGPT 类似的中轴对话体验。你可以直接发目标，也可以先点一个起手式，再继续补充上下文。",
      composerTitle: "给团队继续发消息",
      composerHint: "主对话区保持干净，中间只看消息流；所有辅助能力都放在左侧。",
    },
  },
  "zh-TW": {
    nav: {
      dashboard: { label: "首頁", eyebrow: "Home" },
      tasks: { label: "聊天", eyebrow: "Chat" },
      workspace: { label: "工作區", eyebrow: "Desk" },
      dispatch: { label: "即時任務日誌", eyebrow: "Live Log" },
      meeting: { label: "會議", eyebrow: "Meet" },
      settings: { label: "控制台", eyebrow: "Control" },
    },
    common: {
      newChat: "新對話",
      hideSidebar: "隱藏側欄",
      openSidebar: "打開側欄",
      showSidebar: "顯示側欄",
      connection: "連線",
      desktop: "桌面",
      running: "執行中",
      mode: "模式",
      tokens: "Tokens",
      workflows: "工作流",
      online: "在線",
      connecting: "連線中",
      offline: "離線",
      partial: "部分可用",
      paused: "已暫停",
      manual: "人工",
      supervised: "監督",
      autonomous: "自治",
      provider: "Provider",
      platforms: "平台",
      currentMode: "當前模式",
      currentProject: "當前專案",
      currentProjectSubtitle: "當前會話所屬專案摘要",
      navigation: "導航",
      systemSummary: "系統摘要",
      systemSummarySubtitle: "目前工作台能力",
      sessions: "會話",
      sessionsSubtitle: "最近聊天與草稿",
      quickTasks: "快捷任務",
      quickTasksSubtitle: "一鍵派發常用動作",
      scheduledTasks: "排程任務",
      scheduledTasksSubtitle: "定時與補跑入口",
      teamStatus: "團隊狀態",
      teamStatusSubtitle: "目前角色與負載",
      activity: "動態記錄",
      activitySubtitle: "最近執行結果",
      executionTrail: "執行軌跡",
      executionTrailSubtitle: "沿用既有 run 與活動流觀察 dispatch",
      desktopSummary: "桌面態摘要",
      currentScene: "當前場景",
      sidebar: "側欄",
      expanded: "展開",
      collapsed: "收起",
      workingMode: "工作模式",
      desktopOnline: "桌面在線",
      waitingTakeover: "等待接管",
      openControlCenter: "打開控制台",
      backToChat: "回到聊天",
      checkSettings: "去檢查設定",
      manualTakeover: "手動接管",
      desktopConnection: "桌面連線",
      messagePipeline: "消息鏈路",
      synced: "已同步",
      recoveryNeeded: "待恢復",
      pipelineRecoveryTitle: "消息鏈路需要恢復",
      desktopCapabilityTitle: "桌面能力尚未完全接入",
      brandEyebrow: "STARCRAW OS",
      desktopBrandEyebrow: "Desktop Workspace",
      desktopBrandTitle: "STARCRAW",
      iosCapsule: "iOS 玻璃感",
      gptCapsule: "GPT 式流程",
      generalProject: "通用專案",
    },
    dashboard: {
      eyebrow: "A ChatGPT-like command center",
      title: "今天想讓 STARCRAW 幫你完成什麼？",
      copy: "主介面只保留一個清晰的對話入口，其他工具與狀態都收進側欄。你可以像用 ChatGPT 一樣先說目標，再從工作區、會議、控制台繼續深入。",
      teamModePrefix: "當前團隊模式",
      startTitle: "像 ChatGPT 一樣開始",
      startHint: "直接提問、下發任務，或把目前專案上下文帶進來。首頁只負責開始，深入工作去左側功能區。",
      continueEyebrow: "Continue Working",
      continueCopy: "首頁只保留最值得繼續推進的入口，其餘狀態交給右側監督側軌。",
      surfacesEyebrow: "Core Surfaces",
      surfacesCopy: "需要深入處理時，從這裡切到具體工作面，不在首頁堆更多儀表板。",
      chatCard: {
        eyebrow: "Chat",
        title: "進入對話頁",
        copy: "把輸入框固定到底部，中間專心看對話，就像 ChatGPT 主聊天頁。",
        action: "打開聊天",
      },
      deskCard: {
        eyebrow: "Context",
        title: "查看專案上下文",
        copy: "檔案預覽、上下文包與 Desk Notes 仍然可用，但統一收回聊天與控制台內。",
        action: "打開聊天",
      },
      meetCard: {
        eyebrow: "Meet",
        title: "發起團隊會議",
        copy: "當任務需要多角色辯論時，直接切到會議頁，不打斷聊天頁心智。",
        action: "打開會議",
      },
      controlCard: {
        eyebrow: "Control",
        title: "配置與擴展",
        copy: "模型、插件、技能、工作流模板都放進控制台，側邊統一收納。",
        action: "打開控制台",
      },
      runningRoles: "執行中角色",
      runningRolesHint: "團隊當前正在處理的任務數量",
      completedReplies: "已完成回覆",
      completedRepliesHint: "本輪會話裡已產出的有效結果",
      workflowRuns: "工作流 Run",
      workflowRunsHint: "可複用的編排入口與歷史記錄",
      deskContext: "Desk 上下文",
      deskContextHint: "當前專案下的固定引用、異步筆記與專案記憶總量",
    },
    tasks: {
      eyebrow: "Conversation",
      title: "中軸對話區",
      enterToSend: "Enter 發送",
      shiftEnter: "Shift + Enter 換行",
      newChatBadge: "New Chat",
      emptyTitle: "先用一句話告訴團隊，你現在想推進什麼。",
      emptyCopy: "這裡保留和 ChatGPT 類似的中軸對話體驗。你可以直接發目標，也可以先點一個起手式，再繼續補充上下文。",
      composerTitle: "繼續給團隊發消息",
      composerHint: "主對話區保持乾淨，中間只看消息流；所有輔助能力都放在左側。",
    },
  },
  en: {
    nav: {
      dashboard: { label: "Home", eyebrow: "Home" },
      tasks: { label: "Chat", eyebrow: "Chat" },
      workspace: { label: "Workspace", eyebrow: "Desk" },
      dispatch: { label: "Live Task Log", eyebrow: "Live Log" },
      meeting: { label: "Meetings", eyebrow: "Meet" },
      settings: { label: "Control", eyebrow: "Control" },
    },
    common: {
      newChat: "New Chat",
      hideSidebar: "Hide Sidebar",
      openSidebar: "Open Sidebar",
      showSidebar: "Show Sidebar",
      connection: "Connection",
      desktop: "Desktop",
      running: "Running",
      mode: "Mode",
      tokens: "Tokens",
      workflows: "Workflows",
      online: "Online",
      connecting: "Connecting",
      offline: "Offline",
      partial: "Partial",
      paused: "Paused",
      manual: "Manual",
      supervised: "Supervised",
      autonomous: "Autonomous",
      provider: "Providers",
      platforms: "Platforms",
      currentMode: "Current Mode",
      currentProject: "Current Project",
      currentProjectSubtitle: "Project summary for the current session",
      navigation: "Navigation",
      systemSummary: "System Summary",
      systemSummarySubtitle: "Current workspace capabilities",
      sessions: "Sessions",
      sessionsSubtitle: "Recent chats and drafts",
      quickTasks: "Quick Tasks",
      quickTasksSubtitle: "One-click shortcuts for common actions",
      scheduledTasks: "Scheduled Tasks",
      scheduledTasksSubtitle: "Timers and replay entry points",
      teamStatus: "Team Status",
      teamStatusSubtitle: "Current roles and load",
      activity: "Activity",
      activitySubtitle: "Recent execution results",
      executionTrail: "Execution Trail",
      executionTrailSubtitle: "Observe dispatch through runs and activity flow",
      desktopSummary: "Desktop Snapshot",
      currentScene: "Current Surface",
      sidebar: "Sidebar",
      expanded: "Expanded",
      collapsed: "Collapsed",
      workingMode: "Work Mode",
      desktopOnline: "Desktop Online",
      waitingTakeover: "Waiting for Takeover",
      openControlCenter: "Open Control Center",
      backToChat: "Back to Chat",
      checkSettings: "Check Settings",
      manualTakeover: "Manual Takeover",
      desktopConnection: "Desktop Link",
      messagePipeline: "Message Pipeline",
      synced: "Synced",
      recoveryNeeded: "Needs Recovery",
      pipelineRecoveryTitle: "Message pipeline needs recovery",
      desktopCapabilityTitle: "Desktop capability is not fully connected yet",
      brandEyebrow: "STARCRAW OS",
      desktopBrandEyebrow: "Desktop Workspace",
      desktopBrandTitle: "STARCRAW",
      iosCapsule: "iOS Glass",
      gptCapsule: "GPT-style Flow",
      generalProject: "General",
    },
    dashboard: {
      eyebrow: "A ChatGPT-like command center",
      title: "What do you want STARCRAW to help with today?",
      copy: "The main view keeps one clear conversation entry point while everything else lives in the side rails. Start with a goal like ChatGPT, then continue through chat, meetings, and control surfaces.",
      teamModePrefix: "Active team mode",
      startTitle: "Start like ChatGPT",
      startHint: "Ask directly, dispatch a task, or inject the current project context. The home view is only for starting; deeper work stays in the side surfaces.",
      continueEyebrow: "Continue Working",
      continueCopy: "Home only keeps the most important next entry points. The rest of the status belongs to the supervision rail.",
      surfacesEyebrow: "Core Surfaces",
      surfacesCopy: "When deeper work is needed, jump into a focused surface instead of stacking more dashboards on the home view.",
      chatCard: {
        eyebrow: "Chat",
        title: "Open the chat view",
        copy: "Keep the composer pinned to the bottom and focus on the conversation in the center, just like ChatGPT.",
        action: "Open Chat",
      },
      deskCard: {
        eyebrow: "Context",
        title: "Review project context",
        copy: "File previews, context packs, and Desk Notes are still available, now folded back into chat and control surfaces.",
        action: "Open Chat",
      },
      meetCard: {
        eyebrow: "Meet",
        title: "Start a team meeting",
        copy: "When a task needs debate across roles, jump into the meeting view without breaking chat flow.",
        action: "Open Meetings",
      },
      controlCard: {
        eyebrow: "Control",
        title: "Configure and extend",
        copy: "Models, plugins, skills, and workflow templates all live inside the control center.",
        action: "Open Control",
      },
      runningRoles: "Running Roles",
      runningRolesHint: "How many tasks the team is processing right now",
      completedReplies: "Completed Replies",
      completedRepliesHint: "Useful results already produced in this session",
      workflowRuns: "Workflow Runs",
      workflowRunsHint: "Reusable orchestration entry points and history",
      deskContext: "Desk Context",
      deskContextHint: "Pinned references, async notes, and project memory for the current project",
    },
    tasks: {
      eyebrow: "Conversation",
      title: "Centered Chat",
      enterToSend: "Enter to send",
      shiftEnter: "Shift + Enter for newline",
      newChatBadge: "New Chat",
      emptyTitle: "Tell the team in one sentence what you want to move forward.",
      emptyCopy: "This keeps a centered ChatGPT-like conversation experience. Start with a goal or tap a starter and then add more context.",
      composerTitle: "Send another message to the team",
      composerHint: "Keep the main conversation clean and focused. Supporting tools stay in the side rail.",
    },
  },
  ja: {
    nav: {
      dashboard: { label: "ホーム", eyebrow: "Home" },
      tasks: { label: "チャット", eyebrow: "Chat" },
      workspace: { label: "ワークスペース", eyebrow: "Desk" },
      dispatch: { label: "リアルタイムタスクログ", eyebrow: "Live Log" },
      meeting: { label: "会議", eyebrow: "Meet" },
      settings: { label: "コントロール", eyebrow: "Control" },
    },
    common: {
      newChat: "新しい対話",
      hideSidebar: "サイドバーを隠す",
      openSidebar: "サイドバーを開く",
      showSidebar: "サイドバーを表示",
      connection: "接続",
      desktop: "デスクトップ",
      running: "実行中",
      mode: "モード",
      tokens: "Tokens",
      workflows: "ワークフロー",
      online: "オンライン",
      connecting: "接続中",
      offline: "オフライン",
      partial: "一部利用可",
      paused: "一時停止",
      manual: "手動",
      supervised: "監督",
      autonomous: "自律",
      provider: "Provider",
      platforms: "プラットフォーム",
      currentMode: "現在のモード",
      currentProject: "現在のプロジェクト",
      currentProjectSubtitle: "現在のセッションが属するプロジェクト概要",
      navigation: "ナビゲーション",
      systemSummary: "システム概要",
      systemSummarySubtitle: "現在のワークベンチ能力",
      sessions: "セッション",
      sessionsSubtitle: "最近の会話と下書き",
      quickTasks: "クイックタスク",
      quickTasksSubtitle: "よく使う操作をワンクリックで実行",
      scheduledTasks: "スケジュールタスク",
      scheduledTasksSubtitle: "定時実行と再実行の入口",
      teamStatus: "チーム状態",
      teamStatusSubtitle: "現在の役割と負荷",
      activity: "アクティビティ",
      activitySubtitle: "最近の実行結果",
      executionTrail: "実行トレイル",
      executionTrailSubtitle: "run とアクティビティから dispatch を追跡",
      desktopSummary: "デスクトップ概要",
      currentScene: "現在の画面",
      sidebar: "サイドバー",
      expanded: "展開",
      collapsed: "折りたたみ",
      workingMode: "作業モード",
      desktopOnline: "デスクトップ接続中",
      waitingTakeover: "引き継ぎ待ち",
      openControlCenter: "コントロールを開く",
      backToChat: "チャットに戻る",
      checkSettings: "設定を確認",
      manualTakeover: "手動引き継ぎ",
      desktopConnection: "デスクトップ接続",
      messagePipeline: "メッセージ経路",
      synced: "同期済み",
      recoveryNeeded: "要復旧",
      pipelineRecoveryTitle: "メッセージ経路の復旧が必要です",
      desktopCapabilityTitle: "デスクトップ機能はまだ完全に接続されていません",
      brandEyebrow: "STARCRAW OS",
      desktopBrandEyebrow: "Desktop Workspace",
      desktopBrandTitle: "STARCRAW",
      iosCapsule: "iOS ガラス",
      gptCapsule: "GPT 風フロー",
      generalProject: "共通プロジェクト",
    },
    dashboard: {
      eyebrow: "A ChatGPT-like command center",
      title: "今日は STARCRAW に何を進めてもらいますか？",
      copy: "メイン画面には明確な対話の入口だけを残し、他のツールや状態はサイドレールに収めます。ChatGPT のように目標から始め、チャット、会議、コントロール面へ進められます。",
      teamModePrefix: "現在のチームモード",
      startTitle: "ChatGPT のように開始",
      startHint: "そのまま質問する、タスクを投げる、現在のプロジェクト文脈を差し込む。ホームは開始専用で、深い作業はサイド面に任せます。",
      continueEyebrow: "Continue Working",
      continueCopy: "ホームには本当に重要な次の入口だけを残し、その他の状態は監督レールに任せます。",
      surfacesEyebrow: "Core Surfaces",
      surfacesCopy: "より深い作業が必要なときは、ホームにダッシュボードを積み増すのではなく、専用画面へ移動します。",
      chatCard: {
        eyebrow: "Chat",
        title: "チャット画面へ",
        copy: "入力欄を下部に固定し、中央では会話だけに集中します。ChatGPT のメインチャットの感覚です。",
        action: "チャットを開く",
      },
      deskCard: {
        eyebrow: "Context",
        title: "プロジェクト文脈を見る",
        copy: "ファイルプレビュー、コンテキストパック、Desk Notes は残しつつ、チャットとコントロール面へ整理しています。",
        action: "チャットを開く",
      },
      meetCard: {
        eyebrow: "Meet",
        title: "チーム会議を開始",
        copy: "複数ロールの議論が必要な場合は、チャットの流れを切らずに会議画面へ移動します。",
        action: "会議を開く",
      },
      controlCard: {
        eyebrow: "Control",
        title: "設定と拡張",
        copy: "モデル、プラグイン、スキル、ワークフローテンプレートはすべてコントロールセンターに集約します。",
        action: "コントロールを開く",
      },
      runningRoles: "実行中ロール",
      runningRolesHint: "チームが現在処理しているタスク数",
      completedReplies: "完了した応答",
      completedRepliesHint: "このセッションですでに出力された有効な結果",
      workflowRuns: "Workflow Run",
      workflowRunsHint: "再利用できるオーケストレーション入口と履歴",
      deskContext: "Desk コンテキスト",
      deskContextHint: "現在のプロジェクトにある固定参照、非同期メモ、プロジェクト記憶の総量",
    },
    tasks: {
      eyebrow: "Conversation",
      title: "中央チャット",
      enterToSend: "Enter で送信",
      shiftEnter: "Shift + Enter で改行",
      newChatBadge: "New Chat",
      emptyTitle: "いま進めたいことを一文でチームに伝えてください。",
      emptyCopy: "ここでは ChatGPT のような中央チャット体験を維持します。目標をそのまま送るか、スターターを選んでから文脈を追加できます。",
      composerTitle: "チームへ続けて送信",
      composerHint: "メインチャットはクリーンに保ち、補助機能は左側にまとめます。",
    },
  },
};

export function getUiText(locale: UiLocale): LocaleText {
  return TEXT[locale] ?? TEXT["zh-CN"];
}

export function getPrimaryNavItems(locale: UiLocale): Array<{ id: AppTab; label: string; eyebrow: string }> {
  const text = getUiText(locale);
  return (["dashboard", "tasks", "meeting", "dispatch", "settings"] as const).map(id => ({
    id,
    label: text.nav[id].label,
    eyebrow: text.nav[id].eyebrow,
  }));
}

export function getDefaultHomePrompts(locale: UiLocale): string[] {
  switch (locale) {
    case "zh-TW":
      return [
        "幫我梳理今天最值得推進的一項任務，並自動拆成執行步驟。",
        "從當前會話和專案上下文裡，給我一版可以直接開工的開發計畫。",
        "檢查團隊配置、插件和工作流，告訴我哪裡還不順手。",
      ];
    case "en":
      return [
        "Help me identify the single highest-leverage task for today and break it into executable steps.",
        "Use the current chat and project context to draft a development plan I can start immediately.",
        "Review the team setup, plugins, and workflows and tell me what still feels rough.",
      ];
    case "ja":
      return [
        "今日いちばん進める価値の高いタスクを整理して、実行ステップまで分解してください。",
        "現在の会話とプロジェクト文脈から、すぐ着手できる開発計画を作ってください。",
        "チーム設定、プラグイン、ワークフローを確認して、まだ使いにくい点を教えてください。",
      ];
    default:
      return [
        "帮我梳理今天最值得推进的一项任务，并自动拆成执行步骤。",
        "从当前会话和项目上下文里，给我一版可以直接开工的开发计划。",
        "检查一下团队配置、插件和工作流，告诉我哪里还不顺手。",
      ];
  }
}

export function getDefaultChatStarters(locale: UiLocale): string[] {
  switch (locale) {
    case "zh-TW":
      return [
        "基於當前工程上下文，先告訴我最值得做的下一步。",
        "幫我 review 當前方案，優先指出風險和遺漏。",
        "把這個任務拆成 3 個可以立即執行的小步驟。",
      ];
    case "en":
      return [
        "Using the current project context, tell me the most valuable next step first.",
        "Review the current plan and prioritize risks and missing pieces.",
        "Break this task into 3 small steps I can execute right away.",
      ];
    case "ja":
      return [
        "現在のプロジェクト文脈を前提に、まず一番価値の高い次の一手を教えてください。",
        "現在の案をレビューして、リスクと抜け漏れを優先して指摘してください。",
        "このタスクをすぐ実行できる 3 つの小さなステップに分解してください。",
      ];
    default:
      return [
        "基于当前工程上下文，先告诉我最值得做的下一步。",
        "帮我 review 当前方案，优先指出风险和遗漏。",
        "把这个任务拆成 3 个可以立即执行的小步骤。",
      ];
  }
}

export function formatAutomationModeLabel(
  locale: UiLocale,
  automationPaused: boolean,
  automationMode: AutomationMode,
): string {
  const text = getUiText(locale);
  if (automationPaused) return text.common.paused;
  if (automationMode === "manual") return text.common.manual;
  if (automationMode === "supervised") return text.common.supervised;
  return text.common.autonomous;
}

export function formatWsStatusLabel(locale: UiLocale, status: "connecting" | "connected" | "disconnected"): string {
  const text = getUiText(locale);
  if (status === "connected") return text.common.online;
  if (status === "connecting") return text.common.connecting;
  return text.common.offline;
}
