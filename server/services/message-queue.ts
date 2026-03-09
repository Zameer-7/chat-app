/**
 * Simple in-memory message queue to prevent message loss under load.
 * Messages are queued and processed sequentially so DB writes never pile up
 * or get dropped when traffic spikes.
 *
 * For production scale, replace with BullMQ / Redis queue.
 */

type QueueTask = () => Promise<void>;

class MessageQueue {
  private queue: QueueTask[] = [];
  private processing = false;

  /** Enqueue a DB-write task. Returns a promise that resolves when the task completes. */
  enqueue(task: QueueTask): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await task();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch {
        // Error already forwarded to the enqueue caller via reject
      }
    }

    this.processing = false;
  }

  /** Current queue depth (for monitoring) */
  get depth(): number {
    return this.queue.length;
  }
}

// Separate queues for room messages and direct messages
export const roomMessageQueue = new MessageQueue();
export const directMessageQueue = new MessageQueue();
