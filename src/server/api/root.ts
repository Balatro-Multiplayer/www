import { discord_router } from '@/server/api/routers/discord'
import { history_router } from '@/server/api/routers/history'
import { leaderboard_router } from '@/server/api/routers/leaderboard'
import { playerStateRouter } from '@/server/api/routers/player-state'
import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  history: history_router,
  discord: discord_router,
  leaderboard: leaderboard_router,
  playerState: playerStateRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter)
