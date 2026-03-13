'use client'

import { formatISO } from 'date-fns'
import { Ban, Check, ChevronDown, Plus, Search, Shield, X } from 'lucide-react'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import {
  startTransition,
  useDeferredValue,
  useOptimistic,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useDebounceCallback } from 'usehooks-ts'
import { PaginationControls } from '@/app/_components/pagination-controls'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
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

type ActionPanel = 'strike' | 'ban' | null

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
      nextPlayers[existingIndex] = {
        ...player,
        strikes: [action.strike, ...player.strikes],
        total_strike_points: player.total_strike_points + action.strike.amount,
        latest_strike_at: action.strike.issued_at,
      }
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
        if (player.discord_id !== action.user_id) return [player]
        const strikes = player.strikes.filter((s) => s.id !== action.strike_id)
        const total = strikes.reduce((sum, s) => sum + s.amount, 0)
        const nextPlayer = {
          ...player,
          strikes,
          total_strike_points: total,
          latest_strike_at: strikes[0]?.issued_at ?? null,
        }
        if (!nextPlayer.active_ban && strikes.length === 0) return []
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
      nextPlayers[existingIndex] = { ...player, active_ban: action.ban }
      return sortPlayers(nextPlayers, tab)
    }
    if (
      (tab === 'all' || tab === 'active-bans') &&
      searchMatches(action.user, search)
    ) {
      return sortPlayers(
        [{ ...makePlayer(action.user), active_ban: action.ban }, ...nextPlayers],
        tab
      )
    }
    return nextPlayers
  }

  return sortPlayers(
    nextPlayers.flatMap((player) => {
      if (player.discord_id !== action.user_id) return [player]
      const nextPlayer = { ...player, active_ban: null }
      if (tab === 'active-bans') return []
      if (nextPlayer.strikes.length === 0) return []
      return [nextPlayer]
    }),
    tab
  )
}

// ---------------------------------------------------------------------------
// Inline member search — no overlays
// ---------------------------------------------------------------------------

