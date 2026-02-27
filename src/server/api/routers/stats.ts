import { createTRPCRouter, publicProcedure } from '@/server/api/trpc'
import { player_games } from '@/server/db/schema'
import {
  type OverallMatch,
  QUEUE_IDS,
  fetchMatches,
  getSeasonDateRange,
} from '@/server/services/match-fetcher'
import {
  SEASON_5_START_DATE,
  type Season,
  SeasonSchema,
} from '@/shared/seasons'
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
    avgMmrChange:
      eloCount > 0 ? Math.round((totalEloChanges / eloCount) * 10) / 10 : 0,
  }
}

const ALL_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5', 'season6']
const DB_SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4']

function parseInputDate(value?: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export const stats_router = createTRPCRouter({
  deck_popularity: publicProcedure
    .input(
      z
        .object({
          mode: z.enum(['season', 'dateRange']).optional(),
          season: SeasonSchema.optional().default('season6'),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const mode = input?.mode ?? 'season'

      if (mode === 'season') {
        const season = input?.season ?? 'season5'

        if (DB_SEASONS.includes(season)) {
          const { start, end } = getSeasonDateRange(season)
          const conditions = [
            gte(player_games.gameTime, start),
            lt(player_games.gameTime, end),
          ]
          if (input?.queueId)
            conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
          const rows = await ctx.db
            .select({ deck: player_games.deck })
            .from(player_games)
            .where(and(...conditions))
          return aggregateDeckStats(rows)
        }

        const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
        const allMatches = (
          await Promise.all(queueIds.map((q) => fetchMatches(q, season)))
        ).flat()
        return aggregateDeckStats(allMatches)
      }

      const startDate = parseInputDate(input?.startDate)
      const endDate = parseInputDate(input?.endDate)
      const endExclusive = endDate ? new Date(endDate) : undefined
      if (endExclusive) endExclusive.setDate(endExclusive.getDate() + 1)

      const effectiveEnd = endExclusive ?? new Date()
      const needsDb = !startDate || startDate < SEASON_5_START_DATE
      const needsApi = !endExclusive || effectiveEnd > SEASON_5_START_DATE
      const rows: Array<{ deck: string | null }> = []

      if (needsDb) {
        const dbEnd =
          endExclusive && endExclusive < SEASON_5_START_DATE
            ? endExclusive
            : SEASON_5_START_DATE
        const conditions = [lt(player_games.gameTime, dbEnd)]
        if (startDate) conditions.push(gte(player_games.gameTime, startDate))
        if (input?.queueId)
          conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
        const dbRows = await ctx.db
          .select({ deck: player_games.deck })
          .from(player_games)
          .where(and(...conditions))
        for (const row of dbRows) rows.push(row)
      }

      if (needsApi) {
        const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
        const allMatches = (
          await Promise.all(queueIds.map((q) => fetchMatches(q, 'season5')))
        ).flat()
        const apiStart =
          startDate && startDate > SEASON_5_START_DATE
            ? startDate
            : SEASON_5_START_DATE

        for (const match of allMatches) {
          const createdAt = new Date(match.created_at)
          if (createdAt < apiStart) continue
          if (endExclusive && createdAt >= endExclusive) continue
          rows.push({ deck: match.deck })
        }
      }

      return aggregateDeckStats(rows)
    }),

  stake_popularity: publicProcedure
    .input(
      z
        .object({
          mode: z.enum(['season', 'dateRange']).optional(),
          season: SeasonSchema.optional().default('season6'),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          queueId: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const mode = input?.mode ?? 'season'

      if (mode === 'season') {
        const season = input?.season ?? 'season5'

        if (DB_SEASONS.includes(season)) {
          const { start, end } = getSeasonDateRange(season)
          const conditions = [
            gte(player_games.gameTime, start),
            lt(player_games.gameTime, end),
          ]
          if (input?.queueId)
            conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
          const rows = await ctx.db
            .select({ stake: player_games.stake })
            .from(player_games)
            .where(and(...conditions))
          return aggregateStakeStats(rows)
        }

        const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
        const allMatches = (
          await Promise.all(queueIds.map((q) => fetchMatches(q, season)))
        ).flat()
        return aggregateStakeStats(allMatches)
      }

      const startDate = parseInputDate(input?.startDate)
      const endDate = parseInputDate(input?.endDate)
      const endExclusive = endDate ? new Date(endDate) : undefined
      if (endExclusive) endExclusive.setDate(endExclusive.getDate() + 1)

      const effectiveEnd = endExclusive ?? new Date()
      const needsDb = !startDate || startDate < SEASON_5_START_DATE
      const needsApi = !endExclusive || effectiveEnd > SEASON_5_START_DATE
      const rows: Array<{ stake: string | null }> = []

      if (needsDb) {
        const dbEnd =
          endExclusive && endExclusive < SEASON_5_START_DATE
            ? endExclusive
            : SEASON_5_START_DATE
        const conditions = [lt(player_games.gameTime, dbEnd)]
        if (startDate) conditions.push(gte(player_games.gameTime, startDate))
        if (input?.queueId)
          conditions.push(sql`${player_games.queueId} = ${input.queueId}`)
        const dbRows = await ctx.db
          .select({ stake: player_games.stake })
          .from(player_games)
          .where(and(...conditions))
        for (const row of dbRows) rows.push(row)
      }

      if (needsApi) {
        const queueIds = input?.queueId ? [input.queueId] : QUEUE_IDS
        const allMatches = (
          await Promise.all(queueIds.map((q) => fetchMatches(q, 'season5')))
        ).flat()
        const apiStart =
          startDate && startDate > SEASON_5_START_DATE
            ? startDate
            : SEASON_5_START_DATE

        for (const match of allMatches) {
          const createdAt = new Date(match.created_at)
          if (createdAt < apiStart) continue
          if (endExclusive && createdAt >= endExclusive) continue
          rows.push({ stake: match.stake })
        }
      }

      return aggregateStakeStats(rows)
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
          .where(
            and(
              gte(player_games.gameTime, start),
              lt(player_games.gameTime, end)
            )
          )

        const row = rows[0] ?? {
          totalGames: '0',
          uniquePlayers: '0',
          avgMmrChange: '0',
        }
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
