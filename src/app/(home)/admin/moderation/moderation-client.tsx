'use client'

import { formatISO } from 'date-fns'
import { Ban, Check, ChevronsUpDown, Search, Shield, Siren } from 'lucide-react'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import {
  startTransition,
  useDeferredValue,
  useOptimistic,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useDebounceCallback } from 'usehooks-ts'
import { PaginationControls } from '@/app/_components/pagination-controls'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import { api, type RouterOutputs } from '@/trpc/react'
import { ModerationPlayerCard } from './moderation-player-card'

const PAGE_SIZE = 12

const STRIKE_OPTIONS = [
  { value: '0', label: '0 · Warning' },
  { value: '1', label: '1 · No punishment' },
  { value: '2', label: '2 · 1d QTO' },
  { value: '3', label: '3 · 3d QTO' },
  { value: '4', label: '4 · 7d QTO + ban' },
  { value: '5', label: '5 · Month QTO + ban' },
  { value: '6', label: '6 · Perma blacklist' },
] as const

type ModerationTab = 'recent' | 'active-bans' | 'all'
type Role = 'helper' | 'admin' | 'owner'
type ModerationList = RouterOutputs['moderation']['listPlayersWithStrikes']
type ModerationPlayer = ModerationList['data'][number]
type ModerationStrike = ModerationPlayer['strikes'][number]
type ModerationUser = RouterOutputs['moderation']['searchGuildMembers'][number]
type ModerationBan = NonNullable<ModerationPlayer['active_ban']>

type OptimisticAction =
  | {
      type: 'give-strike'
      user: ModerationUser
      strike: ModerationStrike
    }
  | {
      type: 'remove-strike'
      user_id: string
      strike_id: number
    }
  | {
      type: 'ban-user'
      user: ModerationUser
      ban: ModerationBan
    }
  | {
      type: 'unban-user'
      user_id: string
    }

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function searchMatches(
  user: Pick<ModerationUser, 'discord_id' | 'username' | 'display_name'>,
  search?: string | null
) {
  const query = search?.trim().toLowerCase()

  if (!query) return true

  return [user.discord_id, user.username, user.display_name].some((value) =>
    value.toLowerCase().includes(query)
  )
}

function sortPlayers(players: ModerationPlayer[], tab: ModerationTab) {
  return [...players].sort((left, right) => {
    if (tab === 'active-bans') {
      const leftExpiry = left.active_ban?.expires_at
        ? Date.parse(left.active_ban.expires_at)
        : Number.MAX_SAFE_INTEGER
      const rightExpiry = right.active_ban?.expires_at
        ? Date.parse(right.active_ban.expires_at)
        : Number.MAX_SAFE_INTEGER

      return leftExpiry - rightExpiry
    }

    const leftTime = left.latest_strike_at
      ? Date.parse(left.latest_strike_at)
      : 0
    const rightTime = right.latest_strike_at
      ? Date.parse(right.latest_strike_at)
      : 0

    return rightTime - leftTime
  })
}

function makePlayer(user: ModerationUser): ModerationPlayer {
  return {
    discord_id: user.discord_id,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    strikes: [],
    active_ban: null,
    total_strike_points: 0,
    latest_strike_at: null,
  }
}

