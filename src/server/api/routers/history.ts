import { createTRPCRouter, publicProcedure, transcriptProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import { metadata, player_games, raw_history } from '@/server/db/schema'
import type { SelectGames } from '@/server/db/types'
import {
  type PlayerMatch,
  botlatro_service,
} from '@/server/services/botlatro.service'
import {
  CASUAL_QUEUE_ID,
  RANKED_QUEUE_ID,
  SANDBOX_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { and, desc, eq, gt, lt } from 'drizzle-orm'
import { chunk } from 'remeda'
import { z } from 'zod'

async function pLimit<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<any>
): Promise<any[]> {
  const results: any[] = []
  const executing: Promise<void>[] = []

  for (const item of items) {
    const p = Promise.resolve()
      .then(() => fn(item))
      .then((result) => {
        results.push(result)
      })

    executing.push(p)

    if (executing.length >= concurrency) {
      await Promise.race(executing)
      executing.splice(
        executing.findIndex((e) => e === p),
        1
      )
    }
  }

  await Promise.all(executing)
  return results
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
      const games = await ctx.db
        .select({
          gameTime: player_games.gameTime,
          gameNum: player_games.gameNum,
        })
        .from(player_games)
        .where(
          and(
            startDate ? gt(player_games.gameTime, startDate) : undefined,
            nextDay ? lt(player_games.gameTime, nextDay) : undefined
          )
        )
        .orderBy(player_games.gameTime)

      // Track unique game numbers to avoid counting the same game twice
      const processedGameNums = new Set<number>()

      // Group games by the selected time unit
      const gamesByTimeUnit = games.reduce<Record<string, number>>(
        (acc, game) => {
          if (!game.gameTime || !game.gameNum) return acc

          // Skip if we've already processed this game number
          if (processedGameNums.has(game.gameNum)) return acc

          // Mark this game as processed
          processedGameNums.add(game.gameNum)

          const date = new Date(game.gameTime)
          let timeKey: string

          switch (groupBy) {
            case 'hour':
              // Format: YYYY-MM-DD HH:00
              timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
              break
            case 'day':
              // Format: YYYY-MM-DD
              timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
              break
            case 'week':
              // Get the first day of the week (Sunday)
              const firstDayOfWeek = new Date(date)
              const day = date.getDay() // 0 = Sunday, 1 = Monday, etc.
              firstDayOfWeek.setDate(date.getDate() - day)
              timeKey = `Week of ${firstDayOfWeek.getFullYear()}-${String(firstDayOfWeek.getMonth() + 1).padStart(2, '0')}-${String(firstDayOfWeek.getDate()).padStart(2, '0')}`
              break
            case 'month':
              // Format: YYYY-MM
              timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              break
            default:
              timeKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
          }

          acc[timeKey] = (acc[timeKey] || 0) + 1
          return acc
        },
        {}
      )

      // Convert to array format for chart
      return Object.entries(gamesByTimeUnit).map(([timeUnit, count]) => ({
        timeUnit,
        count,
        groupBy,
      }))
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
