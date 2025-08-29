import { EventEmitter } from 'events';
import { EventHandler } from '~/backend/types';

// 事件系统
export class EventSystem {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
  }

  on(event: string, listener: EventHandler) {
    this.emitter.on(event, listener);
    return this;
  }

  off(event: string, listener: EventHandler) {
    this.emitter.off(event, listener);
    return this;
  }

  emit(event: string, ...args: any[]) {
    this.emitter.emit(event, ...args);
    return this;
  }
}