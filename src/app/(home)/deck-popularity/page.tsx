import { DeckPopularityChart } from './_components/deck-popularity-chart'
import { HydrateClient, api } from '@/trpc/server'
import { Suspense } from 'react'

export default async function DeckPopularityPage() {
  await api.stats.deck_popularity.prefetch({
    season: 'season5',
  })

  return (
    <div className='container mx-auto py-8'>
      <h1 className='mb-6 text-3xl font-bold'>Deck Popularity</h1>
      <Suspense>
        <HydrateClient>
          <DeckPopularityChart />
        </HydrateClient>
      </Suspense>
    </div>
  )
}
