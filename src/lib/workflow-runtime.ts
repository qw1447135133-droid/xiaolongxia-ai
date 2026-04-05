import { pickLocaleText } from "@/lib/ui-locale";
import { getPluginById } from "@/lib/plugin-runtime";
import type { UiLocale } from "@/store/types";
import type { WorkflowTemplate } from "@/types/workflows";

type TemplateDefinition = Omit<WorkflowTemplate, "title" | "summary" | "brief" | "steps" | "accent" | "pluginName"> & {
  accent?: string;
  pluginId?: string;
};

const CORE_WORKFLOW_TEMPLATES: TemplateDefinition[] = [
  { id: "launch-sprint", accent: "#7dd3fc", nextTab: "tasks", source: "core" },
  { id: "research-loop", accent: "#86efac", nextTab: "tasks", source: "core" },
  { id: "meeting-debrief", accent: "#fbbf24", nextTab: "meeting", source: "core" },
  { id: "content-topic-draft", accent: "#60a5fa", nextTab: "tasks", source: "core" },
  { id: "content-final-review", accent: "#f59e0b", nextTab: "tasks", source: "core" },
  { id: "content-publish-prep", accent: "#34d399", nextTab: "settings", source: "core" },
  { id: "content-postmortem", accent: "#a78bfa", nextTab: "dashboard", source: "core" },
];

const PLUGIN_WORKFLOW_TEMPLATES: TemplateDefinition[] = [
  { id: "desk-tools-context-pack", pluginId: "desk-tools", nextTab: "tasks", source: "plugin" },
  { id: "artifact-preview-review", pluginId: "artifact-preview", nextTab: "settings", source: "plugin" },
  { id: "skills-market-coverage", pluginId: "skills-market", nextTab: "settings", source: "plugin" },
  { id: "bridge-channel-route-check", pluginId: "bridge-channel", nextTab: "settings", source: "plugin" },
  { id: "ops-telemetry-health-sweep", pluginId: "ops-telemetry", nextTab: "dashboard", source: "plugin" },
  { id: "provider-lab-routing-pass", pluginId: "provider-lab", nextTab: "settings", source: "plugin" },
];

function joinLines(lines: string[]) {
  return lines.join("\n");
}

