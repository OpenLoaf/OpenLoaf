import EventEmitter from "eventemitter3";

// 轻量事件总线：用于广播 stream chunk / done（给多个 SSE 跟随者）。
export const sseEventBus = new EventEmitter();
