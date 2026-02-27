import { createTRPCRouter, publicProcedure } from '@/server/api/trpc'
import { player_games } from '@/server/db/schema'
import {
  fetchMatches,
  getSeasonDateRange,
  QUEUE_IDS,
  type OverallMatch,
} from '@/server/services/match-fetcher'
import { SeasonSchema, type Season } from '@/shared/seasons'
import { and, gte, lt, sql } from 'drizzle-orm'
import { z } from 'zod'

function aggregateDeckStats(matches: { deck: string | null }[]) {
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

function aggregateStakeStats(matches: { stake: string | null }[]) {
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

const ALL_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5', 'season6']
const DB_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4']

export const stats_router = createTRPCRouter({
  deck_popularity: publicProcedure
    .input(
      z
        .object({
          season: SeasonSchema.optional().default('season6'),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const season = input?.season ?? 'season6'

      if (DB_SEASONS.includes(season)) {
        const { start, end } = getSeasonDateRange(season)
        const conditions = [gte(player_games.gameTime, start), lt(player_games.gameTime, end)]
        if (input?.queueId) conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
        const rows = await ctx.db
          .select({ deck: player_games.deck })
          .from(player_games)
          .where(and(...conditions))
        return aggregateDeckStats(rows)
      }

      const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
      const allMatches = (await Promise.all(queueIds.map((q) => fetchMatches(q, season)))).flat()
      return aggregateDeckStats(allMatches)
    }),

  stake_popularity: publicProcedure
    .input(
      z
        .object({
          season: SeasonSchema.optional().default('season6'),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const season = input?.season ?? 'season6'

      if (DB_SEASONS.includes(season)) {
        const { start, end } = getSeasonDateRange(season)
        const conditions = [gte(player_games.gameTime, start), lt(player_games.gameTime, end)]
        if (input?.queueId) conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
        const rows = await ctx.db
          .select({ stake: player_games.stake })
          .from(player_games)
          .where(and(...conditions))
        return aggregateStakeStats(rows)
      }

      const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
      const allMatches = (await Promise.all(queueIds.map((q) => fetchMatches(q, season)))).flat()
      return aggregateStakeStats(allMatches)
    }),

  season_overview: publicProcedure.query(async ({ ctx }) => {
    // Seasons 1-5: use local DB (has data). Season 6+: use botlatro API.
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

    // Seasons 5 and 6: fetch from API
    const [s5Matches, s6Matches] = await Promise.all([
      Promise.all(QUEUE_IDS.map((q) => fetchMatches(q, 'season5'))).then((r) => r.flat()),
      Promise.all(QUEUE_IDS.map((q) => fetchMatches(q, 'season6'))).then((r) => r.flat()),
    ])
    const s5 = aggregateSeasonOverview(s5Matches)
    const s6 = aggregateSeasonOverview(s6Matches)

    return [
      ...dbResults,
      { season: 'season5' as Season, ...s5 },
      { season: 'season6' as Season, ...s6 },
    ]
  }),
})
