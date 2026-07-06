/**
 * Shared, pure logic for a poll's effective open/closed state.
 *
 * A poll is closed when it was manually closed (`status === 'closed'`) or its
 * scheduled auto-close time has passed. Computed on read — no background job.
 */
export type PollCloseState = {
  status: string
  closesAt: Date | string | null
}

export function isPollClosed(
  poll: PollCloseState,
  now: number = Date.now()
): boolean {
  if (poll.status === 'closed') return true
  if (poll.closesAt == null) return false
  const closes =
    poll.closesAt instanceof Date
      ? poll.closesAt.getTime()
      : new Date(poll.closesAt).getTime()
  return Number.isFinite(closes) && closes <= now
}