function applyOptimisticAction(
  players: ModerationPlayer[],
  action: OptimisticAction,
  tab: ModerationTab,
  search?: string | null
) {
  const nextPlayers = [...players]

  if (action.type === 'give-strike') {
    const existingIndex = nextPlayers.findIndex(
      (player) => player.discord_id === action.user.discord_id
    )

    if (existingIndex >= 0) {
      const player = nextPlayers.at(existingIndex)
      if (!player) return nextPlayers
      const updated: ModerationPlayer = {
        ...player,
        strikes: [action.strike, ...player.strikes],
        total_strike_points: player.total_strike_points + action.strike.amount,
        latest_strike_at: action.strike.issued_at,
      }
      nextPlayers[existingIndex] = updated
      return sortPlayers(nextPlayers, tab)
    }

    if (tab === 'active-bans' || !searchMatches(action.user, search)) {
      return nextPlayers
    }

    return sortPlayers(
      [
        {
          ...makePlayer(action.user),
          strikes: [action.strike],
          total_strike_points: action.strike.amount,
          latest_strike_at: action.strike.issued_at,
        },
        ...nextPlayers,
      ],
      tab
    )
  }

  if (action.type === 'remove-strike') {
    return sortPlayers(
      nextPlayers.flatMap((player) => {
        if (player.discord_id !== action.user_id) {
          return [player]
        }

        const strikes = player.strikes.filter(
          (strike) => strike.id !== action.strike_id
        )
        const total = strikes.reduce((sum, strike) => sum + strike.amount, 0)
        const nextPlayer = {
          ...player,
          strikes,
          total_strike_points: total,
          latest_strike_at: strikes[0]?.issued_at ?? null,
        }

        if (!nextPlayer.active_ban && strikes.length === 0) {
          return []
        }

        return [nextPlayer]
      }),
      tab
    )
  }

  if (action.type === 'ban-user') {
    const existingIndex = nextPlayers.findIndex(
      (player) => player.discord_id === action.user.discord_id
    )

    if (existingIndex >= 0) {
      const player = nextPlayers.at(existingIndex)
      if (!player) return nextPlayers
      nextPlayers[existingIndex] = {
        ...player,
        active_ban: action.ban,
      }
      return sortPlayers(nextPlayers, tab)
    }

    if (
      (tab === 'all' || tab === 'active-bans') &&
      searchMatches(action.user, search)
    ) {
      return sortPlayers(
        [
          {
            ...makePlayer(action.user),
            active_ban: action.ban,
          },
          ...nextPlayers,
        ],
        tab
      )
    }

    return nextPlayers
  }

  return sortPlayers(
    nextPlayers.flatMap((player) => {
      if (player.discord_id !== action.user_id) {
        return [player]
      }

      const nextPlayer = {
        ...player,
        active_ban: null,
      }

      if (tab === 'active-bans') {
        return []
      }

      if (nextPlayer.strikes.length === 0) {
        return []
      }

      return [nextPlayer]
    }),
    tab
  )
}

