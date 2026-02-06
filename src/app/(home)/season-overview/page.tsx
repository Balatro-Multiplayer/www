import { SeasonOverviewChart } from './_components/season-overview-chart'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'

export default async function SeasonOverviewPage() {
  await api.stats.season_overview.prefetch()

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Season Overview</h1>
      <Suspense>
        <HydrateClient>
          <SeasonOverviewChart />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
