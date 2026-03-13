'use client'

import { format, formatDistanceToNowStrict } from 'date-fns'
import { Ban, ChevronRight, ShieldAlert, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RouterOutputs } from '@/trpc/react'

type ModerationPlayer =
  RouterOutputs['moderation']['listPlayersWithStrikes']['data'][number]
type ModerationStrike = ModerationPlayer['strikes'][number]

const STRIKE_LABELS: Record<number, string> = {
  0: 'Warning',
  1: 'No punishment',
  2: '1d QTO',
  3: '3d QTO',
  4: '7d QTO + ban',
  5: 'Month QTO + ban',
  6: 'Perma blacklist',
}

function relativeTime(value: string | null) {
  if (!value) return 'never'
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function ModerationPlayerCard({
  player,
  canManageStrikes,
  canManageBans,
  onRemoveStrike,
  onLiftBan,
}: {
  player: ModerationPlayer
  canManageStrikes: boolean
  canManageBans: boolean
  onRemoveStrike: (player: ModerationPlayer, strike: ModerationStrike) => void
  onLiftBan: (player: ModerationPlayer) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const strikeCount = player.strikes.length

  return (
    <div className='rounded-lg border bg-card transition-colors'>
      {/* Summary row */}
      <button
        type='button'
        onClick={() => setExpanded(!expanded)}
        className='flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40'
      >
        <Avatar className='h-9 w-9 shrink-0'>
          <AvatarImage
            src={player.avatar_url ?? ''}
            alt={player.display_name}
          />
          <AvatarFallback className='text-xs'>
            {initials(player.display_name)}
          </AvatarFallback>
        </Avatar>

        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='truncate font-medium text-sm'>
              {player.display_name}
            </span>
            {player.active_ban ? (
              <Badge
                variant='destructive'
                className='shrink-0 gap-0.5 px-1.5 py-0 text-[11px]'
              >
                <Ban className='h-3 w-3' />
                banned
              </Badge>
            ) : null}
          </div>
          <p className='truncate text-muted-foreground text-xs'>
            @{player.username} · {player.total_strike_points}pts ·{' '}
            {strikeCount} {strikeCount === 1 ? 'strike' : 'strikes'} · last{' '}
            {relativeTime(player.latest_strike_at)}
          </p>
        </div>

        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded details */}
      {expanded ? (
        <div className='border-t px-3 py-3 space-y-3'>
          {/* Ban info */}
          {player.active_ban ? (
            <div className='flex items-start justify-between gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2.5'>
              <div className='min-w-0 space-y-0.5'>
                <div className='flex items-center gap-1.5 font-medium text-xs'>
                  <ShieldAlert className='h-3.5 w-3.5 text-destructive' />
                  Ban active
                </div>
                <p className='text-xs'>{player.active_ban.reason}</p>
                <p className='text-muted-foreground text-xs'>
                  {player.active_ban.expires_at
                    ? `Expires ${format(new Date(player.active_ban.expires_at), 'MMM d, yyyy HH:mm')}`
                    : 'No expiry'}
                </p>
              </div>
              {canManageBans ? (
                <Button
                  variant='destructive'
                  size='sm'
                  className='shrink-0 h-7 text-xs'
                  onClick={() => onLiftBan(player)}
                >
                  Lift
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Strikes */}
          {player.strikes.length === 0 ? (
            <p className='py-4 text-center text-muted-foreground text-xs'>
              No strike history
            </p>
          ) : (
            <div className='space-y-1.5'>
              {player.strikes.map((strike) => (
                <div
                  key={strike.id}
                  className='flex items-start gap-2 rounded-md border bg-background p-2.5'
                >
                  <Badge
                    className={cn(
                      'mt-0.5 shrink-0 px-1.5 py-0 text-[11px]',
                      strike.amount >= 4
                        ? 'bg-destructive text-white'
                        : strike.amount >= 2
                          ? 'bg-amber-500 text-black'
                          : 'bg-muted text-foreground'
                    )}
                  >
                    {STRIKE_LABELS[strike.amount] ?? `${strike.amount}pts`}
                  </Badge>

                  <div className='min-w-0 flex-1 space-y-0.5'>
                    <p className='text-xs'>{strike.reason}</p>
                    <p className='text-muted-foreground text-[11px]'>
                      {format(new Date(strike.issued_at), 'MMM d, yyyy')}
                      {strike.reference ? ` · ${strike.reference}` : ''}
                      {' · '}
                      {strike.issued_by?.display_name ??
                        strike.issued_by?.username ??
                        strike.issued_by_id}
                    </p>
                  </div>

                  {canManageStrikes ? (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='shrink-0 h-7 w-7 p-0 text-muted-foreground hover:text-destructive'
                      onClick={() => onRemoveStrike(player, strike)}
                    >
                      <Trash2 className='h-3.5 w-3.5' />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
