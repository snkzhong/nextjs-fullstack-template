// 消息队列
export class MessageQueue {
  private queue: any[] = [];
  private processing = false;

  async enqueue(task: () => Promise<void>) {
    this.queue.push(task);
    await this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;

    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (error) {
        console.error('MessageQueue task error:', error);
      }
    }
    this.processing = false;
  }
}