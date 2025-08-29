import { HookHandler } from '~/backend/types';

// Hook 系统
export class HookSystem {
  private hooks: Record<string, (HookHandler)[]> = {};

  register(hookName: string, callback: HookHandler) {
    if (!this.hooks[hookName]) {
      this.hooks[hookName] = [];
    }
    this.hooks[hookName].push(callback);
    return this;
  }

  async run(hookName: string, ...args: any[]) {
    const callbacks = this.hooks[hookName] || [];
    let result = args;

    for (const callback of callbacks) {
      result = await callback(...result);
    }

    return result;
  }
}