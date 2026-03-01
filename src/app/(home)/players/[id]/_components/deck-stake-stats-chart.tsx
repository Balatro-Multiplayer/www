'use client'
import Image from 'next/image'
import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from 'recharts'
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
import type { SelectGames } from '@/server/db/types'
import { getSeasonDisplayName, type Season } from '@/shared/seasons'

export const DECK_IMAGES: Record<string, string> = {
  red: '/decks/red.png',
  blue: '/decks/blue.png',
  yellow: '/decks/yellow.png',
  green: '/decks/green.png',
  black: '/decks/black.png',
  magic: '/decks/magic.png',
  nebula: '/decks/nebula.png',
  ghost: '/decks/ghost.png',
  abandoned: '/decks/abandoned.png',
  checkered: '/decks/checkered.png',
  zodiac: '/decks/zodiac.png',
  painted: '/decks/painted.png',
  anaglyph: '/decks/anaglyph.png',
  plasma: '/decks/plasma.png',
  erratic: '/decks/erratic.png',
  challenge: '/decks/challenge.png',
  heidelberg: '/decks/heidelberg.png',
  gradient: '/decks/gradient.png',
  white: '/decks/white.png',
  violet: '/decks/violet.png',
  sibyl: '/decks/sibyl.png',
  orange: '/decks/orange.png',
  oracle: '/decks/oracle.png',
  indigo: '/decks/indigo.png',
  cocktail: '/decks/cocktail.png',
  unknown: '/decks/unknown.png',
}

export const STAKE_IMAGES: Record<string, string> = {
  white: '/stakes/white_stake.png',
  red: '/stakes/red_stake.png',
  green: '/stakes/green_stake.png',
  blue: '/stakes/blue_stake.png',
  purple: '/stakes/purple_stake.png',
  orange: '/stakes/orange_stake.png',
  black: '/stakes/black_stake.png',
  gold: '/stakes/gold_stake.png',
  unknown: '/stakes/unknown.png',
}

export function DeckImage({
  deck,
  width = 24,
  height = 32,
  className = 'h-8 w-auto',
}: {
  deck: string | null | undefined
  width?: number
  height?: number
  className?: string
}) {
  const src = (deck ? DECK_IMAGES[deck] : null) ?? DECK_IMAGES.unknown ?? ''
  return (
    <Image
      src={src}
      alt={deck ?? 'unknown'}
      width={width}
      height={height}
      className={className}
    />
  )
}

export function StakeImage({
  stake,
  width = 32,
  height = 32,
  className = 'h-8 w-auto',
}: {
  stake: string | null | undefined
  width?: number
  height?: number
  className?: string
}) {
  const src = (stake ? STAKE_IMAGES[stake] : null) ?? STAKE_IMAGES.unknown ?? ''
  return (
    <Image
      src={src}
      alt={stake ?? 'unknown'}
      width={width}
      height={height}
      className={className}
    />
  )
}

const deckChartConfig = {
  count: {
    label: 'Games',
    color: 'var(--color-violet-500)',
  },
} satisfies ChartConfig

const stakeChartConfig = {
  count: {
    label: 'Games',
    color: 'var(--color-emerald-500)',
  },
} satisfies ChartConfig

export function DeckStakeStatsChart({
  games,
  season = 'season6',
}: {
  games: SelectGames[]
  season?: Season
}) {
  const deckData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const game of games) {
      const cleanDeck = game.deck
        ? game.deck.replace('Deck', '').trim().toLowerCase()
        : 'unknown'
      if (cleanDeck === 'unknown') continue
      counts[cleanDeck] = (counts[cleanDeck] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [games])

  const stakeData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const game of games) {
      const cleanStake = game.stake
        ? game.stake.replace('Stake', '').trim().toLowerCase()
        : 'unknown'
      if (cleanStake === 'unknown') continue
      counts[cleanStake] = (counts[cleanStake] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [games])

  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
      <Card>
        <CardHeader>
          <CardTitle>Decks Played</CardTitle>
          <CardDescription>{getSeasonDisplayName(season)}</CardDescription>
        </CardHeader>
        <CardContent className='p-2'>
          {deckData.length > 0 ? (
            <ChartContainer
              config={deckChartConfig}
              className='h-[350px] w-full'
            >
              <BarChart
                data={deckData}
                margin={{ top: 20, right: 20, left: 20, bottom: 60 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey='name'
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={(props) => {
                    const { x, y, payload } = props
                    const imagePath = DECK_IMAGES[payload.value]
                    const itemCount = deckData.length
                    const imgSize = Math.max(20, Math.min(40, 600 / itemCount))
                    return (
                      <g
                        transform={`translate(${Number(x) - imgSize / 2},${Number(y) + 10})`}
                      >
                        <title className='capitalize'>{payload.value}</title>
                        {imagePath && (
                          <image
                            href={imagePath}
                            width={imgSize}
                            height={imgSize}
                          />
                        )}
                        {itemCount <= 12 && (
                          <text
                            x={imgSize / 2}
                            y={imgSize + 20}
                            textAnchor='middle'
                            fill='currentColor'
                            fontSize='10'
                            className='font-medium capitalize'
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
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey='count' fill='var(--color-violet-500)' radius={4}>
                  <LabelList
                    dataKey='count'
                    position='top'
                    offset={8}
                    className='fill-foreground'
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <div className='flex h-[350px] w-full items-center justify-center text-muted-foreground'>
              No deck data available
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stakes Played</CardTitle>
          <CardDescription>{getSeasonDisplayName(season)}</CardDescription>
        </CardHeader>
        <CardContent className='p-2'>
          {stakeData.length > 0 ? (
            <ChartContainer
              config={stakeChartConfig}
              className='h-[350px] w-full'
            >
              <BarChart
                data={stakeData}
                margin={{ top: 20, right: 20, left: 20, bottom: 60 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey='name'
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={(props) => {
                    const { x, y, payload } = props
                    const imagePath = STAKE_IMAGES[payload.value]
                    const itemCount = stakeData.length
                    const imgSize = Math.max(20, Math.min(40, 600 / itemCount))
                    return (
                      <g
                        transform={`translate(${Number(x) - imgSize / 2},${Number(y) + 10})`}
                      >
                        <title className='capitalize'>{payload.value}</title>
                        {imagePath && (
                          <image
                            href={imagePath}
                            width={imgSize}
                            height={imgSize}
                          />
                        )}
                        {itemCount <= 12 && (
                          <text
                            x={imgSize / 2}
                            y={imgSize + 20}
                            textAnchor='middle'
                            fill='currentColor'
                            fontSize='10'
                            className='font-medium capitalize'
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
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey='count' fill='var(--color-emerald-500)' radius={4}>
                  <LabelList
                    dataKey='count'
                    position='top'
                    offset={8}
                    className='fill-foreground'
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <div className='flex h-[350px] w-full items-center justify-center text-muted-foreground'>
              No stake data available
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
