import { LeaderboardPage } from '@/app/_components/leaderboard'
import {
  LEGACY_QUEUE_ID,
  OLD_RANKED_CHANNEL,
  OLD_SMALLWORLD_CHANNEL,
  OLD_VANILLA_CHANNEL,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { type Season, SeasonSchema } from '@/shared/seasons'
import { HydrateClient, api } from '@/trpc/server'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string
    season?: string
    page?: string
    search?: string
    minGames?: string
    maxGames?: string
    sortBy?: string
    sortOrder?: string
  }>
}) {
  const params = await searchParams

  const type = params.type ?? 'ranked'
  const rawSeason = params.season ?? 'season5'
  const season = SeasonSchema.safeParse(rawSeason).success
    ? (rawSeason as Season)
    : 'season5'
  const page = params.page ? Number.parseInt(params.page) : 1
  const search = params.search
  const minGames = params.minGames
    ? Number.parseInt(params.minGames)
    : undefined
  const maxGames = params.maxGames
    ? Number.parseInt(params.maxGames)
    : undefined
  const sortBy = params.sortBy
  const sortOrder = params.sortOrder as 'asc' | 'desc' | undefined

  const getChannelId = (type: string, season: Season) => {
    const isOldSeason = season === 'season1' || season === 'season2' || season === 'season3'
    if (type === 'smallworld') {
      return isOldSeason ? OLD_SMALLWORLD_CHANNEL : SMALLWORLD_QUEUE_ID
    }
    if (type === 'vanilla') {
      return isOldSeason ? OLD_VANILLA_CHANNEL : VANILLA_QUEUE_ID
    }
    if (type === 'legacy') {
      return LEGACY_QUEUE_ID
    }
    return isOldSeason ? OLD_RANKED_CHANNEL : RANKED_QUEUE_ID
  }

  const channelId = getChannelId(type, season)

  await api.leaderboard.get_leaderboard.prefetch({
    channel_id: channelId,
    season,
    page,
    pageSize: 50,
    search: search || undefined,
    minGames,
    maxGames,
    sortBy: sortBy as any,
    sortOrder,
  })

  return (
    <HydrateClient>
      <LeaderboardPage />
    </HydrateClient>
  )
}
