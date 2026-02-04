'use client'

import type React from 'react'
import {
  type ComponentPropsWithoutRef,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useDebounceValue } from 'usehooks-ts'

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
import {
  OLD_RANKED_CHANNEL,
  OLD_SMALLWORLD_CHANNEL,
  OLD_VANILLA_CHANNEL,
  RANKED_QUEUE_ID,
  SMALLWORLD_QUEUE_ID,
  VANILLA_QUEUE_ID,
} from '@/shared/constants'
import {
  type Season,
  SeasonSchema,
  getSeasonDisplayName,
} from '@/shared/seasons'
import { api } from '@/trpc/react'
import { getRankData } from '@/shared/ranks'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Search,
  TrendingUp,
} from 'lucide-react'
import Link from 'next/link'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'

const getMedal = (
  rank: number,
  mmr: number,
  queueType?: string
) => {
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

export function LeaderboardPage() {
  const [queryParams, setQueryParams] = useQueryStates(
    {
      type: parseAsString.withDefault('ranked'),
      season: parseAsString.withDefault('season5'),
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
    type: leaderboardType,
    season: rawSeason,
    page,
    search: searchQuery,
    minGames,
    maxGames,
    sortBy,
    sortOrder,
  } = queryParams

  // Validate season
  const season = SeasonSchema.safeParse(rawSeason).success
    ? (rawSeason as Season)
    : 'season5'

  const [gamesAmount, setGamesAmount] = useState([
    minGames ?? 0,
    maxGames ?? 100,
  ])

  // Derive sort column and direction from query params with defaults
  const sortColumn =
    sortBy || (['season1', 'season2', 'season3', 'season4', 'season5'].includes(season) ? 'mmr' : 'rank')
  const sortDirection =
    (sortOrder as 'asc' | 'desc') ||
    (['season1', 'season2', 'season3', 'season4', 'season5'].includes(season) ? 'desc' : 'asc')

  // Track previous season to only reset sort when season actually changes
  const prevSeasonRef = useRef(season)

  useEffect(() => {
    const seasonChanged = prevSeasonRef.current !== season
    prevSeasonRef.current = season

    // Only reset sort if season actually changed AND user hasn't explicitly set a sort
    if (seasonChanged && !sortBy) {
      if (['season1', 'season2', 'season3', 'season4', 'season5'].includes(season)) {
        setQueryParams({ sortBy: 'mmr', sortOrder: 'desc' })
      } else {
        setQueryParams({ sortBy: 'rank', sortOrder: 'asc' })
      }
    }
  }, [season, sortBy, setQueryParams])

  // Determine channel ID based on leaderboard type and season
  const channelId = useMemo(() => {
    const isOldSeason = season === 'season1' || season === 'season2' || season === 'season3'
    if (leaderboardType === 'vanilla') {
      return isOldSeason ? OLD_VANILLA_CHANNEL : VANILLA_QUEUE_ID
    }
    if (leaderboardType === 'smallworld') {
      return isOldSeason ? OLD_SMALLWORLD_CHANNEL : SMALLWORLD_QUEUE_ID
    }
    return isOldSeason ? OLD_RANKED_CHANNEL : RANKED_QUEUE_ID
  }, [leaderboardType, season])

  // Fetch leaderboard data with pagination (use queue id if season 4, use old channel id otherwise)
  const [currentLeaderboardResult] =
    api.leaderboard.get_leaderboard.useSuspenseQuery({
      channel_id: channelId,
      season,
      page,
      pageSize: 50,
      search: searchQuery || undefined,
      minGames: minGames ?? undefined,
      maxGames: maxGames ?? undefined,
      sortBy: sortColumn as any,
      sortOrder: sortDirection,
    })

  const currentLeaderboard = currentLeaderboardResult.data

  // Calculate max games for slider
  const maxGamesAmount = useMemo(
    () => Math.max(...currentLeaderboard.map((entry) => entry.totalgames), 100),
    [currentLeaderboard]
  )

  // Update max games when it changes
  useEffect(() => {
    if (maxGamesAmount > gamesAmount[1]!) {
      setGamesAmount([0, maxGamesAmount])
      setSliderValue([0, maxGamesAmount])
    }
  }, [maxGamesAmount])

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
      // Read current sort values directly from queryParams to avoid stale closure
      const currentSortBy =
        queryParams.sortBy ||
        (['season1', 'season2', 'season3', 'season4'].includes(season) ? 'mmr' : 'rank')
      const currentSortOrder =
        (queryParams.sortOrder as 'asc' | 'desc') ||
        (['season1', 'season2', 'season3', 'season4'].includes(season) ? 'desc' : 'asc')
      const defaultColumn = ['season1', 'season2', 'season3', 'season4'].includes(season)
        ? 'mmr'
        : 'rank'
      const defaultDirection = ['season1', 'season2', 'season3', 'season4'].includes(season)
        ? 'desc'
        : 'asc'

      if (currentSortBy === column) {
        if (currentSortOrder === 'desc') {
          // First click was desc, now go to asc
          setQueryParams({ sortBy: column, sortOrder: 'asc', page: 1 })
        } else {
          // Second click was asc, now reset to default
          setQueryParams({
            sortBy: defaultColumn,
            sortOrder: defaultDirection,
            page: 1,
          })
        }
      } else {
        // New column, start with desc
        setQueryParams({ sortBy: column, sortOrder: 'desc', page: 1 })
      }
    },
    [queryParams.sortBy, queryParams.sortOrder, season, setQueryParams]
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
          {currentLeaderboardResult.isStale && (
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
                  <TabsTrigger value='ranked'>Ranked</TabsTrigger>
                  <TabsTrigger value='smallworld'>Smallworld</TabsTrigger>
                  <TabsTrigger value='vanilla'>Vanilla</TabsTrigger>
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
                      <SelectItem value='season5'>
                        {getSeasonDisplayName('season5')}
                      </SelectItem>
                      <SelectItem value='season4'>
                        {getSeasonDisplayName('season4')}
                      </SelectItem>
                      <SelectItem value='season3'>
                        {getSeasonDisplayName('season3')}
                      </SelectItem>
                      <SelectItem value='season2'>
                        {getSeasonDisplayName('season2')}
                      </SelectItem>
                      <SelectItem value='season1'>
                        {getSeasonDisplayName('season1')}
                      </SelectItem>
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
              <LeaderboardTable
                leaderboard={currentLeaderboard}
                queueType={leaderboardType}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onSort={handleSort}
                getMedal={getMedal}
              />
              <PaginationControls
                currentPage={page}
                totalPages={currentLeaderboardResult.totalPages ?? 1}
                total={currentLeaderboardResult.total ?? 0}
                onPageChange={handlePageChange}
              />
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  )
}

interface LeaderboardTableProps {
  leaderboard: any[]
  sortColumn: string
  queueType: string
  sortDirection: 'asc' | 'desc'
  onSort: (column: string) => void
  getMedal: (rank: number, mmr: number, queueType?: string) => React.ReactNode
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
    <div className='flex flex-1 flex-col overflow-hidden rounded-lg rounded-b-none border border-b-none'>
      <div className='overflow-x-auto'>
        <Table>
          <TableHeader className='sticky top-0 z-10 bg-white dark:bg-zinc-900'>
            <TableRow className='bg-gray-50 dark:bg-zinc-800/50'>
              <TableHead className='w-[40px] text-right'>#</TableHead>
              <TableHead className='w-[80px]'>
                <SortableHeader
                  className='w-full justify-end'
                  column='rank'
                  label='Rank'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead>
                <SortableHeader
                  column='name'
                  label='Player'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='mmr'
                  label='MMR'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right' align={'right'}>
                <SortableHeader
                  className='w-full justify-end'
                  column='peak_mmr'
                  label='Peak MMR'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='winrate'
                  label='Win Rate'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='wins'
                  label='Wins'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='losses'
                  label='Losses'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='totalgames'
                  label='Games'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='streak'
                  label='Streak'
                  currentSort={sortColumn}
                  direction={sortDirection}
                  onSort={onSort}
                />
              </TableHead>
              <TableHead className='text-right'>
                <SortableHeader
                  className='w-full justify-end'
                  column='peak_streak'
                  label='Peak Streak'
                  currentSort={sortColumn}
                  direction={sortDirection}
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
                  <TableRow
                    key={entry.id}
                    className={cn(
                      'transition-colors hover:bg-gray-50 dark:hover:bg-zinc-800/70'
                    )}
                  >
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
      </div>
    </div>
  )
}

interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

function PaginationControls({
  currentPage,
  totalPages,
  total,
  onPageChange,
}: PaginationControlsProps) {
  const [jumpToPage, setJumpToPage] = useState('')

  const handleJumpToPage = () => {
    const pageNum = Number.parseInt(jumpToPage, 10)
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum)
      setJumpToPage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJumpToPage()
    }
  }

  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showEllipsis = totalPages > 7

    if (!showEllipsis) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Always show first page
      pages.push(1)

      if (currentPage <= 3) {
        // Near start
        pages.push(2, 3, 4, 'ellipsis', totalPages)
      } else if (currentPage >= totalPages - 2) {
        // Near end
        pages.push(
          'ellipsis',
          totalPages - 3,
          totalPages - 2,
          totalPages - 1,
          totalPages
        )
      } else {
        // Middle
        pages.push(
          'ellipsis',
          currentPage - 1,
          currentPage,
          currentPage + 1,
          'ellipsis',
          totalPages
        )
      }
    }

    return pages
  }

  const pages = getPageNumbers()

  return (
    <div className='flex items-center justify-between rounded-b-lg border border-gray-200 border-t-0 bg-white px-4 py-3 sm:px-6 dark:border-zinc-800 dark:bg-zinc-900'>
      <div className='flex flex-1 flex-col gap-2 sm:hidden'>
        <div className='flex justify-between'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <span className='text-gray-700 text-sm dark:text-zinc-300'>
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant='outline'
            size='sm'
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
        <div className='flex items-center justify-center gap-2'>
          <span className='text-gray-700 text-sm dark:text-zinc-300'>Go to:</span>
          <Input
            type='number'
            min={1}
            max={totalPages}
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Page'
            className='w-20 h-8 text-sm'
          />
          <Button
            variant='outline'
            size='sm'
            onClick={handleJumpToPage}
            disabled={!jumpToPage || Number.parseInt(jumpToPage, 10) < 1 || Number.parseInt(jumpToPage, 10) > totalPages}
          >
            Go
          </Button>
        </div>
      </div>
      <div className='hidden sm:flex sm:flex-1 sm:items-center sm:justify-between'>
        <div>
          <p className='text-gray-700 text-sm dark:text-zinc-300'>
            Showing{' '}
            <span className='font-medium'>{(currentPage - 1) * 50 + 1}</span> to{' '}
            <span className='font-medium'>
              {Math.min(currentPage * 50, total)}
            </span>{' '}
            of <span className='font-medium'>{total}</span> players
          </p>
        </div>
        <div className='flex items-center gap-4'>
          <div className='flex gap-1'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className='h-4 w-4' />
            </Button>
            {pages.map((page, index) =>
              page === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  className='px-3 py-2 text-gray-400'
                >
                  ...
                </span>
              ) : (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => onPageChange(page)}
                  className='min-w-[2.5rem]'
                >
                  {page}
                </Button>
              )
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
          <div className='flex items-center gap-2'>
            <Input
              type='number'
              min={1}
              max={totalPages}
              value={jumpToPage}
              onChange={(e) => setJumpToPage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Page'
              className='w-20 h-8 text-sm'
            />
            <Button
              variant='outline'
              size='sm'
              onClick={handleJumpToPage}
              disabled={!jumpToPage || Number.parseInt(jumpToPage, 10) < 1 || Number.parseInt(jumpToPage, 10) > totalPages}
            >
              Go
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface SortableHeaderProps extends ComponentPropsWithoutRef<'button'> {
  column: string
  label: string
  currentSort: string
  direction: 'asc' | 'desc'
  onSort: (column: string) => void
}

function SortableHeader({
  column,
  label,
  currentSort,
  direction,
  onSort,
  className,
  ...rest
}: SortableHeaderProps) {
  const isActive = currentSort === column

  return (
    <button
      type={'button'}
      className={cn(
        'flex items-center gap-1 transition-colors hover:text-violet-500 dark:hover:text-violet-400',
        className
      )}
      {...rest}
      onClick={() => onSort(column)}
    >
      {label}
      <span className={'flex w-4 items-center justify-center'}>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className='h-3.5 w-3.5' />
          ) : (
            <ArrowDown className='h-3.5 w-3.5' />
          )
        ) : (
          <ArrowUpDown className='h-3.5 w-3.5 opacity-50' />
        )}
      </span>
    </button>
  )
}

export const LeaderboardTable = memo(RawLeaderboardTable)
LeaderboardTable.displayName = 'LeaderboardTable'