function MemberSearchInline({
  value,
  onChange,
  disabled,
}: {
  value: ModerationUser | null
  onChange: (user: ModerationUser | null) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const inputRef = useRef<HTMLInputElement>(null)

  const searchQ = api.moderation.searchGuildMembers.useQuery(
    { q: deferredQuery },
    {
      enabled: deferredQuery.length > 0,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    }
  )

  const results = searchQ.data ?? []

  if (value) {
    return (
      <div className='flex items-center gap-2 rounded-lg border px-3 py-2'>
        <Avatar className='h-6 w-6'>
          <AvatarImage src={value.avatar_url ?? ''} alt={value.display_name} />
          <AvatarFallback>{initials(value.display_name)}</AvatarFallback>
        </Avatar>
        <span className='flex-1 truncate text-sm font-medium'>
          {value.display_name}
        </span>
        <button
          type='button'
          className='rounded p-0.5 text-muted-foreground hover:text-foreground'
          onClick={() => {
            onChange(null)
            setQuery('')
            requestAnimationFrame(() => inputRef.current?.focus())
          }}
          disabled={disabled}
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    )
  }

  return (
    <div>
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Search guild members...'
        autoComplete='off'
        disabled={disabled}
      />
      {query.trim().length > 0 ? (
        <div className='mt-1 max-h-48 overflow-y-auto rounded-lg border'>
          {searchQ.isLoading ? (
            <div className='space-y-2 p-2'>
              <Skeleton className='h-10 w-full' />
              <Skeleton className='h-10 w-full' />
            </div>
          ) : results.length === 0 ? (
            <p className='py-4 text-center text-muted-foreground text-sm'>
              No matches
            </p>
          ) : (
            results.map((user) => (
              <button
                key={user.discord_id}
                type='button'
                className='flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted'
                onClick={() => onChange(user)}
              >
                <Avatar className='h-7 w-7'>
                  <AvatarImage
                    src={user.avatar_url ?? ''}
                    alt={user.display_name}
                  />
                  <AvatarFallback>{initials(user.display_name)}</AvatarFallback>
                </Avatar>
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>{user.display_name}</p>
                  <p className='truncate text-muted-foreground text-xs'>
                    @{user.username} · {user.discord_id}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tabs config
// ---------------------------------------------------------------------------

const TABS: { value: ModerationTab; label: string }[] = [
  { value: 'active-bans', label: 'Bans' },
  { value: 'recent', label: 'Strikes' },
  { value: 'all', label: 'All' },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ModerationClient({ role }: { role: Role }) {
  const utils = api.useUtils()
  const canManageBans = role === 'admin' || role === 'owner'

  // URL state
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

  // Search
  const [searchValue, setSearchValue] = useState(search ?? '')
  const flushSearch = useDebounceCallback((value: string) => {
    setQueryParams({ search: value || null, page: 1 })
  }, 300)
  const updateSearch = (value: string) => {
    setSearchValue(value)
    flushSearch(value)
  }

  // Data
  const strikesQ = api.moderation.listPlayersWithStrikes.useQuery(
    {
      page,
      limit: PAGE_SIZE,
      search: search || undefined,
      sort: 'recent' as 'recent',
      includeBans: tab === 'all',
    },
    { enabled: tab !== 'active-bans', refetchOnWindowFocus: false }
  )
  const bansQ = api.moderation.listActiveBans.useQuery(
    { page, limit: PAGE_SIZE, search: search || undefined },
    { enabled: tab === 'active-bans', refetchOnWindowFocus: false }
  )

  const currentData = tab === 'active-bans' ? bansQ.data : strikesQ.data
  const currentPlayers = currentData?.data ?? []
  const [optimisticPlayers, addOptimisticPlayer] = useOptimistic(
    currentPlayers,
    (state, action: OptimisticAction) =>
      applyOptimisticAction(state, action, tab, search)
  )

  // Action panel (inline, no modals)
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null)

  // Strike form
  const [strikeUser, setStrikeUser] = useState<ModerationUser | null>(null)
  const [strikeAmount, setStrikeAmount] =
    useState<(typeof STRIKE_OPTIONS)[number]['value']>('1')
  const [strikeReason, setStrikeReason] = useState('')
  const [strikeReference, setStrikeReference] = useState('')

  // Ban form
  const [banUser, setBanUser] = useState<ModerationUser | null>(null)
  const [banLength, setBanLength] = useState('7')
  const [banReason, setBanReason] = useState('')

  // Confirmation dialogs (simple — no nested overlays)
  const [strikeToRemove, setStrikeToRemove] = useState<{
    player: ModerationPlayer
    strike: ModerationStrike
  } | null>(null)
  const [removeStrikeReason, setRemoveStrikeReason] = useState('')
  const [banToLift, setBanToLift] = useState<ModerationPlayer | null>(null)
  const [liftBanReason, setLiftBanReason] = useState('')

  // Mutations
  const giveStrike = api.moderation.giveStrike.useMutation()
  const removeStrike = api.moderation.removeStrike.useMutation()
  const banMutation = api.moderation.banUser.useMutation()
  const unbanMutation = api.moderation.unbanUser.useMutation()

  const isMutating =
    giveStrike.isPending ||
    removeStrike.isPending ||
    banMutation.isPending ||
    unbanMutation.isPending

  const invalidateModeration = () => {
    startTransition(() => {
      void utils.moderation.listPlayersWithStrikes.invalidate()
      void utils.moderation.listActiveBans.invalidate()
    })
  }

  const openPanel = (panel: ActionPanel) => {
    setActionPanel(panel)
    // Reset forms
    setStrikeUser(null)
    setStrikeAmount('1')
    setStrikeReason('')
    setStrikeReference('')
    setBanUser(null)
    setBanLength('7')
    setBanReason('')
  }

  const closePanel = () => setActionPanel(null)

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
    closePanel()
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
    closePanel()
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
  const visiblePlayers = optimisticPlayers

  return (
    <div className='mx-auto w-[calc(100%-1rem)] max-w-fd-container pb-24 md:pb-8'>
      {/* Header */}
      <div className='flex items-center justify-between py-6'>
        <h1 className='font-bold text-2xl tracking-tight'>Moderation</h1>
        <div className='hidden items-center gap-2 md:flex'>
          <Button
            size='sm'
            variant={actionPanel === 'strike' ? 'secondary' : 'default'}
            onClick={() =>
              actionPanel === 'strike' ? closePanel() : openPanel('strike')
            }
          >
            <Plus className='h-4 w-4' />
            Strike
          </Button>
          {canManageBans ? (
            <Button
              size='sm'
              variant={actionPanel === 'ban' ? 'secondary' : 'outline'}
              onClick={() =>
                actionPanel === 'ban' ? closePanel() : openPanel('ban')
              }
            >
              <Ban className='h-4 w-4' />
              Ban
            </Button>
          ) : null}
        </div>
      </div>

      {/* Inline action panel */}
      {actionPanel === 'strike' ? (
        <div className='mb-4 rounded-lg border bg-card p-4'>
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='font-semibold text-sm'>Give Strike</h2>
            <button
              type='button'
              onClick={closePanel}
              className='rounded p-1 text-muted-foreground hover:text-foreground'
            >
              <X className='h-4 w-4' />
            </button>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Player</Label>
              <MemberSearchInline
                value={strikeUser}
                onChange={setStrikeUser}
                disabled={isMutating}
              />
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Amount</Label>
              <Select
                value={strikeAmount}
                onValueChange={(v) =>
                  setStrikeAmount(v as typeof strikeAmount)
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRIKE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Reason</Label>
              <Textarea
                value={strikeReason}
                onChange={(e) => setStrikeReason(e.target.value)}
                rows={2}
                placeholder='AFK in queue, abusive DM...'
              />
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Reference</Label>
              <Input
                value={strikeReference}
                onChange={(e) => setStrikeReference(e.target.value)}
                placeholder='Queue ID, thread, ticket...'
              />
            </div>
          </div>
          <div className='mt-3 flex justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={closePanel}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              size='sm'
              onClick={handleGiveStrike}
              disabled={isMutating || !strikeUser}
            >
              Confirm Strike
            </Button>
          </div>
        </div>
      ) : null}

      {actionPanel === 'ban' ? (
        <div className='mb-4 rounded-lg border bg-card p-4'>
          <div className='mb-3 flex items-center justify-between'>
            <h2 className='font-semibold text-sm'>Ban User</h2>
            <button
              type='button'
              onClick={closePanel}
              className='rounded p-1 text-muted-foreground hover:text-foreground'
            >
              <X className='h-4 w-4' />
            </button>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Player</Label>
              <MemberSearchInline
                value={banUser}
                onChange={setBanUser}
                disabled={isMutating}
              />
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Length (days)</Label>
              <Input
                type='number'
                min={1}
                value={banLength}
                onChange={(e) => setBanLength(e.target.value)}
                placeholder='7'
              />
            </div>
            <div className='sm:col-span-2 space-y-1.5'>
              <Label className='text-xs'>Reason</Label>
              <Textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                rows={2}
                placeholder='Repeated offenses, severe harassment...'
              />
            </div>
          </div>
          <div className='mt-3 flex justify-end gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={closePanel}
              disabled={isMutating}
            >
              Cancel
            </Button>
            <Button
              size='sm'
              onClick={handleBanUser}
              disabled={isMutating || !banUser}
            >
              Confirm Ban
            </Button>
          </div>
        </div>
      ) : null}

      {/* Toolbar: tabs + search */}
      <div className='flex flex-col gap-3 pb-4 sm:flex-row sm:items-center'>
        <div className='flex rounded-lg border bg-muted/50 p-0.5'>
          {TABS.map((t) => (
            <button
              key={t.value}
              type='button'
              onClick={() => setQueryParams({ tab: t.value, page: 1 })}
              className={cn(
                'rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                tab === t.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className='relative flex-1 sm:max-w-xs'>
          <Search className='pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={searchValue}
            placeholder='Search players...'
            onChange={(e) => updateSearch(e.target.value)}
            className='h-9 pl-8 text-sm'
          />
        </div>
      </div>

      {/* Player list */}
      <div className='space-y-2'>
        {isLoading ? (
          <div className='space-y-2'>
            {[1, 2, 3, 4].map((key) => (
              <div
                key={key}
                className='flex items-center gap-3 rounded-lg border p-3'
              >
                <Skeleton className='h-10 w-10 rounded-full' />
                <div className='flex-1 space-y-1.5'>
                  <Skeleton className='h-4 w-32' />
                  <Skeleton className='h-3 w-48' />
                </div>
              </div>
            ))}
          </div>
        ) : visiblePlayers.length === 0 ? (
          <div className='flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center'>
            <Shield className='h-6 w-6 text-muted-foreground' />
            <p className='text-muted-foreground text-sm'>No players found</p>
          </div>
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
        <div className='mt-4'>
          <PaginationControls
            currentPage={page}
            totalPages={currentData.totalPages}
            total={currentData.total}
            pageSize={PAGE_SIZE}
            itemLabel='players'
            onPageChange={(nextPage) => setQueryParams({ page: nextPage })}
          />
        </div>
      ) : null}

      {/* Mobile bottom bar */}
      <div className='fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:hidden'>
        <div className='mx-auto flex max-w-fd-container gap-2'>
          <Button
            className='flex-1'
            size='sm'
            variant={actionPanel === 'strike' ? 'secondary' : 'default'}
            onClick={() =>
              actionPanel === 'strike' ? closePanel() : openPanel('strike')
            }
          >
            {actionPanel === 'strike' ? (
              <ChevronDown className='h-4 w-4' />
            ) : (
              <Plus className='h-4 w-4' />
            )}
            Strike
          </Button>
          {canManageBans ? (
            <Button
              variant={actionPanel === 'ban' ? 'secondary' : 'outline'}
              size='sm'
              className='flex-1'
              onClick={() =>
                actionPanel === 'ban' ? closePanel() : openPanel('ban')
              }
            >
              {actionPanel === 'ban' ? (
                <ChevronDown className='h-4 w-4' />
              ) : (
                <Ban className='h-4 w-4' />
              )}
              Ban
            </Button>
          ) : null}
        </div>
      </div>

      {/* Remove Strike — simple dialog, no nested overlays */}
      <Dialog
        open={Boolean(strikeToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setStrikeToRemove(null)
            setRemoveStrikeReason('')
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Remove Strike</DialogTitle>
            <DialogDescription>
              Optional note explains why the strike was removed.
            </DialogDescription>
          </DialogHeader>
          {strikeToRemove ? (
            <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
              <p className='font-medium'>
                #{strikeToRemove.strike.id} on{' '}
                {strikeToRemove.player.display_name}
              </p>
              <p className='mt-1 text-muted-foreground'>
                {strikeToRemove.strike.reason}
              </p>
            </div>
          ) : null}
          <div className='space-y-1.5'>
            <Label className='text-xs'>Removal reason</Label>
            <Textarea
              value={removeStrikeReason}
              onChange={(e) => setRemoveStrikeReason(e.target.value)}
              rows={2}
              placeholder='Mistaken identity, duplicate, appeal accepted...'
            />
          </div>
          <DialogFooter>
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
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lift Ban — simple dialog, no nested overlays */}
      <Dialog
        open={Boolean(banToLift)}
        onOpenChange={(open) => {
          if (!open) {
            setBanToLift(null)
            setLiftBanReason('')
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle>Lift Ban</DialogTitle>
            <DialogDescription>
              Optional note is included with the unban action.
            </DialogDescription>
          </DialogHeader>
          {banToLift ? (
            <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
              <p className='font-medium'>{banToLift.display_name}</p>
              <p className='mt-1 text-muted-foreground'>
                {banToLift.active_ban?.reason ?? 'No reason provided'}
              </p>
            </div>
          ) : null}
          <div className='space-y-1.5'>
            <Label className='text-xs'>Lift reason</Label>
            <Textarea
              value={liftBanReason}
              onChange={(e) => setLiftBanReason(e.target.value)}
              rows={2}
              placeholder='Appeal accepted, review complete...'
            />
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
