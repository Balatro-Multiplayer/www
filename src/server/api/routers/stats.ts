import { createTRPCRouter, publicProcedure } from '@/server/api/trpc'
import { player_games } from '@/server/db/schema'
import { redis } from '@/server/redis'
import {
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
  CASUAL_QUEUE_ID,
} from '@/shared/constants'
import {
  SEASON_2_START_DATE,
  SEASON_3_START_DATE,
  SEASON_4_START_DATE,
  SEASON_5_START_DATE,
  SeasonSchema,
  type Season,
} from '@/shared/seasons'
import { and, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

const BOTLATRO_URL = 'http://balatro.virtualized.dev:4931/'

function getSeasonDateRange(season: Season): { start: Date; end: Date } {
  switch (season) {
    case 'season1':
      return { start: new Date('2000-01-01'), end: SEASON_2_START_DATE }
    case 'season2':
      return { start: SEASON_2_START_DATE, end: SEASON_3_START_DATE }
    case 'season3':
      return { start: SEASON_3_START_DATE, end: SEASON_4_START_DATE }
    case 'season4':
      return { start: SEASON_4_START_DATE, end: SEASON_5_START_DATE }
    case 'season5':
      return { start: SEASON_5_START_DATE, end: new Date('2099-01-01') }
  }
}

type OverallMatch = {
  match_id: number
  winning_team: number | null
  deck: string | null
  stake: string | null
  created_at: string
  players: Array<{ user_id: string; team: number | null; elo_change: number | null }>
}

const QUEUE_IDS = [RANKED_QUEUE_ID, SMALLWORLD_QUEUE_ID, VANILLA_QUEUE_ID, CASUAL_QUEUE_ID]

async function fetchMatches(queueId: string, season: Season): Promise<OverallMatch[]> {
  const cacheKey = `stats:matches:${queueId}:${season}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const { start, end } = getSeasonDateRange(season)
  const params = new URLSearchParams({
    limit: '200000',
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  })
  const res = await fetch(`${BOTLATRO_URL}api/stats/overall-history/${queueId}?${params}`)
  if (!res.ok) throw new Error(`Botlatro API error: ${res.status}`)
  const data = (await res.json()) as { matches: OverallMatch[] }

  await redis.set(cacheKey, JSON.stringify(data.matches), { EX: 300 })
  return data.matches
}

function aggregateDeckStats(matches: OverallMatch[]) {
  const counts: Record<string, number> = {}
  let total = 0
  for (const m of matches) {
    if (!m.deck) continue
    const deck = m.deck.replace('Deck', '').trim().toLowerCase()
    if (!deck || deck === 'unknown') continue
    counts[deck] = (counts[deck] ?? 0) + 1
    total++
  }
  return Object.entries(counts)
    .map(([deck, games]) => ({
      deck,
      games,
      pickRate: total > 0 ? Math.round((games / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.games - a.games)
}

function aggregateStakeStats(matches: OverallMatch[]) {
  const counts: Record<string, number> = {}
  let total = 0
  for (const m of matches) {
    if (!m.stake) continue
    const stake = m.stake.replace('Stake', '').trim().toLowerCase()
    if (!stake || stake === 'unknown') continue
    counts[stake] = (counts[stake] ?? 0) + 1
    total++
  }
  return Object.entries(counts)
    .map(([stake, games]) => ({
      stake,
      games,
      pickRate: total > 0 ? Math.round((games / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.games - a.games)
}

function aggregateSeasonOverview(matches: OverallMatch[]) {
  const uniquePlayers = new Set<string>()
  let totalEloChanges = 0
  let eloCount = 0
  for (const m of matches) {
    for (const p of m.players) {
      uniquePlayers.add(p.user_id)
      if (p.elo_change != null) {
        totalEloChanges += Math.abs(p.elo_change)
        eloCount++
      }
    }
  }
  return {
    totalGames: matches.length,
    uniquePlayers: uniquePlayers.size,
    avgMmrChange: eloCount > 0 ? Math.round((totalEloChanges / eloCount) * 10) / 10 : 0,
  }
}

const ALL_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5']
const DB_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4']

export const stats_router = createTRPCRouter({
  deck_popularity: publicProcedure
    .input(
      z
        .object({
          season: SeasonSchema.optional().default('season5'),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const season = input?.season ?? 'season5'
      const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS

      const allMatches = (await Promise.all(queueIds.map((q) => fetchMatches(q, season)))).flat()
      return aggregateDeckStats(allMatches)
    }),

  stake_popularity: publicProcedure
    .input(
      z
        .object({
          season: SeasonSchema.optional().default('season5'),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const season = input?.season ?? 'season5'
      const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS

      const allMatches = (await Promise.all(queueIds.map((q) => fetchMatches(q, season)))).flat()
      return aggregateStakeStats(allMatches)
    }),

  season_overview: publicProcedure.query(async ({ ctx }) => {
    // Seasons 1-4: use local DB (has data). Season 5+: use botlatro API.
    const dbResults = await Promise.all(
      DB_SEASONS.map(async (season) => {
        const { start, end } = getSeasonDateRange(season)
        const rows = await ctx.db
          .select({
            totalGames: sql<string>`count(distinct ${player_games.gameNum})::int`,
            uniquePlayers: sql<string>`count(distinct ${player_games.playerId})::int`,
            avgMmrChange: sql<string>`coalesce(avg(abs(${player_games.mmrChange})), 0)`,
          })
          .from(player_games)
          .where(and(gte(player_games.gameTime, start), lt(player_games.gameTime, end)))

        const row = rows[0]!
        return {
          season,
          totalGames: Number(row.totalGames),
          uniquePlayers: Number(row.uniquePlayers),
          avgMmrChange: Math.round(Number(row.avgMmrChange) * 10) / 10,
        }
      })
    )

    // Season 5: fetch from API
    const s5Matches = (await Promise.all(QUEUE_IDS.map((q) => fetchMatches(q, 'season5')))).flat()
    const s5 = aggregateSeasonOverview(s5Matches)

    return [
      ...dbResults,
      { season: 'season5' as Season, ...s5 },
    ]
  }),
})
