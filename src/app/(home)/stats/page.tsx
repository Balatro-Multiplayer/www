import { RANKED_QUEUE_ID } from '@/shared/constants'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'
import { StatsTabs } from './_components/stats-tabs'

export default async function StatsPage() {
  await Promise.all([
    api.history.games_per_hour.prefetch({ groupBy: 'hour' }),
    api.leaderboard.rating_distribution.prefetch({
      channel_id: RANKED_QUEUE_ID,
      season: 'season5',
    }),
    api.stats.deck_popularity.prefetch({ season: 'season5' }),
    api.stats.stake_popularity.prefetch({ season: 'season5' }),
    api.stats.season_overview.prefetch(),
  ])

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Stats</h1>
      <Suspense>
        <HydrateClient>
          <StatsTabs />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
