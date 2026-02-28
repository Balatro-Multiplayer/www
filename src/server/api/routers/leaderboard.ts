import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from '@/server/api/trpc'
import type { LeaderboardEntry } from '@/server/services/botlatro.service'
import type { PaginationOptions } from '@/server/services/leaderboard'
import { LeaderboardService } from '@/server/services/leaderboard'
import { SeasonSchema } from '@/shared/seasons'
import { z } from 'zod'

const service = new LeaderboardService()

type StaticLeaderboardInput = {
  page: number
  pageSize: number
  search?: string
  minGames?: number
  maxGames?: number
  sortBy?: PaginationOptions['sortBy']
  sortOrder?: PaginationOptions['sortOrder']
}

function getStaticLeaderboardResponse(
  seasonData: LeaderboardEntry[],
  input: StaticLeaderboardInput
) {
  let filtered = seasonData

  if (input.search) {
    const searchLower = input.search.toLowerCase()
    filtered = filtered.filter((entry) =>
      entry.name.toLowerCase().includes(searchLower)
    )
  }

  if (input.minGames !== undefined) {
    const minGames = input.minGames
    filtered = filtered.filter((entry) => entry.totalgames >= minGames)
  }

  if (input.maxGames !== undefined) {
    const maxGames = input.maxGames
    filtered = filtered.filter((entry) => entry.totalgames <= maxGames)
  }

  if (input.sortBy) {
    const sortBy = input.sortBy
    const order = input.sortOrder === 'asc' ? 1 : -1
    filtered = [...filtered].sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]
      return aVal < bVal ? -order : aVal > bVal ? order : 0
    })
  }

  const total = filtered.length
  const offset = (input.page - 1) * input.pageSize
  const paginated = filtered.slice(offset, offset + input.pageSize)

  return {
    data: paginated,
    total,
    page: input.page,
    pageSize: input.pageSize,
    totalPages: Math.ceil(total / input.pageSize),
    isStale: false,
  }
}

export const leaderboard_router = createTRPCRouter({
  get_leaderboard: publicProcedure
    .input(
      z.object({
        channel_id: z.string(),
        season: SeasonSchema.optional().default('season6'),
        page: z.number().min(1).optional().default(1),
        pageSize: z.number().min(1).max(100).optional().default(50),
        search: z.string().optional(),
        minGames: z.number().optional(),
        maxGames: z.number().optional(),
        sortBy: z
          .enum([
            'rank',
            'mmr',
            'wins',
            'losses',
            'winrate',
            'totalgames',
            'streak',
            'peak_mmr',
            'peak_streak',
          ])
          .optional(),
        sortOrder: z.enum(['asc', 'desc']).optional(),
      })
    )
    .query(async ({ input }) => {
      if (
        input.season === 'season1' ||
        input.season === 'season2' ||
        input.season === 'season4'
      ) {
        let seasonData: LeaderboardEntry[]
        if (input.season === 'season1') {
          seasonData = await service.getSeason1Leaderboard(input.channel_id)
        } else if (input.season === 'season2') {
          seasonData = await service.getSeason2Leaderboard(input.channel_id)
        } else {
          seasonData = await service.getSeason4Leaderboard(input.channel_id)
        }

        return getStaticLeaderboardResponse(seasonData, input)
      }
      if (input.season === 'season3') {
        const seasonData = await service.getSeason3Leaderboard(input.channel_id)
        return getStaticLeaderboardResponse(seasonData, input)
      }
      if (input.season === 'season5') {
        const seasonData = await service.getSeason5Leaderboard(input.channel_id)
        return getStaticLeaderboardResponse(seasonData, input)
      }
      if (input.season === 'season6') {
        const seasonData = await service.getSeason6Leaderboard(input.channel_id)
        return getStaticLeaderboardResponse(seasonData, input)
      }

      const result = await service.getLeaderboard(input.channel_id, {
        page: input.page,
        pageSize: input.pageSize,
        search: input.search,
        minGames: input.minGames,
        maxGames: input.maxGames,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
      })
      return {
        data: result.data as LeaderboardEntry[],
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        isStale: result.isStale,
      }
    }),
  get_leaderboard_snapshots: adminProcedure
    .input(
      z.object({
        channel_id: z.string(),
        limit: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return await service.getLeaderboardSnapshots(
        input.channel_id,
        input.limit
      )
    }),
  rating_distribution: publicProcedure
    .input(
      z.object({
        channel_id: z.string(),
        season: SeasonSchema.optional().default('season6'),
      })
    )
    .query(async ({ input }) => {
      let entries: LeaderboardEntry[]

      if (input.season === 'season1') {
        entries = await service.getSeason1Leaderboard(input.channel_id)
      } else if (input.season === 'season2') {
        entries = await service.getSeason2Leaderboard(input.channel_id)
      } else if (input.season === 'season3') {
        entries = await service.getSeason3Leaderboard(input.channel_id)
      } else if (input.season === 'season4') {
        entries = await service.getSeason4Leaderboard(input.channel_id)
      } else if (input.season === 'season5') {
        entries = await service.getSeason5Leaderboard(input.channel_id)
      } else if (input.season === 'season6') {
        entries = await service.getSeason6Leaderboard(input.channel_id)
      } else {
        const result = await service.getLeaderboard(input.channel_id)
        entries = result.data
      }

      // Return just the MMR values for the distribution chart
      return entries.map((e) => e.mmr)
    }),
  get_user_rank: publicProcedure
    .input(
      z.object({
        channel_id: z.string(),
        user_id: z.string(),
        season: SeasonSchema.optional().default('season6'),
      })
    )
    .query(async ({ input }) => {
      if (input.season === 'season1') {
        // For Season 2, use the snapshot data
        const userData = await service.getSeason1UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }
      if (input.season === 'season2') {
        // For Season 2, use the snapshot data
        const userData = await service.getSeason2UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }
      if (input.season === 'season3') {
        // For Season 3, use the DB snapshot data
        const userData = await service.getSeason3UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }
      if (input.season === 'season4') {
        const userData = await service.getSeason4UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }
      if (input.season === 'season5') {
        const userData = await service.getSeason5UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }
      if (input.season === 'season6') {
        const userData = await service.getSeason6UserRank(
          input.channel_id,
          input.user_id
        )
        if (!userData) return null
        return {
          data: userData,
          isStale: false,
        }
      }

      const result = await service.getUserRank(input.channel_id, input.user_id)
      if (!result) return null
      return {
        data: result.data,
        isStale: result.isStale,
      }
    }),
})
