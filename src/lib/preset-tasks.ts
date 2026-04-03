export interface PresetTask {
  id: string;
  name: string;
  description: string;
  icon: string;
  instruction: string;
  category: 'market' | 'content' | 'design' | 'video' | 'service';
}

export const PRESET_TASKS: PresetTask[] = [
  {
    id: 'market-analysis',
    name: '竞品分析',
    description: '分析目标市场的竞品情况',
    icon: '📊',
    instruction: '分析无线耳机市场的主要竞品，包括价格、功能、用户评价等维度',
    category: 'market',
  },
  {
    id: 'product-copy',
    name: '产品文案',
    description: '撰写产品营销文案',
    icon: '✍️',
    instruction: '为智能手表撰写英文营销文案，突出健康监测和运动追踪功能',
    category: 'content',
  },
  {
    id: 'poster-design',
    name: '海报设计',
    description: '设计产品宣传海报',
    icon: '🎨',
    instruction: '设计一张促销海报，主题是夏季清仓，风格要清新活泼',
    category: 'design',
  },
  {
    id: 'video-script',
    name: '视频脚本',
    description: '编写TikTok视频脚本',
    icon: '🎬',
    instruction: '编写一个30秒的TikTok视频脚本，推广便携式咖啡机',
    category: 'video',
  },
  {
    id: 'customer-service',
    name: '客服话术',
    description: '生成客服回复模板',
    icon: '💬',
    instruction: '生成处理退货请求的客服话术模板，要求礼貌专业',
    category: 'service',
  },
  {
    id: 'seo-keywords',
    name: 'SEO关键词',
    description: '生成产品SEO关键词',
    icon: '🔍',
    instruction: '为户外露营帐篷生成SEO关键词列表，包括长尾关键词',
    category: 'market',
  },
  {
    id: 'email-campaign',
    name: '邮件营销',
    description: '撰写营销邮件',
    icon: '📧',
    instruction: '撰写一封促销邮件，推广新品智能音箱，包含优惠信息',
    category: 'content',
  },
  {
    id: 'social-post',
    name: '社媒内容',
    description: '创作社交媒体帖子',
    icon: '📱',
    instruction: '为Instagram创作3条帖子文案，推广环保购物袋',
    category: 'content',
  },
];

export const CATEGORY_LABELS: Record<PresetTask['category'], string> = {
  market: '市场分析',
  content: '内容创作',
  design: '设计',
  video: '视频',
  service: '客服',
};
