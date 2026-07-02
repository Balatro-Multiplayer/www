import { redis } from '@/server/redis'
import {
  CASUAL_QUEUE_ID,
  LEGACY_QUEUE_ID,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import {
  SEASON_1_START_DATE,
  SEASON_2_START_DATE,
  SEASON_3_START_DATE,
  SEASON_4_START_DATE,
  SEASON_5_START_DATE,
  SEASON_6_START_DATE,
  SEASON_7_START_DATE,
  type Season,
} from '@/shared/seasons'

const BOTLATRO_URL = 'http://balatro.virtualized.dev:4931/'

export type OverallMatch = {
  match_id: number
  winning_team: number | null
  deck: string | null
  stake: string | null
  created_at: string
  players: Array<{
    user_id: string
    team: number | null
    elo_change: number | null
  }>
}

export const QUEUE_IDS = [
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
  LEGACY_QUEUE_ID,
  CASUAL_QUEUE_ID,
]

function getSeasonNumber(season: Season): number | null {
  const match = /^season(\d+)$/.exec(season)
  if (!match) return null

  const seasonNumber = Number(match[1])
  return Number.isInteger(seasonNumber) ? seasonNumber : null
}

export function getSeasonDateRange(season: Season): { start: Date; end: Date } {
  switch (season) {
    case 'season1':
      return { start: SEASON_1_START_DATE, end: SEASON_2_START_DATE }
    case 'season2':
      return { start: SEASON_2_START_DATE, end: SEASON_3_START_DATE }
    case 'season3':
      return { start: SEASON_3_START_DATE, end: SEASON_4_START_DATE }
    case 'season4':
      return { start: SEASON_4_START_DATE, end: SEASON_5_START_DATE }
    case 'season5':
      return { start: SEASON_5_START_DATE, end: SEASON_6_START_DATE }
    case 'season6':
      return { start: SEASON_6_START_DATE, end: SEASON_7_START_DATE }
    case 'season7':
      return { start: SEASON_7_START_DATE, end: new Date('2099-01-01') }
  }

  throw new Error(`Unknown season: ${season}`)
}

export async function fetchMatches(
  queueId: string,
  season: Season
): Promise<OverallMatch[]> {
  const cacheKey = `stats:matches:v3:${queueId}:${season}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const { start, end } = getSeasonDateRange(season)

  let params: URLSearchParams
  const seasonNumber = getSeasonNumber(season)
  if (seasonNumber && seasonNumber >= 5) {
    params = new URLSearchParams({
      limit: '200000',
      season: seasonNumber.toString(),
    })
  } else {
    params = new URLSearchParams({
      limit: '200000',
      start_date: start.toISOString(),
      end_date: end.toISOString(),
    })
  }

  const res = await fetch(
    `${BOTLATRO_URL}api/stats/overall-history/${queueId}?${params}`
  )
  if (!res.ok) throw new Error(`Botlatro API error: ${res.status}`)
  const data = (await res.json()) as { matches: OverallMatch[] }

  // The API's `season` filter is not a strict window (it can return games from
  // other seasons), so always constrain to the season's date range. This keeps
  // season-scoped consumers (deck/stake popularity, season overview) from
  // counting games that belong to a different season.
  const matches = data.matches.filter((match) => {
    const createdAt = new Date(match.created_at)
    return createdAt >= start && createdAt < end
  })

  await redis.set(cacheKey, JSON.stringify(matches), { EX: 7200 })
  return matches
}
