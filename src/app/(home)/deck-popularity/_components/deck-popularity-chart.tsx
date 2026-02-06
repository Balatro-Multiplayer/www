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
import { DECK_IMAGES } from '@/app/(home)/players/[id]/_components/deck-stake-stats-chart'
import {
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
  CASUAL_QUEUE_ID,
} from '@/shared/constants'
import { type Season, getSeasonDisplayName } from '@/shared/seasons'
import { api } from '@/trpc/react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'

const chartConfig = {
  games: {
    label: 'Games',
    color: 'var(--color-violet-500)',
  },
} satisfies ChartConfig

const SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5']
const QUEUE_TYPES = [
  { value: 'all', label: 'All Queues' },
  { value: RANKED_QUEUE_ID, label: 'Ranked' },
  { value: VANILLA_QUEUE_ID, label: 'Vanilla' },
  { value: SMALLWORLD_QUEUE_ID, label: 'Small World' },
  { value: CASUAL_QUEUE_ID, label: 'Casual' },
] as const

export function DeckPopularityChart() {
  const [season, setSeason] = useState<Season>('season5')
  const [queueId, setQueueId] = useState('all')

  const [data] = api.stats.deck_popularity.useSuspenseQuery({
    season,
    queueId: queueId === 'all' ? undefined : queueId,
  })

  const totalGames = data.reduce((sum, d) => sum + d.games, 0)

  return (
    <Card className='w-full'>
      <CardHeader className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <CardTitle>Deck Popularity</CardTitle>
          <CardDescription>
            {totalGames.toLocaleString()} total games across {data.length} decks
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
          <Select value={queueId} onValueChange={setQueueId}>
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
        {data.length === 0 ? (
          <div className='flex h-full items-center justify-center text-fd-muted-foreground'>
            No data available for this season and queue type.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className='h-full w-full'>
            <BarChart
              data={data}
              margin={{ top: 30, right: 20, left: 20, bottom: 60 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey='deck'
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={(props) => {
                  const { x, y, payload } = props
                  const imagePath = DECK_IMAGES[payload.value]
                  const itemCount = data.length
                  const imgSize = Math.max(20, Math.min(40, 600 / itemCount))
                  return (
                    <g transform={`translate(${x - imgSize / 2},${y + 10})`}>
                      <title className='capitalize'>{payload.value}</title>
                      {imagePath && (
                        <image href={imagePath} width={imgSize} height={imgSize} />
                      )}
                      {itemCount <= 12 && (
                        <text
                          x={imgSize / 2}
                          y={imgSize + 20}
                          textAnchor='middle'
                          fill='currentColor'
                          fontSize='10'
                          className='capitalize font-medium'
                        >
                          {payload.value}
                        </text>
                      )}
                    </g>
                  )
                }}
              />
              <YAxis hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    formatter={(value, name, item) => {
                      const entry = item.payload
                      return `${entry.games.toLocaleString()} games · ${entry.pickRate}% pick rate`
                    }}
                    labelFormatter={(label) => label}
                  />
                }
              />
              <Bar dataKey='games' fill='var(--color-violet-500)' radius={4}>
                <LabelList
                  dataKey='pickRate'
                  position='top'
                  offset={8}
                  className='fill-foreground'
                  fontSize={10}
                  formatter={(v: number) => `${v}%`}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
