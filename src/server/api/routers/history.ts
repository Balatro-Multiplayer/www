import { createTRPCRouter, publicProcedure, transcriptProcedure } from '@/server/api/trpc'
import { player_games } from '@/server/db/schema'
import type { SelectGames } from '@/server/db/types'
import {
  type PlayerMatch,
  botlatro_service,
} from '@/server/services/botlatro.service'
import { fetchMatches, QUEUE_IDS } from '@/server/services/match-fetcher'
import {
  CASUAL_QUEUE_ID,
  RANKED_QUEUE_ID,
  SANDBOX_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { SEASON_5_START_DATE } from '@/shared/seasons'
import { and, gt, lt } from 'drizzle-orm'
import { z } from 'zod'

function formatTimeKey(date: Date, groupBy: string): string {
  switch (groupBy) {
    case 'hour':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
    case 'day':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    case 'week': {
      const firstDayOfWeek = new Date(date)
      firstDayOfWeek.setDate(date.getDate() - date.getDay())
      return `Week of ${firstDayOfWeek.getFullYear()}-${String(firstDayOfWeek.getMonth() + 1).padStart(2, '0')}-${String(firstDayOfWeek.getDate()).padStart(2, '0')}`
    }
    case 'month':
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    default:
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
  }
}

export const history_router = createTRPCRouter({
  getTranscript: transcriptProcedure
    .input(
      z.object({
        gameNumber: z.number(),
      })
    )
    .query(async ({ input }) => {
      return await botlatro_service.get_transcript(input.gameNumber)
    }),
  games_per_hour: publicProcedure
    .input(
      z
        .object({
          groupBy: z.enum(['hour', 'day', 'week', 'month']).default('hour'),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const groupBy = input?.groupBy || 'hour'
      const startDate = input?.startDate ? new Date(input.startDate) : undefined
      const endDate = input?.endDate ? new Date(input.endDate) : undefined
      const nextDay = endDate ? new Date(endDate) : undefined
      if (nextDay) nextDay.setDate(nextDay.getDate() + 1)

      const effectiveEnd = nextDay ?? new Date()
      const needsDb = !startDate || startDate < SEASON_5_START_DATE
      const needsApi = !nextDay || effectiveEnd > SEASON_5_START_DATE

      const gamesByTimeUnit: Record<string, number> = {}

      // Old data (seasons 1-4) from DB
      if (needsDb) {
        const dbEnd = nextDay && nextDay < SEASON_5_START_DATE ? nextDay : SEASON_5_START_DATE
        const games = await ctx.db
          .select({
            gameTime: player_games.gameTime,
            gameNum: player_games.gameNum,
          })
          .from(player_games)
          .where(
            and(
              startDate ? gt(player_games.gameTime, startDate) : undefined,
              lt(player_games.gameTime, dbEnd)
            )
          )
          .orderBy(player_games.gameTime)

        const seen = new Set<number>()
        for (const game of games) {
          if (!game.gameTime || !game.gameNum || seen.has(game.gameNum)) continue
          seen.add(game.gameNum)
          const key = formatTimeKey(new Date(game.gameTime), groupBy)
          gamesByTimeUnit[key] = (gamesByTimeUnit[key] || 0) + 1
        }
      }

      // Season 5+ data from Botlatro API
      if (needsApi) {
        const allMatches = (
          await Promise.all(QUEUE_IDS.map((q) => fetchMatches(q, 'season5')))
        ).flat()

        const apiStart = startDate && startDate > SEASON_5_START_DATE ? startDate : SEASON_5_START_DATE

        const seen = new Set<number>()
        for (const m of allMatches) {
          if (seen.has(m.match_id)) continue
          seen.add(m.match_id)
          const date = new Date(m.created_at)
          if (date < apiStart) continue
          if (nextDay && date >= nextDay) continue
          const key = formatTimeKey(date, groupBy)
          gamesByTimeUnit[key] = (gamesByTimeUnit[key] || 0) + 1
        }
      }

      return Object.entries(gamesByTimeUnit)
        .map(([timeUnit, count]) => ({ timeUnit, count, groupBy }))
        .sort((a, b) => a.timeUnit.localeCompare(b.timeUnit))
    }),
  user_games: publicProcedure
    .input(
      z.object({
        user_id: z.string(),
        queue_id: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const matches = await botlatro_service.get_player_matches({
        userId: input.user_id,
      })
      return normalizeBotlatroMatchHistory(matches)
    }),
})

function normalizeBotlatroMatchHistory(matches: PlayerMatch[]): SelectGames[] {
  console.log(matches.filter((m) => m.opponents.length === 0))
  return matches
    .filter((m) => m.opponents.length > 0)
    .map((match) => ({
      playerId: match.player_id,
      queueId: match.queue_id.toString(),
      playerName: match.player_name,
      gameId: match.match_id,
      gameTime: new Date(match.created_at),
      gameType: getGameType(match.queue_id.toString()),
      gameNum: match.match_id,
      playerMmr: match.mmr_after,
      mmrChange: match.elo_change,
      opponentId: match.opponents[0]!.user_id,
      opponentName: match.opponents[0]!.name,
      opponentMmr: match.opponents[0]!.mmr_after,
      deck: match.deck,
      stake: match.stake,
      result: match.won ? 'win' : 'loss',
      season: 'season5',
    }))
}

function getGameType(queue_id: string) {
  switch (queue_id) {
    case RANKED_QUEUE_ID:
      return 'ranked'
    case SMALLWORLD_QUEUE_ID:
      return 'smallworld'
    case VANILLA_QUEUE_ID:
      return 'vanilla'
    case SANDBOX_QUEUE_ID:
      return 'sandbox'
    case CASUAL_QUEUE_ID:
      return 'casual'
    default:
      return 'unknown'
  }
}
