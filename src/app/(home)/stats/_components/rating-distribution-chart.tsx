'use client'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  OLD_RANKED_CHANNEL,
  OLD_SMALLWORLD_CHANNEL,
  OLD_VANILLA_CHANNEL,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import { type Season, getSeasonDisplayName } from '@/shared/seasons'
import { api } from '@/trpc/react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

const chartConfig = {
  count: {
    label: 'Players',
    color: 'var(--color-violet-500)',
  },
} satisfies ChartConfig

const SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5']
const QUEUE_TYPES = [
  { value: 'ranked', label: 'Ranked' },
  { value: 'vanilla', label: 'Vanilla' },
  { value: 'smallworld', label: 'Small World' },
] as const

function getChannelId(type: string, season: Season): string {
  const isOldSeason = season === 'season1' || season === 'season2' || season === 'season3'
  if (type === 'smallworld') {
    return isOldSeason ? OLD_SMALLWORLD_CHANNEL : SMALLWORLD_QUEUE_ID
  }
  if (type === 'vanilla') {
    return isOldSeason ? OLD_VANILLA_CHANNEL : VANILLA_QUEUE_ID
  }
  return isOldSeason ? OLD_RANKED_CHANNEL : RANKED_QUEUE_ID
}

function computeBellCurve(mmrValues: number[], binSize = 50) {
  if (mmrValues.length === 0) return []

  const min = Math.floor(Math.min(...mmrValues) / binSize) * binSize
  const max = Math.ceil(Math.max(...mmrValues) / binSize) * binSize

  const bins: Record<number, number> = {}
  for (let b = min; b <= max; b += binSize) {
    bins[b] = 0
  }

  for (const mmr of mmrValues) {
    const bin = Math.floor(mmr / binSize) * binSize
    bins[bin] = (bins[bin] ?? 0) + 1
  }

  return Object.entries(bins)
    .map(([rating, count]) => ({
      rating: Number(rating),
      count,
    }))
    .sort((a, b) => a.rating - b.rating)
}

export function RatingDistributionChart() {
  const [season, setSeason] = useState<Season>('season5')
  const [queueType, setQueueType] = useState('ranked')

  const channelId = getChannelId(queueType, season)

  const [mmrValues] = api.leaderboard.rating_distribution.useSuspenseQuery({
    channel_id: channelId,
    season,
  })

  const chartData = computeBellCurve(mmrValues)
  const totalPlayers = mmrValues.length
  const avgMmr = totalPlayers > 0 ? Math.round(mmrValues.reduce((a, b) => a + b, 0) / totalPlayers) : 0
  const medianMmr = totalPlayers > 0 ? Math.round([...mmrValues].sort((a, b) => a - b)[Math.floor(totalPlayers / 2)]!) : 0

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Rating Distribution</CardTitle>
          <CardDescription>
            {totalPlayers.toLocaleString()} players &middot; Avg: {avgMmr} &middot; Median: {medianMmr}
          </CardDescription>
        </div>
        <div className='flex gap-2'>
          <Select value={season} onValueChange={(v) => setSeason(v as Season)}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder='Select season' />
            </SelectTrigger>
            <SelectContent>
              {SEASONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {getSeasonDisplayName(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={queueType} onValueChange={setQueueType}>
            <SelectTrigger className='w-[160px]'>
              <SelectValue placeholder='Select queue' />
            </SelectTrigger>
            <SelectContent>
              {QUEUE_TYPES.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className='h-[500px] w-full p-2'>
        {chartData.length === 0 ? (
          <div className='flex h-full items-center justify-center text-fd-muted-foreground'>
            No data available for this season and queue type.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className='h-full w-full'>
            <AreaChart
              data={chartData}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 60,
              }}
            >
              <defs>
                <linearGradient id='fillCount' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='var(--color-count)' stopOpacity={0.8} />
                  <stop offset='95%' stopColor='var(--color-count)' stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis
                dataKey='rating'
                angle={-45}
                textAnchor='end'
                height={60}
                tickFormatter={(value) => `${value}`}
              />
              <YAxis />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${value} players`}
                    labelFormatter={(_label, payload) => {
                      const rating = payload?.[0]?.payload?.rating
                      return `Rating: ${rating} - ${Number(rating) + 50}`
                    }}
                  />
                }
              />
              <Area
                type='monotone'
                dataKey='count'
                stroke='var(--color-count)'
                fill='url(#fillCount)'
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
