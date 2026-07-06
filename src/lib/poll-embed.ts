/**
 * Shared helpers for the poll Discord embed (OG image + theme-color) so the
 * image route and `generateViewport` agree on the per-poll accent color.
 */
import { isPollClosed, type PollCloseState } from '@/lib/poll-status'

/** Deterministic 32-bit hash of a string (FNV-1a). */
function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function hslToHex(h: number, s: number, l: number): string {
  const lightness = l / 100
  const a = (s * Math.min(lightness, 1 - lightness)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = lightness - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** Stable, vivid accent color derived from a poll uuid. */
export function accentColorForUuid(uuid: string): string {
  const hue = hashString(uuid) % 360
  return hslToHex(hue, 70, 60)
}

/** Absolute, cache-safe close label for the embed ("Ends …" / "Closed"). */
export function formatCloseLabel(poll: PollCloseState): string {
  if (isPollClosed(poll)) return 'Closed'
  if (poll.closesAt == null) return 'No close time'
  const date =
    poll.closesAt instanceof Date ? poll.closesAt : new Date(poll.closesAt)
  const formatted = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
  return `Ends ${formatted} UTC`
}
