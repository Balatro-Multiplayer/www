import type { SeedEntry } from '@/lib/bracket'

/**
 * One seed per line, optionally linking a player profile with a pipe:
 * `PlayerName | 123456789012345678` (Discord id). Blank lines keep their
 * position as TBD.
 */
export function parseSeedLines(text: string): SeedEntry[] {
  return text.split('\n').map((line) => {
    const [name = '', playerId = ''] = line.split('|', 2)
    return {
      name: name.trim(),
      playerId: playerId.trim() || null,
    }
  })
}

/**
 * Insert a seed into the first blank line (staying within `size` positions),
 * or append when every existing line is filled and there's room left.
 * Returns the text unchanged when the bracket is already full.
 */
export function addSeedLine(
  text: string,
  entry: SeedEntry,
  size: number
): string {
  const lines = text.split('\n')
  const formatted = entry.playerId
    ? `${entry.name} | ${entry.playerId}`
    : entry.name

  for (let i = 0; i < Math.min(lines.length, size); i++) {
    if (!lines[i]?.trim()) {
      lines[i] = formatted
      return lines.join('\n')
    }
  }

  if (lines.filter((line) => line.trim()).length >= size) {
    return text
  }

  lines.push(formatted)
  return lines.join('\n')
}

export function formatSeedLines(seeds: readonly (SeedEntry | null)[]): string {
  return seeds
    .map((seed) => {
      if (!seed?.name) return ''
      return seed.playerId ? `${seed.name} | ${seed.playerId}` : seed.name
    })
    .join('\n')
}
