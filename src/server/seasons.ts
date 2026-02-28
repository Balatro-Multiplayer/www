import { db } from '@/server/db'
import { seasons } from '@/server/db/schema'
import { redis } from '@/server/redis'
import type { Season } from '@/shared/seasons'
import { asc } from 'drizzle-orm'

type CachedSeason = {
  id: number
  startDate: Date
  endDate: Date | null
  isActive: boolean
}

const SEASONS_CACHE_KEY = 'config:seasons'

function serializeSeasons(seasons: CachedSeason[]) {
  return JSON.stringify(
    seasons.map((season) => ({
      ...season,
      startDate: season.startDate.toISOString(),
      endDate: season.endDate?.toISOString() ?? null,
    }))
  )
}

function deserializeSeasons(value: string): CachedSeason[] {
  const parsed = JSON.parse(value) as Array<{
    id: number
    startDate: string
    endDate: string | null
    isActive: boolean
  }>

  return parsed.map((season) => ({
    ...season,
    startDate: new Date(season.startDate),
    endDate: season.endDate ? new Date(season.endDate) : null,
  }))
}

async function loadSeasons(): Promise<CachedSeason[]> {
  const cached = await redis.get(SEASONS_CACHE_KEY)
  if (cached) {
    return deserializeSeasons(cached)
  }

  const loadedSeasons = await db
    .select({
      id: seasons.id,
      startDate: seasons.startDate,
      endDate: seasons.endDate,
      isActive: seasons.isActive,
    })
    .from(seasons)
    .orderBy(asc(seasons.id))

  await redis.set(SEASONS_CACHE_KEY, serializeSeasons(loadedSeasons))

  return loadedSeasons
}

export async function getSeasonForDate(date: Date): Promise<Season> {
  const loadedSeasons = await loadSeasons()

  const matchedSeason = loadedSeasons.find((season) => {
    if (date < season.startDate) {
      return false
    }

    return season.endDate ? date < season.endDate : season.isActive
  })

  if (matchedSeason) {
    return `season${matchedSeason.id}`
  }

  for (let i = loadedSeasons.length - 1; i >= 0; i -= 1) {
    const season = loadedSeasons[i]
    if (season && date >= season.startDate) {
      return `season${season.id}`
    }
  }

  if (loadedSeasons[0]) {
    return `season${loadedSeasons[0].id}`
  }

  return 'season1'
}
