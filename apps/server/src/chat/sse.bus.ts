import EventEmitter from "eventemitter3";

// 轻量事件总线：用于把 “生成中的流 chunk / done” 广播给多个跟随 SSE 客户端。
export const sseEventBus = new EventEmitter();
