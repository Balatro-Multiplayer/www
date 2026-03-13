'use client'

import { format, formatDistanceToNowStrict } from 'date-fns'
import { Ban, ChevronDown, ShieldAlert, Trash2 } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
  4: '7d QTO + tourney ban',
  5: 'Month QTO + tourney ban',
  6: 'Perma blacklist',
}

function relativeTime(value: string | null) {
  if (!value) return 'No strikes yet'
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
  const strikeCount = player.strikes.length

  return (
    <Collapsible>
      <Card className='gap-0 overflow-hidden border-border/60 bg-card/90 shadow-sm'>
        <CollapsibleTrigger asChild>
          <button
            type='button'
            className='group flex w-full items-start gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/30'
          >
            <Avatar className='h-12 w-12 border border-border/60'>
              <AvatarImage
                src={player.avatar_url ?? ''}
                alt={player.display_name}
              />
              <AvatarFallback>{initials(player.display_name)}</AvatarFallback>
            </Avatar>

            <div className='min-w-0 flex-1 space-y-3'>
              <div className='flex flex-col gap-1 md:flex-row md:items-center md:justify-between'>
                <div className='min-w-0'>
                  <p className='truncate font-semibold text-base'>
                    {player.display_name}
                  </p>
                  <p className='truncate text-muted-foreground text-sm'>
                    @{player.username} · {player.discord_id}
                  </p>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  {player.active_ban ? (
                    <Badge
                      variant='destructive'
                      className='gap-1 rounded-full px-3 py-1'
                    >
                      <Ban className='h-3.5 w-3.5' />
                      Active ban
                    </Badge>
                  ) : null}
                  <Badge variant='secondary' className='rounded-full px-3 py-1'>
                    {player.total_strike_points} points
                  </Badge>
                  <Badge variant='outline' className='rounded-full px-3 py-1'>
                    {strikeCount} {strikeCount === 1 ? 'strike' : 'strikes'}
                  </Badge>
                </div>
              </div>

              <div className='flex flex-col gap-2 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between'>
                <p>Last strike: {relativeTime(player.latest_strike_at)}</p>
                <div className='flex items-center gap-2'>
                  {player.active_ban?.expires_at ? (
                    <p>
                      Ban lifts{' '}
                      {format(
                        new Date(player.active_ban.expires_at),
                        'MMM d, yyyy'
                      )}
                    </p>
                  ) : player.active_ban ? (
                    <p>Ban has no expiry</p>
                  ) : null}
                  <ChevronDown className='h-4 w-4 transition-transform group-data-[state=open]:rotate-180' />
                </div>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className='space-y-5 border-t bg-muted/10 px-5 pt-5 pb-5'>
            {player.active_ban ? (
              <div className='rounded-xl border border-destructive/30 bg-destructive/5 p-4'>
                <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='space-y-2'>
                    <div className='flex items-center gap-2 font-semibold text-sm'>
                      <ShieldAlert className='h-4 w-4 text-destructive' />
                      Ban details
                    </div>
                    <p className='text-sm'>{player.active_ban.reason}</p>
                    <p className='text-muted-foreground text-sm'>
                      Expires:{' '}
                      {player.active_ban.expires_at
                        ? format(
                            new Date(player.active_ban.expires_at),
                            'MMM d, yyyy HH:mm'
                          )
                        : 'Never'}
                    </p>
                  </div>

                  {canManageBans ? (
                    <Button
                      variant='destructive'
                      size='sm'
                      onClick={() => onLiftBan(player)}
                    >
                      Lift Ban
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className='space-y-3'>
              <div className='flex items-center justify-between'>
                <h3 className='font-semibold text-sm uppercase tracking-[0.18em]'>
                  Strikes
                </h3>
                <p className='text-muted-foreground text-xs'>
                  Sorted newest first
                </p>
              </div>

              {player.strikes.length === 0 ? (
                <div className='rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground text-sm'>
                  No strike history on this player.
                </div>
              ) : (
                <div className='space-y-3'>
                  {player.strikes.map((strike) => (
                    <div
                      key={strike.id}
                      className='rounded-xl border bg-background px-4 py-4'
                    >
                      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                        <div className='space-y-3'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge
                              className={cn(
                                'rounded-full px-3 py-1',
                                strike.amount >= 4
                                  ? 'bg-destructive text-white'
                                  : strike.amount >= 2
                                    ? 'bg-amber-500 text-black'
                                    : 'bg-muted text-foreground'
                              )}
                            >
                              #{strike.id} ·{' '}
                              {STRIKE_LABELS[strike.amount] ??
                                `${strike.amount} points`}
                            </Badge>
                            <span className='text-muted-foreground text-sm'>
                              {format(
                                new Date(strike.issued_at),
                                'MMM d, yyyy HH:mm'
                              )}
                            </span>
                          </div>

                          <div className='space-y-1 text-sm'>
                            <p>{strike.reason}</p>
                            <p className='text-muted-foreground'>
                              Ref: {strike.reference || 'No reference'} · By{' '}
                              {strike.issued_by?.display_name ??
                                strike.issued_by?.username ??
                                strike.issued_by_id}
                            </p>
                          </div>
                        </div>

                        {canManageStrikes ? (
                          <Button
                            variant='outline'
                            size='sm'
                            className='border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive'
                            onClick={() => onRemoveStrike(player, strike)}
                          >
                            <Trash2 className='h-4 w-4' />
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}