function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className='max-h-[90vh]'>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className='overflow-y-auto px-4 pb-2'>{children}</div>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MemberSearchCombobox({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: ModerationUser | null
  onChange: (user: ModerationUser | null) => void
  placeholder: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())

  const searchQ = api.moderation.searchGuildMembers.useQuery(
    { q: deferredQuery },
    {
      enabled: open && deferredQuery.length > 0,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    }
  )

  const results = searchQ.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          className='w-full justify-between'
          disabled={disabled}
        >
          {value ? (
            <span className='flex min-w-0 items-center gap-2'>
              <Avatar className='h-6 w-6'>
                <AvatarImage
                  src={value.avatar_url ?? ''}
                  alt={value.display_name}
                />
                <AvatarFallback>{initials(value.display_name)}</AvatarFallback>
              </Avatar>
              <span className='truncate'>{value.display_name}</span>
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className='h-4 w-4 opacity-60' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--radix-popover-trigger-width)] p-0'
        align='start'
      >
        <div className='border-b p-2'>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Search guild members...'
            autoComplete='off'
          />
        </div>

        <ScrollArea className='max-h-72'>
          <div className='p-2'>
            {searchQ.isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
                <Skeleton className='h-10 w-full' />
              </div>
            ) : deferredQuery.length === 0 ? (
              <p className='px-2 py-6 text-center text-muted-foreground text-sm'>
                Start typing to search the Discord guild.
              </p>
            ) : results.length === 0 ? (
              <p className='px-2 py-6 text-center text-muted-foreground text-sm'>
                No matching guild members.
              </p>
            ) : (
              <div className='space-y-1'>
                {results.map((user) => {
                  const isSelected = value?.discord_id === user.discord_id

                  return (
                    <button
                      key={user.discord_id}
                      type='button'
                      className='flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted'
                      onClick={() => {
                        onChange(user)
                        setOpen(false)
                      }}
                    >
                      <Avatar className='h-8 w-8'>
                        <AvatarImage
                          src={user.avatar_url ?? ''}
                          alt={user.display_name}
                        />
                        <AvatarFallback>
                          {initials(user.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className='min-w-0 flex-1'>
                        <p className='truncate font-medium'>
                          {user.display_name}
                        </p>
                        <p className='truncate text-muted-foreground text-xs'>
                          @{user.username} · {user.discord_id}
                        </p>
                      </div>
                      {isSelected ? (
                        <Check className='h-4 w-4 text-primary' />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export function ModerationClient({ role }: { role: Role }) {
  const utils = api.useUtils()
  const canManageBans = role === 'admin' || role === 'owner'

  const [queryParams, setQueryParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      search: parseAsString,
      tab: parseAsString.withDefault('recent'),
    },
    { history: 'push' }
  )

  const page = queryParams.page
  const search = queryParams.search
  const tab: ModerationTab =
    queryParams.tab === 'active-bans' || queryParams.tab === 'all'
      ? queryParams.tab
      : 'recent'

  const updateSearch = useDebounceCallback((value: string) => {
    setQueryParams({ search: value || null, page: 1 })
  }, 300)

  const strikesInput = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
    sort: 'recent' as 'recent',
    includeBans: tab === 'all',
  }
  const bansInput = {
    page,
    limit: PAGE_SIZE,
    search: search || undefined,
  }

  const strikesQ = api.moderation.listPlayersWithStrikes.useQuery(
    strikesInput,
    {
      enabled: tab !== 'active-bans',
      refetchOnWindowFocus: false,
    }
  )
  const bansQ = api.moderation.listActiveBans.useQuery(bansInput, {
    enabled: tab === 'active-bans',
    refetchOnWindowFocus: false,
  })

  const currentData = tab === 'active-bans' ? bansQ.data : strikesQ.data
  const currentPlayers = currentData?.data ?? []
  const [optimisticPlayers, addOptimisticPlayer] = useOptimistic(
    currentPlayers,
    (state, action: OptimisticAction) =>
      applyOptimisticAction(state, action, tab, search)
  )

  const [strikeDialogOpen, setStrikeDialogOpen] = useState(false)
  const [strikeUser, setStrikeUser] = useState<ModerationUser | null>(null)
  const [strikeAmount, setStrikeAmount] =
    useState<(typeof STRIKE_OPTIONS)[number]['value']>('1')
  const [strikeReason, setStrikeReason] = useState('')
  const [strikeReference, setStrikeReference] = useState('')

  const [banDialogOpen, setBanDialogOpen] = useState(false)
  const [banUser, setBanUser] = useState<ModerationUser | null>(null)
  const [banLength, setBanLength] = useState('7')
  const [banReason, setBanReason] = useState('')

  const [strikeToRemove, setStrikeToRemove] = useState<{
    player: ModerationPlayer
    strike: ModerationStrike
  } | null>(null)
  const [removeStrikeReason, setRemoveStrikeReason] = useState('')

  const [banToLift, setBanToLift] = useState<ModerationPlayer | null>(null)
  const [liftBanReason, setLiftBanReason] = useState('')

  const giveStrike = api.moderation.giveStrike.useMutation()
  const removeStrike = api.moderation.removeStrike.useMutation()
  const banMutation = api.moderation.banUser.useMutation()
  const unbanMutation = api.moderation.unbanUser.useMutation()

  const invalidateModeration = () => {
    startTransition(() => {
      void utils.moderation.listPlayersWithStrikes.invalidate()
      void utils.moderation.listActiveBans.invalidate()
    })
  }

  const resetStrikeForm = () => {
    setStrikeDialogOpen(false)
    setStrikeUser(null)
    setStrikeAmount('1')
    setStrikeReason('')
    setStrikeReference('')
  }

  const resetBanForm = () => {
    setBanDialogOpen(false)
    setBanUser(null)
    setBanLength('7')
    setBanReason('')
  }

  const handleGiveStrike = async () => {
    if (!strikeUser) {
      toast.error('Pick a player first.')
      return
    }

    const amount = Number(strikeAmount)
    const optimisticStrike: ModerationStrike = {
      id: -Date.now(),
      user_id: strikeUser.discord_id,
      reason: strikeReason.trim() || 'No reason provided',
      issued_by_id: 'self',
      issued_at: formatISO(new Date()),
      expires_at: null,
      amount,
      reference: strikeReference.trim() || 'No reference provided',
      issued_by: {
        discord_id: 'self',
        username: 'you',
        display_name: 'You',
        avatar_url: null,
      },
    }

    addOptimisticPlayer({
      type: 'give-strike',
      user: strikeUser,
      strike: optimisticStrike,
    })
    resetStrikeForm()

    try {
      await giveStrike.mutateAsync({
        user_id: strikeUser.discord_id,
        amount,
        reason: strikeReason.trim() || undefined,
        reference: strikeReference.trim() || undefined,
      })
      toast.success(`Strike added to ${strikeUser.display_name}.`)
    } catch (error) {
      console.error(error)
      toast.error('Failed to add strike.')
    } finally {
      invalidateModeration()
    }
  }

  const handleRemoveStrike = async () => {
    if (!strikeToRemove) return

    const target = strikeToRemove
    addOptimisticPlayer({
      type: 'remove-strike',
      user_id: target.player.discord_id,
      strike_id: target.strike.id,
    })
    setStrikeToRemove(null)
    setRemoveStrikeReason('')

    try {
      await removeStrike.mutateAsync({
        id: target.strike.id,
        reason: removeStrikeReason.trim() || undefined,
      })
      toast.success(`Removed strike #${target.strike.id}.`)
    } catch (error) {
      console.error(error)
      toast.error('Failed to remove strike.')
    } finally {
      invalidateModeration()
    }
  }

  const handleBanUser = async () => {
    if (!banUser) {
      toast.error('Pick a player first.')
      return
    }

    const length = Number(banLength)

    if (!Number.isFinite(length) || length <= 0) {
      toast.error('Ban length must be a positive number.')
      return
    }

    const optimisticBan: ModerationBan = {
      id: -Date.now(),
      user_id: banUser.discord_id,
      reason: banReason.trim() || 'None provided',
      expires_at: formatISO(
        new Date(Date.now() + length * 24 * 60 * 60 * 1000)
      ),
      related_strike_ids: null,
      allowed_queue_ids: null,
    }

    addOptimisticPlayer({
      type: 'ban-user',
      user: banUser,
      ban: optimisticBan,
    })
    resetBanForm()

    try {
      await banMutation.mutateAsync({
        user_id: banUser.discord_id,
        length,
        reason: banReason.trim() || undefined,
      })
      toast.success(`Banned ${banUser.display_name}.`)
    } catch (error) {
      console.error(error)
      toast.error('Failed to ban user.')
    } finally {
      invalidateModeration()
    }
  }

  const handleLiftBan = async () => {
    if (!banToLift) return

    const target = banToLift
    addOptimisticPlayer({
      type: 'unban-user',
      user_id: target.discord_id,
    })
    setBanToLift(null)
    setLiftBanReason('')

    try {
      await unbanMutation.mutateAsync({
        user_id: target.discord_id,
        reason: liftBanReason.trim() || undefined,
      })
      toast.success(`Lifted ban for ${target.display_name}.`)
    } catch (error) {
      console.error(error)
      toast.error('Failed to lift ban.')
    } finally {
      invalidateModeration()
    }
  }

  const isLoading = tab === 'active-bans' ? bansQ.isLoading : strikesQ.isLoading
  const isMutating =
    giveStrike.isPending ||
    removeStrike.isPending ||
    banMutation.isPending ||
    unbanMutation.isPending

  const visiblePlayers = optimisticPlayers
  const summaryTotal = currentData?.total ?? visiblePlayers.length

  return (
    <div className='space-y-6 pb-24 md:pb-0'>
      <Card className='border-border/60 bg-gradient-to-br from-card via-card to-muted/20'>
        <CardHeader className='gap-4'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='secondary' className='rounded-full px-3 py-1'>
                  {summaryTotal} tracked players
                </Badge>
                <Badge variant='outline' className='rounded-full px-3 py-1'>
                  Helpers manage strikes
                </Badge>
                <Badge variant='outline' className='rounded-full px-3 py-1'>
                  Admins manage bans
                </Badge>
              </div>
              <div>
                <CardTitle className='text-2xl'>
                  Search-first moderation queue
                </CardTitle>
                <CardDescription className='max-w-2xl pt-1 text-sm leading-6'>
                  Tabs keep active bans, fresh strike activity, and the broader
                  history one click away. Cards stay compact on mobile and open
                  into full incident detail when needed.
                </CardDescription>
              </div>
            </div>

            <div className='hidden flex-wrap items-center gap-2 md:flex'>
              <Button onClick={() => setStrikeDialogOpen(true)}>
                <Siren className='h-4 w-4' />
                Give Strike
              </Button>
              {canManageBans ? (
                <Button
                  variant='outline'
                  onClick={() => setBanDialogOpen(true)}
                >
                  <Ban className='h-4 w-4' />
                  Ban User
                </Button>
              ) : null}
            </div>
          </div>

          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <Tabs
              value={tab}
              onValueChange={(value) =>
                setQueryParams({
                  tab: value,
                  page: 1,
                })
              }
            >
              <TabsList className='grid w-full grid-cols-3 lg:w-[420px]'>
                <TabsTrigger value='active-bans'>Active Bans</TabsTrigger>
                <TabsTrigger value='recent'>Recent Strikes</TabsTrigger>
                <TabsTrigger value='all'>All</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className='relative w-full lg:max-w-md'>
              <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                key={search ?? ''}
                defaultValue={search ?? ''}
                placeholder='Search by username or Discord ID'
                onChange={(event) => updateSearch(event.target.value)}
                className='pl-9'
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className='grid gap-3 sm:grid-cols-3'>
        <Card className='gap-3 border-border/60 py-4'>
          <CardContent className='px-4'>
            <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>
              Current View
            </p>
            <p className='mt-2 font-semibold text-lg'>
              {tab === 'active-bans'
                ? 'Active Bans'
                : tab === 'all'
                  ? 'All Players'
                  : 'Recent Strikes'}
            </p>
          </CardContent>
        </Card>
        <Card className='gap-3 border-border/60 py-4'>
          <CardContent className='px-4'>
            <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>
              Search
            </p>
            <p className='mt-2 font-semibold text-lg'>
              {search?.trim() || 'No filter'}
            </p>
          </CardContent>
        </Card>
        <Card className='gap-3 border-border/60 py-4'>
          <CardContent className='px-4'>
            <p className='text-muted-foreground text-xs uppercase tracking-[0.18em]'>
              Access
            </p>
            <p className='mt-2 font-semibold text-lg'>
              {canManageBans ? 'Strike + ban control' : 'Strike control only'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className='space-y-4'>
        {isLoading ? (
          <div className='space-y-4'>
            {['one', 'two', 'three', 'four'].map((key) => (
              <Card key={key} className='gap-4 py-5'>
                <CardContent className='space-y-4 px-5'>
                  <div className='flex items-center gap-4'>
                    <Skeleton className='h-12 w-12 rounded-full' />
                    <div className='flex-1 space-y-2'>
                      <Skeleton className='h-4 w-40' />
                      <Skeleton className='h-4 w-56' />
                    </div>
                  </div>
                  <Skeleton className='h-16 w-full rounded-xl' />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visiblePlayers.length === 0 ? (
          <Card className='border-dashed py-10'>
            <CardContent className='flex flex-col items-center gap-3 px-6 text-center'>
              <Shield className='h-8 w-8 text-muted-foreground' />
              <div className='space-y-1'>
                <p className='font-semibold'>No players found</p>
                <p className='max-w-md text-muted-foreground text-sm'>
                  Try a broader search, switch tabs, or add a new strike to
                  start tracking a player here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          visiblePlayers.map((player) => (
            <ModerationPlayerCard
              key={player.discord_id}
              player={player}
              canManageStrikes
              canManageBans={canManageBans}
              onRemoveStrike={(selectedPlayer, strike) => {
                setStrikeToRemove({ player: selectedPlayer, strike })
                setRemoveStrikeReason('')
              }}
              onLiftBan={(selectedPlayer) => {
                setBanToLift(selectedPlayer)
                setLiftBanReason('')
              }}
            />
          ))
        )}
      </div>

      {currentData && currentData.totalPages > 1 ? (
        <PaginationControls
          currentPage={page}
          totalPages={currentData.totalPages}
          total={currentData.total}
          pageSize={PAGE_SIZE}
          itemLabel='players'
          onPageChange={(nextPage) => setQueryParams({ page: nextPage })}
        />
      ) : null}

      <div className='fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:hidden'>
        <div className='mx-auto flex max-w-fd-container gap-2'>
          <Button className='flex-1' onClick={() => setStrikeDialogOpen(true)}>
            <Siren className='h-4 w-4' />
            Give Strike
          </Button>
          {canManageBans ? (
            <Button
              variant='outline'
              className='flex-1'
              onClick={() => setBanDialogOpen(true)}
            >
              <Ban className='h-4 w-4' />
              Ban User
            </Button>
          ) : null}
        </div>
      </div>

      <ResponsiveModal
        open={strikeDialogOpen}
        onOpenChange={setStrikeDialogOpen}
        title='Give Strike'
        description='Pick a player, choose the tier, and optionally leave incident context.'
        footer={
          <>
            <Button
              variant='outline'
              onClick={resetStrikeForm}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGiveStrike}
              disabled={isMutating || !strikeUser}
            >
              Confirm Strike
            </Button>
          </>
        }
      >
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label>Player</Label>
            <MemberSearchCombobox
              value={strikeUser}
              onChange={setStrikeUser}
              placeholder='Select a guild member'
              disabled={isMutating}
            />
          </div>

          <div className='grid gap-2'>
            <Label>Amount</Label>
            <Select
              value={strikeAmount}
              onValueChange={(value) =>
                setStrikeAmount(value as typeof strikeAmount)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRIKE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className='grid gap-2'>
            <Label>Reason</Label>
            <Textarea
              value={strikeReason}
              onChange={(event) => setStrikeReason(event.target.value)}
              rows={4}
              placeholder='AFK in queue, abusive DM, rules dodge...'
            />
          </div>

          <div className='grid gap-2'>
            <Label>Reference</Label>
            <Input
              value={strikeReference}
              onChange={(event) => setStrikeReference(event.target.value)}
              placeholder='Queue ID, Discord thread, ticket number...'
            />
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={banDialogOpen}
        onOpenChange={setBanDialogOpen}
        title='Ban User'
        description='Admins can add a timed queue ban directly from the same flow.'
        footer={
          <>
            <Button
              variant='outline'
              onClick={resetBanForm}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button onClick={handleBanUser} disabled={isMutating || !banUser}>
              Confirm Ban
            </Button>
          </>
        }
      >
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label>Player</Label>
            <MemberSearchCombobox
              value={banUser}
              onChange={setBanUser}
              placeholder='Select a guild member'
              disabled={isMutating}
            />
          </div>

          <div className='grid gap-2'>
            <Label>Length (days)</Label>
            <Input
              type='number'
              min={1}
              value={banLength}
              onChange={(event) => setBanLength(event.target.value)}
              placeholder='7'
            />
          </div>

          <div className='grid gap-2'>
            <Label>Reason</Label>
            <Textarea
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              rows={4}
              placeholder='Repeated offenses, severe harassment...'
            />
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={Boolean(strikeToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setStrikeToRemove(null)
            setRemoveStrikeReason('')
          }
        }}
        title='Remove Strike'
        description='Optional note explains why the strike was removed.'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => {
                setStrikeToRemove(null)
                setRemoveStrikeReason('')
              }}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleRemoveStrike}
              disabled={isMutating || !strikeToRemove}
            >
              Remove Strike
            </Button>
          </>
        }
      >
        <div className='grid gap-4'>
          <div className='rounded-xl border bg-muted/30 p-4 text-sm'>
            {strikeToRemove ? (
              <>
                <p className='font-medium'>
                  #{strikeToRemove.strike.id} on{' '}
                  {strikeToRemove.player.display_name}
                </p>
                <p className='mt-1 text-muted-foreground'>
                  {strikeToRemove.strike.reason}
                </p>
              </>
            ) : null}
          </div>
          <div className='grid gap-2'>
            <Label>Removal reason</Label>
            <Textarea
              value={removeStrikeReason}
              onChange={(event) => setRemoveStrikeReason(event.target.value)}
              rows={4}
              placeholder='Mistaken identity, duplicate strike, appeal accepted...'
            />
          </div>
        </div>
      </ResponsiveModal>

      <ResponsiveModal
        open={Boolean(banToLift)}
        onOpenChange={(open) => {
          if (!open) {
            setBanToLift(null)
            setLiftBanReason('')
          }
        }}
        title='Lift Ban'
        description='Optional note is included with the unban action.'
        footer={
          <>
            <Button
              variant='outline'
              onClick={() => {
                setBanToLift(null)
                setLiftBanReason('')
              }}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleLiftBan}
              disabled={isMutating || !banToLift}
            >
              Lift Ban
            </Button>
          </>
        }
      >
        <div className='grid gap-4'>
          <div className='rounded-xl border bg-muted/30 p-4 text-sm'>
            {banToLift ? (
              <>
                <p className='font-medium'>{banToLift.display_name}</p>
                <p className='mt-1 text-muted-foreground'>
                  {banToLift.active_ban?.reason ?? 'No reason provided'}
                </p>
              </>
            ) : null}
          </div>
          <div className='grid gap-2'>
            <Label>Lift reason</Label>
            <Textarea
              value={liftBanReason}
              onChange={(event) => setLiftBanReason(event.target.value)}
              rows={4}
              placeholder='Appeal accepted, review complete, manual correction...'
            />
          </div>
        </div>
      </ResponsiveModal>
    </div>
  )
}
