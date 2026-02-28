'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Season } from '@/shared/seasons'
import { useQueryState } from 'nuqs'
import { useMemo } from 'react'
import { Suspense } from 'react'
import { STAT_TABS, createStatsSearchParamsParsers } from '../search-params'
import { DeckPopularityChart } from './deck-popularity-chart'
import { GameActivityChart } from './game-activity-chart'
import { RatingDistributionChart } from './rating-distribution-chart'
import { SeasonOverviewChart } from './season-overview-chart'
import { StakePopularityChart } from './stake-popularity-chart'

const TABS = STAT_TABS.map((value) => ({
  value,
  label:
    value === 'rating-distribution'
      ? 'Rating Distribution'
      : value === 'deck-popularity'
        ? 'Deck Popularity'
        : value === 'stake-popularity'
          ? 'Stake Popularity'
          : value === 'season-overview'
            ? 'Season Overview'
            : 'Game Activity',
}))

type StatsTabsProps = {
  defaultSeason: Season
  statsSeasons: Season[]
}

export function StatsTabs({ defaultSeason, statsSeasons }: StatsTabsProps) {
  const parsers = useMemo(
    () => createStatsSearchParamsParsers(defaultSeason),
    [defaultSeason]
  )
  const [tab, setTab] = useQueryState('tab', parsers.tab)

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as (typeof STAT_TABS)[number])}
    >
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
          <RatingDistributionChart
            defaultSeason={defaultSeason}
            statsSeasons={statsSeasons}
          />
        </Suspense>
      </TabsContent>
      <TabsContent value='deck-popularity'>
        <Suspense>
          <DeckPopularityChart
            defaultSeason={defaultSeason}
            statsSeasons={statsSeasons}
          />
        </Suspense>
      </TabsContent>
      <TabsContent value='stake-popularity'>
        <Suspense>
          <StakePopularityChart
            defaultSeason={defaultSeason}
            statsSeasons={statsSeasons}
          />
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
