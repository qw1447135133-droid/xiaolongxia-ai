export interface PresetTask {
  id: string;
  name: string;
  description: string;
  icon: string;
  instruction: string;
  category: "情感与生活" | "古风与幻想" | "都市与热血" | "悬疑与罪案" | "科幻与未来";
  audience: string;
}

export const PRESET_TASKS: PresetTask[] = [
  // 情感与生活
  { id: "都市言情", name: "都市言情", description: "都市背景下的情感关系与现实抉择", icon: "💕", instruction: "以都市言情风格创作一段短剧脚本，展现都市背景下的情感关系与现实抉择，约300字，风格甜虐有张力。", category: "情感与生活", audience: "女频" },
  { id: "豪门婚恋", name: "豪门婚恋", description: "豪门阶层、利益纠葛与婚恋博弈", icon: "💍", instruction: "以豪门婚恋风格创作一段短剧脚本，展现豪门阶层的利益纠葛与婚恋博弈，约300字，风格高糖有反转。", category: "情感与生活", audience: "女频" },
  { id: "美食治愈", name: "美食治愈", description: "料理技艺、味觉记忆与关系修复", icon: "🍜", instruction: "以美食治愈风格创作一段短剧脚本，围绕料理技艺与味觉记忆展开关系修复的故事，约300字，风格温馨治愈。", category: "情感与生活", audience: "全龄" },
  { id: "职场现实", name: "职场现实", description: "职场压迫、成长蜕变与关系修复", icon: "💼", instruction: "以职场现实风格创作一段短剧脚本，展现职场压迫下的成长蜕变与关系修复，约300字，风格真实有共鸣。", category: "情感与生活", audience: "男女通吃" },
  { id: "韩式复仇", name: "韩式复仇", description: "身份落差、精密复仇与情感反噬", icon: "🔥", instruction: "以韩式复仇风格创作一段短剧脚本，展现身份落差下的精密复仇与情感反噬，约300字，风格爽感十足。", category: "情感与生活", audience: "男女通吃" },
  { id: "财阀博弈", name: "财阀博弈", description: "财阀家族权力斗争与阶层对抗", icon: "🏛️", instruction: "以财阀博弈风格创作一段短剧脚本，展现财阀家族的权力斗争与阶层对抗，约300字，风格燃情有张力。", category: "情感与生活", audience: "男女通吃" },
  { id: "命运爱情", name: "命运爱情", description: "命运错位与高强度情感拉扯", icon: "🌙", instruction: "以命运爱情风格创作一段短剧脚本，展现命运错位与高强度情感拉扯，约300字，风格甜虐感人。", category: "情感与生活", audience: "女频" },
  { id: "医疗群像", name: "医疗群像", description: "医院多角色叙事中的职业与情感抉择", icon: "🏥", instruction: "以医疗群像风格创作一段短剧脚本，展现医院多角色叙事中的职业与情感抉择，约300字，风格细腻有深度。", category: "情感与生活", audience: "全龄" },
  { id: "悬爱反转", name: "悬爱反转", description: "恋爱线与悬疑线交织的连续反转结构", icon: "💫", instruction: "以悬爱反转风格创作一段短剧脚本，展现恋爱线与悬疑线交织的连续反转结构，约300字，风格烧脑有惊喜。", category: "情感与生活", audience: "女频" },
  { id: "浪漫喜剧", name: "浪漫喜剧", description: "误会迭起、欢喜冤家式的高糖节奏", icon: "😄", instruction: "以浪漫喜剧风格创作一段短剧脚本，展现误会迭起的欢喜冤家式高糖节奏，约300字，风格轻松甜蜜。", category: "情感与生活", audience: "女频" },
  { id: "家族恩怨", name: "家族恩怨", description: "家族关系、代际冲突与利益对抗", icon: "👨‍👩‍👧‍👦", instruction: "以家族恩怨风格创作一段短剧脚本，展现家族关系中的代际冲突与利益对抗，约300字，风格真实有张力。", category: "情感与生活", audience: "全龄" },
  { id: "婚姻伦理", name: "婚姻伦理", description: "婚姻关系中的忠诚考验与价值冲突", icon: "💒", instruction: "以婚姻伦理风格创作一段短剧脚本，展现婚姻关系中的忠诚考验与价值冲突，约300字，风格深刻有共鸣。", category: "情感与生活", audience: "全龄" },
  { id: "日式治愈", name: "日式治愈", description: "细腻日常中的情绪修复与温柔成长", icon: "🌸", instruction: "以日式治愈风格创作一段短剧脚本，展现细腻日常中的情绪修复与温柔成长，约300字，风格温暖治愈。", category: "情感与生活", audience: "全龄" },
  { id: "校园群像", name: "校园群像", description: "多角色青春成长与关系交织", icon: "🎒", instruction: "以校园群像风格创作一段短剧脚本，展现多角色青春成长与关系交织，约300字，风格青春有活力。", category: "情感与生活", audience: "女频" },
  { id: "纯爱青春", name: "纯爱青春", description: "克制情感与心动日常并行推进", icon: "🌷", instruction: "以纯爱青春风格创作一段短剧脚本，展现克制情感与心动日常并行推进，约300字，风格清甜有余韵。", category: "情感与生活", audience: "女频" },
  { id: "公路冒险", name: "公路冒险", description: "旅途结构中的人物关系与自我救赎", icon: "🚗", instruction: "以公路冒险风格创作一段短剧脚本，展现旅途结构中的人物关系与自我救赎，约300字，风格自由治愈。", category: "情感与生活", audience: "全龄" },

  // 古风与幻想
  { id: "古风权谋", name: "古风权谋", description: "朝堂权斗、家国格局与生存策略", icon: "⚔️", instruction: "以古风权谋风格创作一段短剧脚本，展现朝堂权斗与家国格局中的生存策略，约300字，风格燃情有深度。", category: "古风与幻想", audience: "男女通吃" },
  { id: "宫廷宅斗", name: "宫廷宅斗", description: "宫廷与高门体系中的智斗与布局", icon: "👑", instruction: "以宫廷宅斗风格创作一段短剧脚本，展现宫廷体系中的智斗与布局，约300字，风格步步为营有反转。", category: "古风与幻想", audience: "女频" },
  { id: "古风仙侠", name: "古风仙侠", description: "仙门因果、宿命羁绊与三界争衡", icon: "🗡️", instruction: "以古风仙侠风格创作一段短剧脚本，展现仙门因果与宿命羁绊，约300字，风格唯美有史诗感。", category: "古风与幻想", audience: "男女通吃" },
  { id: "武侠江湖", name: "武侠江湖", description: "门派恩怨、江湖道义与侠义成长", icon: "🥋", instruction: "以武侠江湖风格创作一段短剧脚本，展现门派恩怨与侠义成长，约300字，风格热血有情义。", category: "古风与幻想", audience: "男频" },
  { id: "历史架空", name: "历史架空", description: "架空王朝、制度重构与权谋博弈", icon: "🏯", instruction: "以历史架空风格创作一段短剧脚本，展现架空王朝中的制度重构与权谋博弈，约300字，风格宏大有格局。", category: "古风与幻想", audience: "男女通吃" },
  { id: "无限副本", name: "无限副本", description: "规则关卡、团队协作与生死闯关", icon: "🎮", instruction: "以无限副本风格创作一段短剧脚本，展现规则关卡中的团队协作与生死闯关，约300字，风格紧张刺激。", category: "古风与幻想", audience: "男女通吃" },
  { id: "快穿任务", name: "快穿任务", description: "多世界任务链与身份切换推进主线", icon: "⚡", instruction: "以快穿任务风格创作一段短剧脚本，展现多世界任务链与身份切换，约300字，风格爽感有节奏。", category: "古风与幻想", audience: "女频" },
  { id: "洪荒神话", name: "洪荒神话", description: "上古神魔、量劫因果与证道争锋", icon: "🐉", instruction: "以洪荒神话风格创作一段短剧脚本，展现上古神魔的量劫因果与证道争锋，约300字，风格磅礴有史诗感。", category: "古风与幻想", audience: "男频" },
  { id: "奇幻史诗", name: "奇幻史诗", description: "宏大世界观下的王权与命运战争", icon: "🏰", instruction: "以奇幻史诗风格创作一段短剧脚本，展现宏大世界观下的王权与命运战争，约300字，风格史诗燃情。", category: "古风与幻想", audience: "男女通吃" },
  { id: "异世界冒险", name: "异世界冒险", description: "穿越异世界后的任务成长与伙伴协作", icon: "🌍", instruction: "以异世界冒险风格创作一段短剧脚本，展现穿越异世界后的任务成长与伙伴协作，约300字，风格热血有趣。", category: "古风与幻想", audience: "男女通吃" },
  { id: "黑暗奇幻", name: "黑暗奇幻", description: "道德灰度、残酷世界与宿命对抗", icon: "🌑", instruction: "以黑暗奇幻风格创作一段短剧脚本，展现道德灰度与残酷世界中的宿命对抗，约300字，风格深沉有张力。", category: "古风与幻想", audience: "男频" },

  // 都市与热血
  { id: "都市爽文", name: "都市爽文", description: "身份反转、打脸升级与高密度爽点", icon: "💥", instruction: "以都市爽文风格创作一段短剧脚本，展现身份反转与打脸升级的高密度爽点，约300字，风格爽感拉满。", category: "都市与热血", audience: "男频" },
  { id: "战神强者", name: "战神强者", description: "顶级强者回归后的秩序重塑", icon: "⚡", instruction: "以战神强者风格创作一段短剧脚本，展现顶级强者回归后的秩序重塑，约300字，风格霸气爽感。", category: "都市与热血", audience: "男频" },
  { id: "赘婿逆袭", name: "赘婿逆袭", description: "身份压制下的隐忍爆发与家族翻盘", icon: "🔄", instruction: "以赘婿逆袭风格创作一段短剧脚本，展现身份压制下的隐忍爆发与家族翻盘，约300字，风格爽感有反转。", category: "都市与热血", audience: "男频" },
  { id: "神医流", name: "神医流", description: "医术破局、奇症救治与势力拉拢", icon: "💊", instruction: "以神医流风格创作一段短剧脚本，展现医术破局与奇症救治，约300字，风格爽感有悬念。", category: "都市与热血", audience: "男频" },
  { id: "鉴宝捡漏", name: "鉴宝捡漏", description: "古玩眼力、江湖骗局与财富翻盘", icon: "🏺", instruction: "以鉴宝捡漏风格创作一段短剧脚本，展现古玩眼力与财富翻盘，约300字，风格爽感接地气。", category: "都市与热血", audience: "男频" },
  { id: "娱乐圈星光", name: "娱乐圈星光", description: "艺人成长、舆论场与名利博弈", icon: "⭐", instruction: "以娱乐圈星光风格创作一段短剧脚本，展现艺人成长与名利博弈，约300字，风格精彩有看点。", category: "都市与热血", audience: "女频" },
  { id: "电竞直播", name: "电竞直播", description: "战队荣誉、直播舆论与职业成长", icon: "🎯", instruction: "以电竞直播风格创作一段短剧脚本，展现战队荣誉与职业成长，约300字，风格热血燃情。", category: "都市与热血", audience: "男频" },
  { id: "直播网红", name: "直播网红", description: "流量经济、人设博弈与舆论反转", icon: "📱", instruction: "以直播网红风格创作一段短剧脚本，展现流量经济与人设博弈，约300字，风格现实有反转。", category: "都市与热血", audience: "男女通吃" },
  { id: "乡土逆袭", name: "乡土逆袭", description: "基层环境中个人崛起与身份跃迁", icon: "🌾", instruction: "以乡土逆袭风格创作一段短剧脚本，展现基层环境中的个人崛起与身份跃迁，约300字，风格励志接地气。", category: "都市与热血", audience: "男女通吃" },
  { id: "创业逆风", name: "创业逆风", description: "小人物创业中的资源博弈与情义选择", icon: "🚀", instruction: "以创业逆风风格创作一段短剧脚本，展现小人物创业中的资源博弈与情义选择，约300字，风格燃情励志。", category: "都市与热血", audience: "男女通吃" },
  { id: "青春竞技", name: "青春竞技", description: "青春成长与赛事挑战并行推进", icon: "🏆", instruction: "以青春竞技风格创作一段短剧脚本，展现青春成长与赛事挑战，约300字，风格热血有激情。", category: "都市与热血", audience: "男女通吃" },
  { id: "音乐舞台", name: "音乐舞台", description: "音乐梦想、舞台竞争与团队关系成长", icon: "🎵", instruction: "以音乐舞台风格创作一段短剧脚本，展现音乐梦想与舞台竞争，约300字，风格燃情有感染力。", category: "都市与热血", audience: "男女通吃" },

  // 悬疑与罪案
  { id: "悬疑刑侦", name: "悬疑刑侦", description: "线索追踪、案件博弈与真相揭示", icon: "🔍", instruction: "以悬疑刑侦风格创作一段短剧脚本，展现线索追踪与案件博弈，约300字，风格烧脑有悬念。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "谍战潜伏", name: "谍战潜伏", description: "身份伪装、情报传递与阵营抉择", icon: "🕵️", instruction: "以谍战潜伏风格创作一段短剧脚本，展现身份伪装与情报传递，约300字，风格紧张刺激。", category: "悬疑与罪案", audience: "男频" },
  { id: "民俗灵异", name: "民俗灵异", description: "地方禁忌、灵异事件与人性试探", icon: "👻", instruction: "以民俗灵异风格创作一段短剧脚本，展现地方禁忌与灵异事件，约300字，风格惊悚有悬念。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "盗墓探险", name: "盗墓探险", description: "古墓机关、历史谜团与夺宝求生", icon: "⚰️", instruction: "以盗墓探险风格创作一段短剧脚本，展现古墓机关与历史谜团，约300字，风格刺激有悬念。", category: "悬疑与罪案", audience: "男频" },
  { id: "犯罪惊悚", name: "犯罪惊悚", description: "高压节奏、连环危机与反转追凶", icon: "🚨", instruction: "以犯罪惊悚风格创作一段短剧脚本，展现高压节奏与连环危机，约300字，风格紧张有反转。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "法律博弈", name: "法律博弈", description: "法庭攻防、证据反转与正义困境", icon: "⚖️", instruction: "以法律博弈风格创作一段短剧脚本，展现法庭攻防与证据反转，约300字，风格烧脑有张力。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "检察法政", name: "检察法政", description: "权力系统内的法政博弈与反腐追查", icon: "🏛️", instruction: "以检察法政风格创作一段短剧脚本，展现权力系统内的法政博弈与反腐追查，约300字，风格严肃有力度。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "时间循环", name: "时间循环", description: "同一时间轴重复中的破局与救赎", icon: "🔁", instruction: "以时间循环风格创作一段短剧脚本，展现同一时间轴重复中的破局与救赎，约300字，风格烧脑有深度。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "海港秘事", name: "海港秘事", description: "港口城市、走私链与跨国势力纠缠", icon: "⚓", instruction: "以海港秘事风格创作一段短剧脚本，展现港口城市的走私链与跨国势力纠缠，约300字，风格紧张有悬念。", category: "悬疑与罪案", audience: "男女通吃" },
  { id: "热带悬疑", name: "热带悬疑", description: "湿热气候下的连环谜案与本土传说", icon: "🌴", instruction: "以热带悬疑风格创作一段短剧脚本，展现湿热气候下的连环谜案与本土传说，约300字，风格神秘有悬念。", category: "悬疑与罪案", audience: "男女通吃" },

  // 科幻与未来
  { id: "末世废土", name: "末世废土", description: "秩序崩塌后的掠夺、据点与生存法则", icon: "☢️", instruction: "以末世废土风格创作一段短剧脚本，展现秩序崩塌后的生存法则，约300字，风格硬核有张力。", category: "科幻与未来", audience: "男频" },
  { id: "赛博近未来", name: "赛博近未来", description: "义体、数据监控与底层反抗叙事", icon: "🤖", instruction: "以赛博近未来风格创作一段短剧脚本，展现义体与数据监控下的底层反抗，约300字，风格酷炫有深度。", category: "科幻与未来", audience: "男女通吃" },
  { id: "星际机甲", name: "星际机甲", description: "机甲对抗、舰队战术与边疆冲突", icon: "🚀", instruction: "以星际机甲风格创作一段短剧脚本，展现机甲对抗与舰队战术，约300字，风格热血燃情。", category: "科幻与未来", audience: "男频" },
  { id: "人工智能伦理", name: "人工智能伦理", description: "意识边界、人机关系与制度失控", icon: "🧠", instruction: "以人工智能伦理风格创作一段短剧脚本，展现意识边界与人机关系，约300字，风格深刻有思考。", category: "科幻与未来", audience: "男女通吃" },
  { id: "高概念科幻", name: "高概念科幻", description: "明确设定驱动的科技冲突与价值博弈", icon: "🌌", instruction: "以高概念科幻风格创作一段短剧脚本，展现科技冲突与价值博弈，约300字，风格宏大有深度。", category: "科幻与未来", audience: "男女通吃" },
  { id: "超级英雄", name: "超级英雄", description: "能力觉醒、责任命题与团队对抗", icon: "🦸", instruction: "以超级英雄风格创作一段短剧脚本，展现能力觉醒与责任命题，约300字，风格热血有激情。", category: "科幻与未来", audience: "男女通吃" },
  { id: "太空歌剧", name: "太空歌剧", description: "星际文明冲突与史诗级阵营对抗", icon: "🌠", instruction: "以太空歌剧风格创作一段短剧脚本，展现星际文明冲突与史诗级阵营对抗，约300字，风格磅礴有史诗感。", category: "科幻与未来", audience: "男女通吃" },
  { id: "平行宇宙", name: "平行宇宙", description: "分支世界、身份置换与因果连锁", icon: "🔮", instruction: "以平行宇宙风格创作一段短剧脚本，展现分支世界与身份置换，约300字，风格烧脑有惊喜。", category: "科幻与未来", audience: "男女通吃" },
  { id: "虚拟现实", name: "虚拟现实", description: "虚拟世界规则、身份与真实边界", icon: "🥽", instruction: "以虚拟现实风格创作一段短剧脚本，展现虚拟世界规则与真实边界，约300字，风格新奇有深度。", category: "科幻与未来", audience: "男女通吃" },
  { id: "数值化冒险", name: "数值化冒险", description: "等级面板、副本规则与成长数值博弈", icon: "📊", instruction: "以数值化冒险风格创作一段短剧脚本，展现等级面板与副本规则，约300字，风格爽感有节奏。", category: "科幻与未来", audience: "男频" },
];

export const CATEGORY_LABELS: Record<PresetTask["category"], string> = {
  "情感与生活": "情感与生活",
  "古风与幻想": "古风与幻想",
  "都市与热血": "都市与热血",
  "悬疑与罪案": "悬疑与罪案",
  "科幻与未来": "科幻与未来",
};