function getLocalizedTemplateContent(id: string, locale: UiLocale) {
  switch (id) {
    case "launch-sprint":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "冲刺启动",
          "zh-TW": "衝刺啟動",
          en: "Launch Sprint",
          ja: "ローンチスプリント",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把工作台上下文、技能和任务流串起来，快速推进一次面向交付的冲刺。",
          "zh-TW": "把工作台上下文、技能與任務流串起來，快速推進一次面向交付的衝刺。",
          en: "Combine desk context, skills, and task flow to push a shipping-focused sprint.",
          ja: "Desk の文脈、スキル、タスクの流れをつなぎ、出荷に向けたスプリントを前進させます。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "使用当前 Desk 上下文、置顶引用和活跃笔记。",
            "把工作拆成研究、文案、设计和交付几个切片。",
            "返回执行顺序、潜在阻塞点，以及最快的第一阶段里程碑。",
          ],
          "zh-TW": [
            "使用目前 Desk 上下文、置頂引用和活躍筆記。",
            "把工作拆成研究、文案、設計和交付幾個切片。",
            "返回執行順序、潛在阻塞點，以及最快的第一階段里程碑。",
          ],
          en: [
            "Use the current Desk context, pinned references, and active notes.",
            "Split the work into research, copy, design, and delivery slices.",
            "Return the execution order, likely blockers, and the fastest first milestone.",
          ],
          ja: [
            "現在の Desk 文脈、ピン留め参照、アクティブなノートを使ってください。",
            "作業を調査、コピー、デザイン、納品のスライスに分けてください。",
            "実行順、想定ブロッカー、最短の最初のマイルストーンを返してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["Desk 上下文", "任务派发", "产物复核"],
          "zh-TW": ["Desk 上下文", "任務派發", "產物複核"],
          en: ["Desk context", "Task dispatch", "Artifact review"],
          ja: ["Desk 文脈", "タスク配信", "成果物レビュー"],
        }),
      };
    case "research-loop":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "研究闭环",
          "zh-TW": "研究閉環",
          en: "Research Loop",
          ja: "リサーチループ",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把当前会话和 Desk 笔记整理成一份结构化研究计划。",
          "zh-TW": "把目前會話和 Desk 筆記整理成一份結構化研究計畫。",
          en: "Turn current sessions and desk notes into a structured research plan.",
          ja: "現在の会話と Desk ノートを構造化された調査計画へ変換します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "梳理当前问题、约束，以及已经固定在 Desk 上的文件。",
            "提出一套包含发现、风险检查和建议结论的研究循环。",
            "输出必须可执行，并能直接接入后续实现。",
          ],
          "zh-TW": [
            "梳理目前問題、限制，以及已固定在 Desk 上的檔案。",
            "提出一套包含發現、風險檢查和建議結論的研究循環。",
            "輸出必須可執行，並能直接接入後續實作。",
          ],
          en: [
            "Map the current problem, constraints, and files already pinned on the Desk.",
            "Propose a research loop with findings, risk checks, and a recommended answer.",
            "Keep the output actionable and ready for implementation.",
          ],
          ja: [
            "現在の課題、制約、Desk に固定されているファイルを整理してください。",
            "発見事項、リスク確認、推奨結論を含む調査ループを提案してください。",
            "出力は実装につなげやすい実行可能な形にしてください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["技能检查", "研究派发", "输出归档"],
          "zh-TW": ["技能檢查", "研究派發", "輸出歸檔"],
          en: ["Skills review", "Research dispatch", "Output shelf"],
          ja: ["スキル確認", "調査配信", "出力保管"],
        }),
      };
    case "meeting-debrief":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "会议复盘",
          "zh-TW": "會議複盤",
          en: "Meeting Debrief",
          ja: "会議デブリーフ",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把会议结论转换成下一步动作和可复用产物。",
          "zh-TW": "把會議結論轉成下一步動作和可重用產物。",
          en: "Convert meeting conclusions into next actions and reusable artifacts.",
          ja: "会議の結論を次のアクションと再利用可能な成果物へ変換します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "回顾最近一次会议结论，并转成带优先级的行动列表。",
            "识别负责人、相关文件，以及会后需要继续追问的提示词。",
            "准备一份交接内容，让团队不用重读整段纪要也能继续推进。",
          ],
          "zh-TW": [
            "回顧最近一次會議結論，並轉成帶優先級的行動列表。",
            "識別負責人、相關檔案，以及會後需要繼續追問的提示詞。",
            "準備一份交接內容，讓團隊不用重讀整段紀要也能繼續推進。",
          ],
          en: [
            "Review the latest meeting conclusion and convert it into a prioritized action list.",
            "Identify owners, files, and follow-up prompts needed after the meeting.",
            "Prepare the handoff so the team can continue without re-reading the full transcript.",
          ],
          ja: [
            "最新の会議結論を確認し、優先度付きのアクション一覧へ変換してください。",
            "担当者、関連ファイル、会議後に必要な追跡プロンプトを特定してください。",
            "全文を読み直さなくても進められるよう、引き継ぎ内容を準備してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["会议记录", "动作提取", "任务交接"],
          "zh-TW": ["會議記錄", "動作提取", "任務交接"],
          en: ["Meeting record", "Action extraction", "Task handoff"],
          ja: ["会議記録", "アクション抽出", "タスク引き継ぎ"],
        }),
      };
    case "content-topic-draft":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "选题与草稿",
          "zh-TW": "選題與草稿",
          en: "Topic and Draft",
          ja: "企画と初稿",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "从内容目标、发布渠道和项目上下文生成首版选题与草稿框架。",
          "zh-TW": "從內容目標、發布渠道和專案上下文產生首版選題與草稿框架。",
          en: "Generate the first topic angle and draft structure from content goals, publish targets, and project context.",
          ja: "コンテンツ目標、公開チャネル、プロジェクト文脈から最初の企画案と草稿構成を生成します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "回看当前内容任务目标、发布目标和项目上下文。",
            "提出最强切角、结构大纲和首稿框架。",
            "返回一版无需重新补上下文即可进入审校的草稿。",
          ],
          "zh-TW": [
            "回看目前內容任務目標、發布目標和專案上下文。",
            "提出最強切角、結構大綱和首稿框架。",
            "返回一版無需重新補上下文即可進入審校的草稿。",
          ],
          en: [
            "Review the current content task goal, publish targets, and project context.",
            "Propose the strongest angle, outline, and first-draft structure.",
            "Return a draft that can move directly into review without re-collecting context.",
          ],
          ja: [
            "現在のコンテンツタスク目標、公開対象、プロジェクト文脈を確認してください。",
            "最適な切り口、構成案、初稿の骨子を提案してください。",
            "文脈を集め直さずにレビューへ進める草稿を返してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["目标复核", "角度选择", "草稿大纲"],
          "zh-TW": ["目標複核", "角度選擇", "草稿大綱"],
          en: ["Goal review", "Angle select", "Draft outline"],
          ja: ["目標確認", "切り口選定", "草稿構成"],
        }),
      };
    case "content-final-review":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "定稿与审校",
          "zh-TW": "定稿與審校",
          en: "Final Review",
          ja: "定稿とレビュー",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把现有草稿压成定稿版本，并标出需要人工确认的风险点。",
          "zh-TW": "把現有草稿壓成定稿版本，並標出需要人工確認的風險點。",
          en: "Tighten the current draft into a final version and mark the risks that need manual review.",
          ja: "現在の草稿を定稿へ仕上げ、手動確認が必要なリスクを明示します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "审阅最新草稿、目标受众和发布限制。",
            "在保留核心目标的前提下压紧结构、语气和 CTA。",
            "列出发布前最终需要确认的审批检查项。",
          ],
          "zh-TW": [
            "審閱最新草稿、目標受眾和發布限制。",
            "在保留核心目標的前提下壓緊結構、語氣和 CTA。",
            "列出發布前最終需要確認的審批檢查項。",
          ],
          en: [
            "Review the latest draft, target audience, and publication constraints.",
            "Tighten structure, tone, and CTA while preserving the core goal.",
            "List the final approval checks before publishing.",
          ],
          ja: [
            "最新草稿、対象読者、公開制約を見直してください。",
            "コア目標を保ったまま構成、トーン、CTA を引き締めてください。",
            "公開前に必要な最終承認チェックを列挙してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["草稿审阅", "文案压缩", "审批检查"],
          "zh-TW": ["草稿審閱", "文案壓縮", "審批檢查"],
          en: ["Draft review", "Copy tighten", "Approval checks"],
          ja: ["草稿確認", "文面調整", "承認確認"],
        }),
      };
    case "content-publish-prep":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "发布准备",
          "zh-TW": "發布準備",
          en: "Publish Prep",
          ja: "公開準備",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "整理发布文案、渠道映射和发布前检查，准备进入外发动作。",
          "zh-TW": "整理發布文案、渠道映射和發布前檢查，準備進入外發動作。",
          en: "Prepare publish copy, channel mapping, and preflight checks before delivery.",
          ja: "配信用文面、チャネル対応表、公開前チェックを整え、配信準備を進めます。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "准备各渠道版本的发布文案和发帖检查清单。",
            "把内容映射到每个发布目标，并标出人工审批闸门。",
            "返回一份适合监督外发的干净发布包。",
          ],
          "zh-TW": [
            "準備各渠道版本的發布文案和發帖檢查清單。",
            "把內容映射到每個發布目標，並標出人工審批閘門。",
            "返回一份適合監督外發的乾淨發布包。",
          ],
          en: [
            "Prepare channel-specific publish copy and posting checklist.",
            "Map the content to each publish target and identify manual approval gates.",
            "Return a clean publish packet ready for supervised release.",
          ],
          ja: [
            "チャネル別の公開文面と投稿チェックリストを準備してください。",
            "各公開先へ内容を割り当て、手動承認ゲートを明示してください。",
            "監督付き公開に使える整理済みの公開パケットを返してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["目标映射", "发布包", "审批闸门"],
          "zh-TW": ["目標映射", "發布包", "審批閘門"],
          en: ["Target mapping", "Publish packet", "Approval gate"],
          ja: ["対象割当", "公開パケット", "承認ゲート"],
        }),
      };
    case "content-postmortem":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "发布复盘",
          "zh-TW": "發布複盤",
          en: "Publish Postmortem",
          ja: "公開ふり返り",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "回收发布结果、外链和后续动作，形成下一轮内容复盘。",
          "zh-TW": "回收發布結果、外鏈和後續動作，形成下一輪內容複盤。",
          en: "Collect publish results, links, and follow-ups into the next content postmortem.",
          ja: "公開結果、外部リンク、次のアクションを回収し、次サイクルのふり返りへつなげます。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "总结发布结果、外部链接，以及任何交付失败。",
            "记录下一轮应该复用、改进或重试的内容。",
            "返回一份紧凑的复盘和下一步建议。",
          ],
          "zh-TW": [
            "總結發布結果、外部連結，以及任何交付失敗。",
            "記錄下一輪應該重用、改進或重試的內容。",
            "返回一份精簡的複盤和下一步建議。",
          ],
          en: [
            "Summarize the publish result, external links, and any delivery failures.",
            "Capture what should be reused, improved, or retried in the next cycle.",
            "Return a compact postmortem with recommended next actions.",
          ],
          ja: [
            "公開結果、外部リンク、配信失敗があれば要約してください。",
            "次サイクルで再利用、改善、再試行すべき点を記録してください。",
            "次の推奨アクション付きの簡潔なふり返りを返してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["结果回收", "失败复核", "下一轮"],
          "zh-TW": ["結果回收", "失敗複核", "下一輪"],
          en: ["Result capture", "Failure review", "Next cycle"],
          ja: ["結果回収", "失敗確認", "次サイクル"],
        }),
      };
    case "desk-tools-context-pack":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "上下文打包",
          "zh-TW": "上下文打包",
          en: "Context Pack Run",
          ja: "コンテキストパック",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "把最强的 Desk 引用整理成可复用的执行包。",
          "zh-TW": "把最強的 Desk 引用整理成可重用的執行包。",
          en: "Bundle the strongest Desk references into a reusable execution packet.",
          ja: "重要な Desk 参照を再利用可能な実行パケットへまとめます。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "检查置顶的 Desk 文件、已保存笔记和当前草稿上下文。",
            "生成一份最小但足够执行的上下文包。",
            "指出哪些内容应该继续置顶、转为 Desk Note，或进入下一步派发。",
          ],
          "zh-TW": [
            "檢查置頂的 Desk 檔案、已保存筆記和目前草稿上下文。",
            "產生一份最小但足夠執行的上下文包。",
            "指出哪些內容應該繼續置頂、轉為 Desk Note，或進入下一步派發。",
          ],
          en: [
            "Review pinned Desk files, saved notes, and current scratchpad context.",
            "Build a compact context pack with the minimum references needed to execute cleanly.",
            "Call out what should stay pinned, what should become a desk note, and what should be dispatched next.",
          ],
          ja: [
            "ピン留めした Desk ファイル、保存済みノート、現在の下書き文脈を確認してください。",
            "実行に必要な最小参照だけを含むコンパクトなコンテキストパックを作ってください。",
            "何をピン留め継続し、何を Desk Note 化し、何を次に派信すべきか示してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["Desk 打包", "提示压缩", "执行交接"],
          "zh-TW": ["Desk 打包", "提示壓縮", "執行交接"],
          en: ["Desk bundle", "Prompt compression", "Execution handoff"],
          ja: ["Desk 収束", "プロンプト圧縮", "実行引き継ぎ"],
        }),
      };
    case "artifact-preview-review":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "产物复核回路",
          "zh-TW": "產物複核回路",
          en: "Artifact Review Loop",
          ja: "成果物レビュー",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "在推进下一轮之前，回看输出、预览和分离视图。",
          "zh-TW": "在推進下一輪之前，回看輸出、預覽和分離視圖。",
          en: "Revisit outputs, previews, and detached views before pushing another revision.",
          ja: "次の改稿に進む前に、出力・プレビュー・分離ビューを見直します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "检查与当前任务相关的最近输出和预览面板。",
            "识别哪些需要继续修改、提升为稳定产物，或直接废弃。",
            "写出下一轮修订 brief，避免团队重新逐个打开文件。",
          ],
          "zh-TW": [
            "檢查與目前任務相關的最近輸出和預覽面板。",
            "識別哪些需要繼續修改、提升為穩定產物，或直接廢棄。",
            "寫出下一輪修訂 brief，避免團隊重新逐個打開檔案。",
          ],
          en: [
            "Inspect recent outputs and preview surfaces that are relevant to the current task.",
            "Identify what should be revised, promoted into a stable artifact, or discarded.",
            "Write the next revision brief so the team can move without reopening every file manually.",
          ],
          ja: [
            "現在のタスクに関連する最近の出力とプレビュー面を確認してください。",
            "改修すべきもの、安定成果物に昇格すべきもの、捨てるべきものを整理してください。",
            "ファイルを一つずつ開き直さず進められるよう次の改稿 brief を書いてください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["产物扫描", "预览对比", "修订说明"],
          "zh-TW": ["產物掃描", "預覽對比", "修訂說明"],
          en: ["Artifact scan", "Preview compare", "Revision brief"],
          ja: ["成果物確認", "プレビュー比較", "改稿ブリーフ"],
        }),
      };
    case "skills-market-coverage":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "能力覆盖检查",
          "zh-TW": "能力覆蓋檢查",
          en: "Capability Coverage",
          ja: "能力カバー確認",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "检查当前 Agent 组合是否具备足够的技能与角色覆盖。",
          "zh-TW": "檢查目前 Agent 組合是否具備足夠的技能與角色覆蓋。",
          en: "Check whether the current agent setup has the right skills and role coverage.",
          ja: "現在の Agent 構成に必要なスキルと役割カバーがあるか確認します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "根据当前任务切角识别缺失能力或薄弱覆盖。",
            "推荐下一步所需的最小技能、组合包或角色调整。",
            "把立即需要和以后可补充的能力分开说明。",
          ],
          "zh-TW": [
            "根據目前任務切角識別缺失能力或薄弱覆蓋。",
            "推薦下一步所需的最小技能、組合包或角色調整。",
            "把立即需要和之後可補充的能力分開說明。",
          ],
          en: [
            "Review the current task angle and identify missing capabilities or weak coverage.",
            "Recommend the minimum set of skills, packs, or role changes needed for the next step.",
            "Separate immediate needs from future nice-to-have capabilities.",
          ],
          ja: [
            "現在のタスク視点から不足能力や弱いカバーを特定してください。",
            "次の一手に必要な最小限のスキル、パック、役割変更を提案してください。",
            "今すぐ必要なものと将来的にあると良いものを分けてください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["能力扫描", "角色重排", "推荐组合"],
          "zh-TW": ["能力掃描", "角色重排", "推薦組合"],
          en: ["Capability scan", "Role rebalance", "Recommended packs"],
          ja: ["能力確認", "役割再配置", "推奨パック"],
        }),
      };
    case "bridge-channel-route-check":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "渠道路由检查",
          "zh-TW": "渠道路由檢查",
          en: "Channel Route Check",
          ja: "チャネル経路確認",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "面向外部消息链路做一轮渠道状态、路由准备度和交接风险检查。",
          "zh-TW": "面向外部訊息鏈路做一輪渠道狀態、路由準備度和交接風險檢查。",
          en: "Stage a bridge-oriented pass for message routes, channel readiness, and handoff risk.",
          ja: "メッセージ経路、チャネル準備度、引き継ぎリスクを橋渡し視点で確認します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "检查当前启用的渠道适配器和既有路由假设。",
            "指出缺失桥接、路由冲突，以及仍需人工跟进的地方。",
            "返回对外发消息或同步来说最干净的执行路径。",
          ],
          "zh-TW": [
            "檢查目前啟用的渠道適配器和既有路由假設。",
            "指出缺失橋接、路由衝突，以及仍需人工跟進的地方。",
            "返回對外發訊息或同步來說最乾淨的執行路徑。",
          ],
          en: [
            "Inspect the active channel adapters and current route assumptions.",
            "Call out missing bridges, route conflicts, and where manual follow-up is still required.",
            "Return the cleanest execution path for external message delivery or sync.",
          ],
          ja: [
            "有効なチャネルアダプタと現在の経路前提を確認してください。",
            "不足ブリッジ、経路衝突、手動追跡が必要な箇所を示してください。",
            "外部配信や同期に向けた最もクリーンな実行経路を返してください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["渠道映射", "路由校验", "桥接交接"],
          "zh-TW": ["渠道映射", "路由校驗", "橋接交接"],
          en: ["Channel map", "Route validation", "Bridge handoff"],
          ja: ["チャネル整理", "経路検証", "橋渡し引き継ぎ"],
        }),
      };
    case "ops-telemetry-health-sweep":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "运行健康巡检",
          "zh-TW": "運行健康巡檢",
          en: "Ops Health Sweep",
          ja: "運用ヘルス確認",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "聚焦壳层健康、执行可见性和基础遥测缺口做一轮巡检。",
          "zh-TW": "聚焦殼層健康、執行可見性和基礎遙測缺口做一輪巡檢。",
          en: "Run a focused pass on shell health, execution visibility, and basic telemetry gaps.",
          ja: "シェル健全性、実行可視性、基本テレメトリ不足を重点確認します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "总结当前 shell 状态、活跃 agent 和运营薄弱点。",
            "指出哪些信号应该提升为卡片、指标或告警。",
            "只聚焦实际可见性改进，不做后端重构发散。",
          ],
          "zh-TW": [
            "總結目前 shell 狀態、活躍 agent 和營運薄弱點。",
            "指出哪些訊號應該提升為卡片、指標或告警。",
            "只聚焦實際可見性改進，不做後端重構發散。",
          ],
          en: [
            "Summarize the current shell state, running agents, and operational weak spots.",
            "Identify what should be surfaced as a card, metric, or warning inside the workbench.",
            "Keep the output focused on practical visibility improvements rather than backend rebuilds.",
          ],
          ja: [
            "現在のシェル状態、稼働中 Agent、運用上の弱点を要約してください。",
            "ワークベンチ上でカード、指標、警告として出すべき信号を挙げてください。",
            "バックエンド再構築ではなく、実用的な可視性改善に絞ってください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["健康快照", "信号缺口", "运维跟进"],
          "zh-TW": ["健康快照", "訊號缺口", "運維跟進"],
          en: ["Health snapshot", "Signal gaps", "Ops follow-up"],
          ja: ["健全性確認", "信号ギャップ", "運用フォロー"],
        }),
      };
    case "provider-lab-routing-pass":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "模型路由检查",
          "zh-TW": "模型路由檢查",
          en: "Provider Routing Pass",
          ja: "モデル経路確認",
        }),
        summary: pickLocaleText(locale, {
          "zh-CN": "在改动主运行时设置前，先评估模型与提供方组合。",
          "zh-TW": "在改動主執行時設定前，先評估模型與提供方組合。",
          en: "Evaluate model/provider combinations before changing the main runtime settings.",
          ja: "メイン実行設定を変える前に、モデルとプロバイダの組み合わせを評価します。",
        }),
        brief: joinLines(pickLocaleText(locale, {
          "zh-CN": [
            "检查当前 provider 配置、预期模型路由和测试空缺。",
            "提出最稳妥的 provider 调整或路由验证实验路径。",
            "明确区分稳定默认值和实验分支。",
          ],
          "zh-TW": [
            "檢查目前 provider 配置、預期模型路由和測試空缺。",
            "提出最穩妥的 provider 調整或路由驗證實驗路徑。",
            "明確區分穩定預設值和實驗分支。",
          ],
          en: [
            "Review the current provider setup, expected model routing, and any test gaps.",
            "Propose the safest experiment path for provider changes or routing validation.",
            "Separate stable defaults from experimental branches clearly.",
          ],
          ja: [
            "現在の provider 設定、期待するモデル経路、テスト不足を確認してください。",
            "provider 変更や経路検証のための最も安全な実験手順を提案してください。",
            "安定デフォルトと実験枝を明確に分けてください。",
          ],
        })),
        steps: pickLocaleText(locale, {
          "zh-CN": ["提供方检查", "路由测试", "安全上线"],
          "zh-TW": ["提供方檢查", "路由測試", "安全上線"],
          en: ["Provider scan", "Routing test", "Safe rollout"],
          ja: ["提供元確認", "経路テスト", "安全展開"],
        }),
      };
    default:
      return {
        title: id,
        summary: id,
        brief: id,
        steps: [id],
      };
  }
}

