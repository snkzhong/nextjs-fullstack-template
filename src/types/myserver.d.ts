declare global {
  interface MyServerContext {
    getConfig: getConfig; // 根据实际类型调整
    eventSystem: EventSystem; // 根据实际类型调整
    hookSystem: HookSystem; // 根据实际类型调整
    messageQueue: MessageQueue; // 根据实际类型调整
  }

  var serverContext: MyServerContext;
}

export function getConfig(path: string): any;

export interface EventSystem {
  on(event: string, listener: (...args: any[]) => void);

  off(event: string, listener: (...args: any[]) => void);
  
  emit(event: string, ...args: any[]);
}

export interface HookSystem {
  
  register(hookName: string, callback: (...args: any[]) => any);

  async run(hookName: string, ...args: any[]);
}

export interface MessageQueue {

  async enqueue(task: () => Promise<void>);
}