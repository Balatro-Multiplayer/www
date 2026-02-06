'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { parseAsString, useQueryState } from 'nuqs'
import { Suspense } from 'react'
import { DeckPopularityChart } from './deck-popularity-chart'
import { GameActivityChart } from './game-activity-chart'
import { RatingDistributionChart } from './rating-distribution-chart'
import { SeasonOverviewChart } from './season-overview-chart'
import { StakePopularityChart } from './stake-popularity-chart'

const TABS = [
  { value: 'rating-distribution', label: 'Rating Distribution' },
  { value: 'deck-popularity', label: 'Deck Popularity' },
  { value: 'stake-popularity', label: 'Stake Popularity' },
  { value: 'season-overview', label: 'Season Overview' },
  { value: 'game-activity', label: 'Game Activity' },
] as const

export function StatsTabs() {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('rating-distribution')
  )

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className='flex w-full flex-wrap'>
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value='game-activity'>
        <Suspense>
          <GameActivityChart />
        </Suspense>
      </TabsContent>
      <TabsContent value='rating-distribution'>
        <Suspense>
          <RatingDistributionChart />
        </Suspense>
      </TabsContent>
      <TabsContent value='deck-popularity'>
        <Suspense>
          <DeckPopularityChart />
        </Suspense>
      </TabsContent>
      <TabsContent value='stake-popularity'>
        <Suspense>
          <StakePopularityChart />
        </Suspense>
      </TabsContent>
      <TabsContent value='season-overview'>
        <Suspense>
          <SeasonOverviewChart />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
