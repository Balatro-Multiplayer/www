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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DECK_IMAGES } from '@/app/(home)/players/[id]/_components/deck-stake-stats-chart'
import {
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
  CASUAL_QUEUE_ID,
} from '@/shared/constants'
import { type Season, getSeasonDisplayName } from '@/shared/seasons'
import { api } from '@/trpc/react'
import { BarChart3, PieChartIcon } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, Sector, XAxis, YAxis } from 'recharts'

const PIE_COLORS = [
  'var(--color-violet-500)',
  'var(--color-blue-500)',
  'var(--color-emerald-500)',
  'var(--color-amber-500)',
  'var(--color-rose-500)',
  'var(--color-cyan-500)',
  'var(--color-pink-500)',
  'var(--color-teal-500)',
  'var(--color-orange-500)',
  'var(--color-indigo-500)',
  'var(--color-lime-500)',
  'var(--color-fuchsia-500)',
  'var(--color-sky-500)',
  'var(--color-red-500)',
  'var(--color-green-500)',
  'var(--color-yellow-500)',
]

const chartConfig = {
  games: {
    label: 'Games',
    color: 'var(--color-violet-500)',
  },
} satisfies ChartConfig

const SEASONS: Season[] = ['season1', 'season2', 'season3', 'season4', 'season5']
const QUEUE_TYPES = [
  { value: 'all', label: 'All Queues' },
  { value: RANKED_QUEUE_ID, label: 'Standard Ranked' },
  { value: VANILLA_QUEUE_ID, label: 'Vanilla' },
  { value: SMALLWORLD_QUEUE_ID, label: 'Smallworld' },
  { value: CASUAL_QUEUE_ID, label: 'Casual' },
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderActiveShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 8}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  )
}

export function DeckPopularityChart() {
  const [chartType, setChartType] = useState<'bar' | 'pie'>('bar')
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined)
  const [season, setSeason] = useState<Season>('season5')
  const [queueId, setQueueId] = useState('all')

  const [data] = api.stats.deck_popularity.useSuspenseQuery({
    season,
    queueId: queueId === 'all' ? undefined : queueId,
  })

  const totalGames = data.reduce((sum, d) => sum + d.games, 0)
  const onPieEnter = useCallback((_: unknown, index: number) => setActiveIndex(index), [])
  const onPieLeave = useCallback(() => setActiveIndex(undefined), [])

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
          <ToggleGroup type='single' value={chartType} onValueChange={(v) => v && setChartType(v as 'bar' | 'pie')} variant='outline' size='sm'>
            <ToggleGroupItem value='bar' aria-label='Bar chart'>
              <BarChart3 className='h-4 w-4' />
            </ToggleGroupItem>
            <ToggleGroupItem value='pie' aria-label='Pie chart'>
              <PieChartIcon className='h-4 w-4' />
            </ToggleGroupItem>
          </ToggleGroup>
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
        ) : chartType === 'bar' ? (
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
        ) : (
          <div className='flex h-full gap-4'>
            <ChartContainer config={chartConfig} className='h-full flex-1'>
              <PieChart>
                <ChartTooltip
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
                <Pie
                  data={data}
                  dataKey='games'
                  nameKey='deck'
                  cx='50%'
                  cy='50%'
                  outerRadius='80%'
                  activeIndex={activeIndex}
                  activeShape={renderActiveShape}
                  onMouseEnter={onPieEnter}
                  onMouseLeave={onPieLeave}
                >
                  {data.map((entry, i) => (
                    <Cell
                      key={entry.deck}
                      fill={PIE_COLORS[i % PIE_COLORS.length]}
                      opacity={activeIndex !== undefined && activeIndex !== i ? 0.4 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className='flex w-40 flex-col gap-1 overflow-y-auto py-2 pr-2'>
              {data.map((entry, i) => (
                <div
                  key={entry.deck}
                  className='flex cursor-default items-center gap-2 rounded px-2 py-1 text-xs capitalize transition-colors hover:bg-fd-muted'
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(undefined)}
                  style={{ opacity: activeIndex !== undefined && activeIndex !== i ? 0.4 : 1 }}
                >
                  <span
                    className='inline-block h-3 w-3 shrink-0 rounded-sm'
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className='truncate'>{entry.deck}</span>
                  <span className='ml-auto text-fd-muted-foreground'>{entry.pickRate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
