'use client'

import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDebounceValue } from 'usehooks-ts'

import { PaginationControls } from '@/app/_components/pagination-controls'
import { SortableHeader } from '@/app/_components/sortable-header'
import { TableShell } from '@/app/_components/table-shell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/mobile-tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { getRankData } from '@/shared/ranks'
import {
  type Season,
  SeasonSchema,
  getSeasonDisplayName,
} from '@/shared/seasons'
import { type RouterOutputs, api } from '@/trpc/react'
import { ArrowDown, ArrowUp, Flame, Search, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'

type LeaderboardSortBy =
  | 'rank'
  | 'mmr'
  | 'wins'
  | 'losses'
  | 'winrate'
  | 'totalgames'
  | 'streak'
  | 'peak_mmr'
  | 'peak_streak'

const getMedal = (rank: number, mmr: number, queueType?: string) => {
  const rankData = getRankData(mmr, queueType)
  if (!rankData) {
    return null
  }

  const { enhancement, tooltip } = rankData

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className='flex shrink-0 items-center justify-center gap-1.5'>
            <img
              src={enhancement}
              alt={`Rank ${rank}`}
              className='h-5 text-white'
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type LeaderboardSeasonRow = RouterOutputs['seasons']['list'][number]
type LeaderboardSnapshotRow = RouterOutputs['seasons']['list_snapshots'][number]

type LeaderboardPageProps = {
  activeSeason: Season
  initialSeason: Season
  initialSeasons: RouterOutputs['seasons']['list']
  initialSnapshots: RouterOutputs['seasons']['list_snapshots']
}

function getSeasonId(season: Season): number {
  const match = /^season(\d+)$/.exec(season)
  return Number(match?.[1] ?? 0)
}

function getDefaultQueueType(snapshots: LeaderboardSnapshotRow[]): string {
  return snapshots[0]?.queueType ?? 'ranked'
}

function getQueueLabel(queueType: string): string {
  if (queueType === 'ranked') return 'Standard Ranked'
  if (queueType === 'smallworld') return 'Smallworld'
  if (queueType === 'vanilla') return 'Vanilla'
  if (queueType === 'legacy') return 'Legacy Ranked'

  return queueType
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function sortSeasons(seasons: LeaderboardSeasonRow[]) {
  return [...seasons].sort((a, b) => b.id - a.id)
}

export function LeaderboardPage({
  activeSeason,
  initialSeason,
  initialSeasons,
  initialSnapshots,
}: LeaderboardPageProps) {
  const [queryParams, setQueryParams] = useQueryStates(
    {
      type: parseAsString.withDefault(getDefaultQueueType(initialSnapshots)),
      season: parseAsString.withDefault(initialSeason),
      page: parseAsInteger.withDefault(1),
      search: parseAsString,
      minGames: parseAsInteger,
      maxGames: parseAsInteger,
      sortBy: parseAsString,
      sortOrder: parseAsString,
    },
    {
      history: 'push',
    }
  )

  const {
    type: rawType,
    season: rawSeason,
    page,
    search: searchQuery,
    minGames,
    maxGames,
    sortBy,
    sortOrder,
  } = queryParams

  const seasonsQuery = api.seasons.list.useQuery(undefined, {
    initialData: initialSeasons,
  })
  const seasons = useMemo(
    () => sortSeasons(seasonsQuery.data ?? initialSeasons),
    [initialSeasons, seasonsQuery.data]
  )
  const availableSeasons = useMemo(
    () => new Set(seasons.map((entry) => `season${entry.id}`)),
    [seasons]
  )

  const latestSeason = ((seasons[0] && `season${seasons[0].id}`) ||
    activeSeason) as Season
  const season = useMemo(() => {
    if (
      SeasonSchema.safeParse(rawSeason).success &&
      availableSeasons.has(rawSeason)
    ) {
      return rawSeason as Season
    }

    return availableSeasons.has(initialSeason) ? initialSeason : latestSeason
  }, [availableSeasons, initialSeason, latestSeason, rawSeason])
  const seasonId = getSeasonId(season)

  const snapshotsQuery = api.seasons.list_snapshots.useQuery(
    { seasonId },
    {
      enabled: seasonId > 0,
      initialData: season === initialSeason ? initialSnapshots : undefined,
    }
  )
  const snapshots = useMemo(() => {
    if (snapshotsQuery.data) return snapshotsQuery.data
    if (season === initialSeason) return initialSnapshots
    return []
  }, [initialSeason, initialSnapshots, season, snapshotsQuery.data])

  const [gamesAmount, setGamesAmount] = useState([
    minGames ?? 0,
    maxGames ?? 100,
  ])

  const leaderboardType = useMemo(() => {
    if (snapshots.some((snapshot) => snapshot.queueType === rawType)) {
      return rawType
    }

    return getDefaultQueueType(snapshots)
  }, [rawType, snapshots])

  const selectedSnapshot = useMemo(
    () =>
      snapshots.find((snapshot) => snapshot.queueType === leaderboardType) ??
      snapshots[0],
    [leaderboardType, snapshots]
  )

  // Derive sort column and direction from query params with defaults
  const sortColumn = sortBy || 'mmr'
  const sortDirection = (sortOrder as 'asc' | 'desc') || 'desc'

  // Track previous season to only reset sort when season actually changes
  const prevSeasonRef = useRef(season)

  useEffect(() => {
    const seasonChanged = prevSeasonRef.current !== season
    prevSeasonRef.current = season

    // Only reset sort if season actually changed AND user hasn't explicitly set a sort
    if (seasonChanged && !sortBy) {
      setQueryParams({ sortBy: 'mmr', sortOrder: 'desc' })
    }
  }, [season, sortBy, setQueryParams])

  useEffect(() => {
    if (rawSeason === season && rawType === leaderboardType) {
      return
    }

    setQueryParams({
      season,
      type: leaderboardType,
      page: 1,
    })
  }, [leaderboardType, rawSeason, rawType, season, setQueryParams])

  const currentLeaderboardQuery = api.leaderboard.get_leaderboard.useQuery(
    {
      channel_id: selectedSnapshot?.queueId ?? '',
      season,
      page,
      pageSize: 50,
      search: searchQuery || undefined,
      minGames: minGames ?? undefined,
      maxGames: maxGames ?? undefined,
      sortBy: sortColumn as LeaderboardSortBy,
      sortOrder: sortDirection,
    },
    {
      enabled: Boolean(selectedSnapshot?.queueId),
    }
  )

  const currentLeaderboardResult = currentLeaderboardQuery.data
  const currentLeaderboard = currentLeaderboardResult?.data ?? []

  // Calculate max games for slider
  const maxGamesAmount = useMemo(
    () => Math.max(...currentLeaderboard.map((entry) => entry.totalgames), 100),
    [currentLeaderboard]
  )

  const currentMaxGames = gamesAmount[1] ?? 0

  // Update max games when it changes
  useEffect(() => {
    if (maxGamesAmount > currentMaxGames) {
      setGamesAmount([0, maxGamesAmount])
      setSliderValue([0, maxGamesAmount])
    }
  }, [currentMaxGames, maxGamesAmount])

  // Handle tab change
  const handleTabChange = (value: string) => {
    setQueryParams({ type: value, page: 1 })
  }

  // Handle season change
  const handleSeasonChange = (value: Season) => {
    setQueryParams({ season: value, page: 1 })
  }

  // Handle search change with debounce
  const [searchInput, setSearchInput] = useState(searchQuery || '')
  const [debouncedSearch] = useDebounceValue(searchInput, 500)

  // Sync local state with query param when it changes externally
  useEffect(() => {
    setSearchInput(searchQuery || '')
  }, [searchQuery])

  useEffect(() => {
    setQueryParams({ search: debouncedSearch || null, page: 1 })
  }, [debouncedSearch, setQueryParams])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  // Handle games filter change
  const [sliderValue, setSliderValue] = useState([0, 100])
  const handleGamesAmountSliderChange = (value: number[]) => {
    setSliderValue(value)
  }
  const handleGamesAmountSliderCommit = (value: number[]) => {
    setGamesAmount(value)
    setQueryParams({
      minGames: (value[0] ?? 0) > 0 ? value[0] : null,
      maxGames: value[1] !== maxGamesAmount ? value[1] : null,
      page: 1,
    })
  }

  // Handle column sort
  const handleSort = useCallback(
    (column: string) => {
      const allowed: LeaderboardSortBy[] = [
        'rank',
        'mmr',
        'wins',
        'losses',
        'winrate',
        'totalgames',
        'streak',
        'peak_mmr',
        'peak_streak',
      ]
      if (!allowed.includes(column as LeaderboardSortBy)) return

      const nextOrder =
        sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc'
      setQueryParams({ sortBy: column, sortOrder: nextOrder, page: 1 })
    },
    [setQueryParams, sortColumn, sortDirection]
  )

  // Handle page change
  const handlePageChange = useCallback(
    (newPage: number) => {
      setQueryParams({ page: newPage })
    },
    [setQueryParams]
  )

  return (
    <div className='flex flex-1 flex-col overflow-hidden'>
      <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-1 flex-col'>
        <div className='flex flex-1 flex-col overflow-hidden border-none'>
          {currentLeaderboardResult?.isStale && (
            <Alert className='my-4 border-amber-500 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'>
              <AlertTitle>Stale Data</AlertTitle>
              <AlertDescription>
                The leaderboard data is currently stale due to issues with the
                botlatro service. We're showing you the latest available data.
                Please check back later.
              </AlertDescription>
            </Alert>
          )}
          <Tabs
            defaultValue={leaderboardType}
            value={leaderboardType}
            onValueChange={handleTabChange}
            className='flex flex-1 flex-col px-0 py-4 md:py-6'
          >
            <div className='mb-6 flex w-full flex-col items-start justify-between gap-4 md:items-center lg:flex-row'>
              <div className='flex flex-col gap-4 md:flex-row md:items-center'>
                <TabsList className='border border-gray-200 border-b bg-gray-50 dark:border-zinc-800 dark:bg-zinc-800/50'>
                  {snapshots.map((snapshot) => (
                    <TabsTrigger
                      key={snapshot.queueType}
                      value={snapshot.queueType}
                    >
                      {getQueueLabel(snapshot.queueType)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className='flex items-center gap-2'>
                  <Label htmlFor='season-select' className='text-sm'>
                    Season:
                  </Label>
                  <Select
                    value={season}
                    onValueChange={(value) =>
                      handleSeasonChange(value as Season)
                    }
                  >
                    <SelectTrigger id='season-select' className='w-[180px]'>
                      <SelectValue placeholder='Select season' />
                    </SelectTrigger>
                    <SelectContent>
                      {seasons.map((seasonOption) => {
                        const value = `season${seasonOption.id}` as Season
                        return (
                          <SelectItem key={value} value={value}>
                            {getSeasonDisplayName(value)}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                className={
                  'flex w-full flex-col items-center justify-end gap-2 lg:w-fit lg:flex-row lg:gap-4'
                }
              >
                <div className={'flex w-full flex-col gap-1 md:w-[300px]'}>
                  <Label>Games</Label>
                  <div className='flex w-full items-center gap-2'>
                    <span>{gamesAmount[0]}</span>
                    <Slider
                      value={sliderValue}
                      onValueCommit={handleGamesAmountSliderCommit}
                      max={maxGamesAmount}
                      onValueChange={handleGamesAmountSliderChange}
                      step={1}
                      className={cn('w-full')}
                    />
                    <span>{gamesAmount[1]}</span>
                  </div>
                </div>
                <div className={'flex w-full flex-col gap-1 md:w-[250px]'}>
                  <Label>Search players</Label>
                  <div className='relative w-full sm:w-auto'>
                    <Search className='absolute top-2.5 left-2.5 h-4 w-4 text-gray-400 dark:text-zinc-400' />
                    <Input
                      placeholder='Search players...'
                      className='w-full border-gray-200 bg-white pl-9 dark:border-zinc-700 dark:bg-zinc-900'
                      value={searchInput}
                      onChange={(e) => handleSearchChange(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className='m-0 flex flex-1 flex-col'>
              <TableShell className='flex flex-1 flex-col overflow-hidden'>
                {!selectedSnapshot ? (
                  <div className='flex min-h-[240px] items-center justify-center px-6 text-center text-fd-muted-foreground'>
                    No queues configured for this season yet.
                  </div>
                ) : currentLeaderboardQuery.isLoading ? (
                  <div className='flex min-h-[240px] items-center justify-center px-6 text-center text-fd-muted-foreground'>
                    Loading leaderboard...
                  </div>
                ) : (
                  <>
                    <div className='overflow-x-auto'>
                      <LeaderboardTable
                        leaderboard={currentLeaderboard}
                        queueType={leaderboardType}
                        sortColumn={sortColumn as LeaderboardSortBy}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        getMedal={getMedal}
                      />
                    </div>
                    <PaginationControls
                      currentPage={page}
                      totalPages={currentLeaderboardResult?.totalPages ?? 1}
                      total={currentLeaderboardResult?.total ?? 0}
                      pageSize={50}
                      itemLabel='players'
                      onPageChange={handlePageChange}
                      className='rounded-none border-0 border-t bg-background'
                    />
                  </>
                )}
              </TableShell>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

interface LeaderboardTableProps {
  leaderboard: LeaderboardRow[]
  sortColumn: LeaderboardSortBy
  queueType: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
  getMedal: (rank: number, mmr: number, queueType?: string) => React.ReactNode
}

type LeaderboardRow = {
  id: string
  rank: number
  name: string
  mmr: number
  peak_mmr: number
  winrate: number
  wins: number
  losses: number
  totalgames: number
  streak: number
  peak_streak: number
}

function RawLeaderboardTable({
  leaderboard,
  queueType,
  sortColumn,
  sortDirection,
  onSort,
  getMedal,
}: LeaderboardTableProps) {
  return (
    <Table>
      <TableHeader className='sticky top-0 z-10 bg-background'>
        <TableRow className='bg-muted/50'>
          <TableHead className='w-[40px] text-right'>#</TableHead>
          <TableHead className='w-[80px]'>
            <SortableHeader
              className='w-full justify-end'
              column='rank'
              label='Rank'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead>
            <SortableHeader
              column='name'
              label='Player'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='mmr'
              label='MMR'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right' align={'right'}>
            <SortableHeader
              className='w-full justify-end'
              column='peak_mmr'
              label='Peak MMR'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='winrate'
              label='Win Rate'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='wins'
              label='Wins'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='losses'
              label='Losses'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='totalgames'
              label='Games'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='streak'
              label='Streak'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
          <TableHead className='text-right'>
            <SortableHeader
              className='w-full justify-end'
              column='peak_streak'
              label='Peak Streak'
              sortBy={sortColumn}
              sortOrder={sortDirection}
              onSort={onSort}
            />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {leaderboard.length > 0 ? (
          leaderboard.map((entry, index) => {
            const winrate = entry.winrate * 100
            return (
              <TableRow key={entry.id}>
                <TableCell className='w-10 text-right font-medium'>
                  {index + 1}
                </TableCell>
                <TableCell className='w-28 font-medium'>
                  <div className='flex items-center justify-end gap-1.5 pr-4.5 font-mono'>
                    <span className={cn(entry.rank < 10 && 'ml-[1ch]')}>
                      {entry.rank}
                    </span>
                    {getMedal(entry.rank, entry.mmr, queueType)}
                  </div>
                </TableCell>
                <TableCell>
                  <Link
                    prefetch={false}
                    href={`/players/${entry.id}`}
                    className='group flex items-center gap-2'
                  >
                    <span className='font-medium group-hover:underline'>
                      {entry.name}
                    </span>
                    {entry.streak >= 3 && (
                      <Badge className='bg-orange-500 text-white hover:no-underline'>
                        <Flame className='h-3 w-3' />
                      </Badge>
                    )}
                  </Link>
                </TableCell>
                <TableCell className='pr-7 text-right font-medium font-mono'>
                  {Math.round(entry.mmr)}
                </TableCell>
                <TableCell className='text-right font-mono'>
                  <div className='flex items-center justify-end gap-1'>
                    {Math.round(entry.peak_mmr)}
                    <TrendingUp className='h-3.5 w-3.5 text-violet-400' />
                  </div>
                </TableCell>
                <TableCell className='text-right'>
                  <Badge
                    variant='outline'
                    className={cn(
                      'font-normal ',
                      winrate > 60
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : winrate < 40
                          ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                    )}
                  >
                    {Math.round(winrate)}%
                  </Badge>
                </TableCell>
                <TableCell className='text-right text-emerald-600 dark:text-emerald-400'>
                  {entry.wins}
                </TableCell>
                <TableCell className='text-right text-rose-600 dark:text-rose-400'>
                  {entry.losses}
                </TableCell>
                <TableCell className='text-right font-mono text-slate-600 dark:text-slate-400'>
                  {entry.totalgames}
                </TableCell>
                <TableCell className='text-right font-mono'>
                  {entry.streak > 0 ? (
                    <span className='flex items-center justify-end text-emerald-600 dark:text-emerald-400'>
                      <ArrowUp className='mr-1 h-3.5 w-3.5' />
                      {entry.streak}
                    </span>
                  ) : entry.streak < 0 ? (
                    <span className='flex items-center justify-end font-mono text-rose-600 dark:text-rose-400'>
                      <ArrowDown className='mr-1 h-3.5 w-3.5' />
                      <span className={'w-[2ch]'}>
                        {Math.abs(entry.streak)}
                      </span>
                    </span>
                  ) : (
                    <span>0</span>
                  )}
                </TableCell>
                <TableCell className='text-right'>
                  <span className='flex items-center justify-end font-mono'>
                    {entry.peak_streak}
                  </span>
                </TableCell>
              </TableRow>
            )
          })
        ) : (
          <TableRow>
            <TableCell colSpan={11} className='h-24 text-center'>
              <p className='text-gray-500 dark:text-zinc-400'>
                No players found
              </p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

export const LeaderboardTable = memo(RawLeaderboardTable)
LeaderboardTable.displayName = 'LeaderboardTable'
