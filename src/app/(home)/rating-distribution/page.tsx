import { RatingDistributionChart } from './_components/rating-distribution-chart'
import { RANKED_QUEUE_ID } from '@/shared/constants'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'

export default async function RatingDistributionPage() {
  await api.leaderboard.rating_distribution.prefetch({
    channel_id: RANKED_QUEUE_ID,
    season: 'season5',
  })

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Rating Distribution</h1>
      <Suspense>
        <HydrateClient>
          <RatingDistributionChart />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
