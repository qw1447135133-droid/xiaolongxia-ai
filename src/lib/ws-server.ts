// 全局 SSE 订阅者集合 - 模块级单例，所有 route 共享同一个 Set
// Next.js 在同一进程内复用模块，所以这里是真正的单例
const subscribers = new Set<(data: string) => void>();

// engine.ts 调用这个来广播事件
export function broadcast(msg: object) {
  const data = JSON.stringify(msg);
  console.log(`[broadcast] ${subscribers.size} subscribers, type=${(msg as { type?: string }).type}`);
  subscribers.forEach(fn => {
    try { fn(data); } catch { subscribers.delete(fn); }
  });
}

// /api/events 调用这个注册 SSE 客户端
export function addSubscriber(fn: (data: string) => void): () => void {
  subscribers.add(fn);
  console.log(`[SSE] subscriber added, total=${subscribers.size}`);
  return () => {
    subscribers.delete(fn);
    console.log(`[SSE] subscriber removed, total=${subscribers.size}`);
  };
}

export function subscriberCount() {
  return subscribers.size;
}
