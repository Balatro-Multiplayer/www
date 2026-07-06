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

export function formatSeedLines(seeds: readonly (SeedEntry | null)[]): string {
  return seeds
    .map((seed) => {
      if (!seed?.name) return ''
      return seed.playerId ? `${seed.name} | ${seed.playerId}` : seed.name
    })
    .join('\n')
}
