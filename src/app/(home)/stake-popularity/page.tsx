import { StakePopularityChart } from './_components/stake-popularity-chart'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'

export default async function StakePopularityPage() {
  await api.stats.stake_popularity.prefetch({
    season: 'season5',
  })

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Stake Popularity</h1>
      <Suspense>
        <HydrateClient>
          <StakePopularityChart />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
