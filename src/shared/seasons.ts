import { z } from 'zod'

export const SEASON_1_START_DATE = new Date('2000-01-01T00:00:00.000Z')
export const SEASON_2_START_DATE = new Date('2025-04-02T13:00:00.000Z')
export const SEASON_3_START_DATE = new Date('2025-06-02T13:00:00.000Z')
export const SEASON_4_START_DATE = new Date('2025-09-01T05:00:00.000Z')
export const SEASON_5_START_DATE = new Date('2025-11-30T18:08:00.000Z')
export const SEASON_6_START_DATE = new Date('2026-02-27T18:00:00.000Z')

// Season type for selection
export const SeasonSchema = z.string().regex(/^season\d+$/)
export type Season = string

type CachedSeason = {
  id: number
  startDate: Date
  endDate: Date | null
  isActive: boolean
}

let seasonsCacheLoaderPromise:
  | Promise<() => Promise<CachedSeason[]>>
  | undefined

async function getSeasonsCacheLoader() {
  if (!seasonsCacheLoaderPromise) {
    seasonsCacheLoaderPromise = (async () => {
      const [{ unstable_cache }, { asc }, { db }, { seasons }] =
        await Promise.all([
          import('next/cache'),
          import('drizzle-orm'),
          import('@/server/db'),
          import('@/server/db/schema'),
        ])

      return unstable_cache(
        async () =>
          db
            .select({
              id: seasons.id,
              startDate: seasons.startDate,
              endDate: seasons.endDate,
              isActive: seasons.isActive,
            })
            .from(seasons)
            .orderBy(asc(seasons.id)),
        ['season-config'],
        { tags: ['seasons'] }
      )
    })()
  }

  return seasonsCacheLoaderPromise
}

export function isSeason(value: unknown): value is Season {
  return SeasonSchema.safeParse(value).success
}

// Helper function to determine which season a date belongs to
export async function getSeasonForDate(date: Date): Promise<Season> {
  const loadSeasons = await getSeasonsCacheLoader()
  const seasons = await loadSeasons()

  const matchedSeason = seasons.find((season) => {
    if (date < season.startDate) {
      return false
    }

    return season.endDate ? date < season.endDate : season.isActive
  })

  if (matchedSeason) {
    return `season${matchedSeason.id}`
  }

  for (let i = seasons.length - 1; i >= 0; i -= 1) {
    const season = seasons[i]
    if (season && date >= season.startDate) {
      return `season${season.id}`
    }
  }

  if (seasons[0]) {
    return `season${seasons[0].id}`
  }

  return 'season1'
}

// Helper function to filter games by season
export function filterGamesBySeason<T extends { season?: string | null }>(
  games: T[],
  season: Season
): T[] {
  return games.filter((game) => game.season === season)
}

// Helper function to get a display name for a season
export function getSeasonDisplayName(season: Season): string {
  const match = /^season(\d+)$/.exec(season)
  return match ? `Season ${match[1]}` : season
}
