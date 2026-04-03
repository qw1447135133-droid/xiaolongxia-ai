export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { addSubscriber } from "@/lib/ws-server";

export async function GET(req: NextRequest) {
  let unsub: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const send = (data: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(enc.encode(data));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsub) unsub();
        try { controller.close(); } catch {}
      };

      // 初始连接确认
      send(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      // 注册到全局订阅者集合
      unsub = addSubscriber((data) => {
        if (!send(`data: ${data}\n\n`)) cleanup();
      });

      // 心跳保活（每 25s）
      heartbeat = setInterval(() => {
        if (!send(`: heartbeat\n\n`)) cleanup();
      }, 25000);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (unsub) unsub();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
