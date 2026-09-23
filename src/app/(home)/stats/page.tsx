import { createLoader } from 'nuqs/server'
import { Suspense } from 'react'
import { getActiveSeasonNumber, getSeasonKey } from '@/server/seasons'
import type { Season } from '@/shared/seasons'
import { api, HydrateClient } from '@/trpc/server'
import { createMetadata } from '../../../../lib/metadata'
import { StatsTabs } from './_components/stats-tabs'
import { getStatsSeasons, resolveStatsSeason } from './search-params.constants'
import { createStatsSearchParamsParsersServer } from './search-params.server'

export const metadata = createMetadata({
  title: 'Stats',
  description:
    'Explore Balatro Multiplayer charts for game activity, deck popularity, stake trends, and rating distribution.',
  path: '/stats',
})

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [seasonRows, activeSeasonNumber] = await Promise.all([
    api.seasons.list(),
    getActiveSeasonNumber(),
  ])
  const statsSeasons = getStatsSeasons(seasonRows)
  const activeSeason = getSeasonKey(activeSeasonNumber)
  const defaultSeason =
    (statsSeasons.includes(activeSeason) ? activeSeason : statsSeasons[0]) ??
    ('season1' as Season)
  const loadSearchParams = createLoader(
    createStatsSearchParamsParsersServer(defaultSeason)
  )
  const params = await loadSearchParams(searchParams)

  // Only the visible tab's data is prefetched, and it is not awaited: the
  // pending query is streamed to the client so the page shell renders right
  // away instead of blocking on every chart's data.
  switch (params.tab) {
    case 'rating-distribution': {
      const defaultSeasonId = Number(defaultSeason.replace('season', ''))
      // Snapshots are cheap (Redis) and needed to pick the ranked queue id,
      // so this one is awaited; the leaderboard itself streams.
      const snapshots = await api.seasons.list_snapshots({
        seasonId: defaultSeasonId,
      })
      void api.seasons.list_snapshots.prefetch({ seasonId: defaultSeasonId })
      const rankedSnapshot =
        snapshots.find((snapshot) => snapshot.queueType === 'ranked') ??
        snapshots[0]
      if (rankedSnapshot) {
        void api.leaderboard.rating_distribution.prefetch({
          channel_id: rankedSnapshot.queueId,
          season: defaultSeason,
        })
      }
      break
    }
    case 'deck-popularity': {
      const deckSeason = resolveStatsSeason(
        params.deckSeason,
        statsSeasons,
        defaultSeason
      )
      void api.stats.deck_popularity.prefetch({
        mode: params.deckMode,
        season: params.deckMode === 'season' ? deckSeason : undefined,
        startDate:
          params.deckMode === 'dateRange'
            ? (params.deckStartDate ?? undefined)
            : undefined,
        endDate:
          params.deckMode === 'dateRange'
            ? (params.deckEndDate ?? undefined)
            : undefined,
        queueId: params.deckQueueId === 'all' ? undefined : params.deckQueueId,
      })
      break
    }
    case 'stake-popularity': {
      const stakeSeason = resolveStatsSeason(
        params.stakeSeason,
        statsSeasons,
        defaultSeason
      )
      void api.stats.stake_popularity.prefetch({
        mode: params.stakeMode,
        season: params.stakeMode === 'season' ? stakeSeason : undefined,
        startDate:
          params.stakeMode === 'dateRange'
            ? (params.stakeStartDate ?? undefined)
            : undefined,
        endDate:
          params.stakeMode === 'dateRange'
            ? (params.stakeEndDate ?? undefined)
            : undefined,
        queueId:
          params.stakeQueueId === 'all' ? undefined : params.stakeQueueId,
      })
      break
    }
    case 'season-overview':
      void api.stats.season_overview.prefetch()
      break
    case 'game-activity':
      // Must match the chart's initial client state or the prefetch is wasted.
      void api.history.games_per_hour.prefetch({ groupBy: 'week' })
      break
    default:
      break
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-1 flex-col py-8'>
      <h1 className='mb-6 font-bold text-3xl'>Stats</h1>
      <Suspense>
        <HydrateClient>
          <StatsTabs
            defaultSeason={defaultSeason}
            statsSeasons={statsSeasons}
          />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
