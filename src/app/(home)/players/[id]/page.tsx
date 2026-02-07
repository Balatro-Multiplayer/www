import {
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'
import { UserInfo } from './user'

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    page?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const { id } = await params
  const sp = await searchParams

  const page = sp.page ? Number.parseInt(sp.page, 10) : 1
  const sortByVals = [
    'gameTime',
    'opponentName',
    'gameType',
    'deck',
    'stake',
    'opponentMmr',
    'playerMmr',
    'mmrChange',
  ] as const
  type SortBy = (typeof sortByVals)[number]
  const sortBySet: ReadonlySet<string> = new Set(sortByVals)
  const sortBy = sortBySet.has(sp.sortBy ?? '')
    ? (sp.sortBy as SortBy)
    : 'gameTime'
  const sortOrder = sp.sortOrder === 'asc' ? 'asc' : 'desc'

  if (id) {
    await Promise.all([
      api.history.user_games.prefetch({ user_id: id }),
      api.history.user_games_page.prefetch({
        user_id: id,
        season: 'season5',
        page: Number.isFinite(page) && page >= 1 ? page : 1,
        pageSize: 50,
        sortBy,
        sortOrder,
      }),
      api.discord.get_user_by_id.prefetch({
        user_id: id,
      }),
      api.leaderboard.get_leaderboard.prefetch({
        channel_id: RANKED_QUEUE_ID,
      }),
      api.leaderboard.get_leaderboard.prefetch({
        channel_id: SMALLWORLD_QUEUE_ID,
      }),
      api.leaderboard.get_leaderboard.prefetch({
        channel_id: VANILLA_QUEUE_ID,
      }),
      api.leaderboard.get_user_rank.prefetch({
        channel_id: RANKED_QUEUE_ID,
        user_id: id,
      }),
      api.leaderboard.get_user_rank.prefetch({
        channel_id: SMALLWORLD_QUEUE_ID,
        user_id: id,
      }),
      api.leaderboard.get_user_rank.prefetch({
        channel_id: VANILLA_QUEUE_ID,
        user_id: id,
      }),
    ])
  }
  return (
    <Suspense>
      <HydrateClient>
        <UserInfo />
      </HydrateClient>
    </Suspense>
  )
}