function resolveTemplate(definition: TemplateDefinition, locale: UiLocale): WorkflowTemplate | null {
  const localized = getLocalizedTemplateContent(definition.id, locale);

  if (definition.source === "core") {
    return {
      ...definition,
      accent: definition.accent ?? "#7dd3fc",
      ...localized,
    };
  }

  if (!definition.pluginId) {
    return null;
  }

  const plugin = getPluginById(definition.pluginId);
  if (!plugin) {
    return null;
  }

  return {
    ...definition,
    accent: plugin.accent,
    pluginName: plugin.name,
    ...localized,
  };
}

export function getAvailableWorkflowTemplates(enabledPluginIds: string[], locale: UiLocale = "zh-CN") {
  const coreTemplates = CORE_WORKFLOW_TEMPLATES
    .map(template => resolveTemplate(template, locale))
    .filter((template): template is WorkflowTemplate => Boolean(template));

  const pluginTemplates = PLUGIN_WORKFLOW_TEMPLATES
    .filter(template => template.pluginId && enabledPluginIds.includes(template.pluginId))
    .map(template => resolveTemplate(template, locale))
    .filter((template): template is WorkflowTemplate => Boolean(template));

  return [...coreTemplates, ...pluginTemplates];
}

export function getWorkflowTemplateById(id: string, enabledPluginIds: string[], locale: UiLocale = "zh-CN") {
  return getAvailableWorkflowTemplates(enabledPluginIds, locale).find(template => template.id === id) ?? null;
}
