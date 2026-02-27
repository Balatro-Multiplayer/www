import { RANKED_QUEUE_ID } from '@/shared/constants'
import { HydrateClient, api } from '@/trpc/server'
import { createLoader } from 'nuqs/server'
import { Suspense } from 'react'
import { StatsTabs } from './_components/stats-tabs'
import { statsSearchParamsParsersServer } from './search-params.server'

const loadSearchParams = createLoader(statsSearchParamsParsersServer)

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await loadSearchParams(searchParams)

  const deckPrefetchInput = {
    mode: params.deckMode,
    season: params.deckMode === 'season' ? params.deckSeason : undefined,
    startDate:
      params.deckMode === 'dateRange'
        ? (params.deckStartDate ?? undefined)
        : undefined,
    endDate:
      params.deckMode === 'dateRange'
        ? (params.deckEndDate ?? undefined)
        : undefined,
    queueId: params.deckQueueId === 'all' ? undefined : params.deckQueueId,
  } as const

  const stakePrefetchInput = {
    mode: params.stakeMode,
    season: params.stakeMode === 'season' ? params.stakeSeason : undefined,
    startDate:
      params.stakeMode === 'dateRange'
        ? (params.stakeStartDate ?? undefined)
        : undefined,
    endDate:
      params.stakeMode === 'dateRange'
        ? (params.stakeEndDate ?? undefined)
        : undefined,
    queueId: params.stakeQueueId === 'all' ? undefined : params.stakeQueueId,
  } as const

  await Promise.all([
    api.history.games_per_hour.prefetch({ groupBy: 'hour' }),
    api.leaderboard.rating_distribution.prefetch({
      channel_id: RANKED_QUEUE_ID,
      season: 'season5',
    }),
    api.stats.deck_popularity.prefetch(deckPrefetchInput),
    api.stats.stake_popularity.prefetch(stakePrefetchInput),
    api.stats.season_overview.prefetch(),
  ])

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 font-bold text-3xl'>Stats</h1>
      <Suspense>
        <HydrateClient>
          <StatsTabs />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
