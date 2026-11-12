import type { Review } from '@english-app/shared'
import { api } from '../api/client.ts'

export function sendReviews(reviews: Review[]): Promise<unknown> {
  return api('/reviews/batch', { method: 'POST', body: { reviews } })
}

/** Holds reviews not yet accepted by the server and sends them one batch at a time. */
export class ReviewSync {
  pending: Review[] = []
  private running: Promise<void> | null = null
  private readonly send: (reviews: Review[]) => Promise<unknown>

  constructor(send: (reviews: Review[]) => Promise<unknown>) {
    this.send = send
  }

  add(review: Review): void {
    this.pending.push(review)
  }

  /** Sends everything pending. On failure the reviews stay pending and the error is rethrown. */
  async flush(): Promise<void> {
    while (this.running) await this.running.catch(() => {})
    if (this.pending.length === 0) return
    const batch = [...this.pending]
    this.running = (async () => {
      await this.send(batch)
      this.pending = this.pending.filter((r) => !batch.includes(r))
    })()
    try {
      await this.running
    } finally {
      this.running = null
    }
  }
}
