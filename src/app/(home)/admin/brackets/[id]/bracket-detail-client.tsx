'use client'

import { ArrowLeft, ExternalLink, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  BEST_OF_OPTIONS,
  type BracketResult,
  type BracketSize,
} from '@/lib/bracket'
import { api } from '@/trpc/react'
import type { SeasonOption } from '../brackets-client'
import { PlayerSearch } from '../player-search'
import { AdminBracketBoard, type RosterEntry } from './admin-bracket-board'

export type BracketDetail = {
  id: number
  name: string
  seasonId: number
  size: BracketSize
  hasThirdPlace: boolean
  bestOf: number
  finalsBestOf: number | null
  isPublished: boolean
  roster: RosterEntry[]
  results: BracketResult[]
}

export function BracketDetailClient({
  bracket,
  seasons,
}: {
  bracket: BracketDetail
  seasons: SeasonOption[]
}) {
  const router = useRouter()
  const [roster, setRoster] = useState<RosterEntry[]>(() => [...bracket.roster])
  const [manualName, setManualName] = useState('')

  const refresh = () => startTransition(() => router.refresh())

  const updateBracket = api.brackets.update.useMutation({
    onSuccess: () => refresh(),
    onError: (err) => {
      toast.error(err.message)
      refresh()
    },
  })

  const setResult = api.brackets.setResult.useMutation({
    onSuccess: () => refresh(),
    onError: (err) => {
      // Refresh so the board reverts to server truth instead of showing the
      // rejected score as if it were saved.
      toast.error(err.message)
      refresh()
    },
  })

  // Roster saves are serialized through a promise chain: rapid drags would
  // otherwise race as concurrent full-roster replacements and an older
  // snapshot could overwrite a newer one on the server.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const pendingSaves = useRef(0)

  // Server truth wins whenever fresh props arrive (our own refresh after a
  // save, or another admin's edit) — but not while our own saves are still
  // in flight, or an early refresh would clobber newer optimistic edits.
  const serverRoster = JSON.stringify(bracket.roster)
  const lastSynced = useRef(serverRoster)
  if (lastSynced.current !== serverRoster && pendingSaves.current === 0) {
    lastSynced.current = serverRoster
    setRoster([...bracket.roster])
  }

  function saveRoster(next: RosterEntry[]) {
    setRoster(next)
    pendingSaves.current += 1
    saveChain.current = saveChain.current
      .then(() => updateBracket.mutateAsync({ id: bracket.id, roster: next }))
      .catch(() => undefined)
      .finally(() => {
        pendingSaves.current -= 1
      })
  }

  function addPlayer(entry: { name: string; playerId: string | null }) {
    const name = entry.name.trim()
    if (!name) return
    const duplicate = roster.some(
      (existing) =>
        existing.name.toLowerCase() === name.toLowerCase() ||
        (entry.playerId && existing.playerId === entry.playerId)
    )
    if (duplicate) {
      toast.error(`${name} is already in the bracket`)
      return
    }
    saveRoster([
      ...roster,
      { name, playerId: entry.playerId ?? null, position: null },
    ])
  }

  /**
   * Place the named player at `position`. A player coming from another
   * spot swaps with the current occupant; one coming from the pool sends
   * the occupant back to the pool.
   */
  function assign(name: string, position: number) {
    const chosen = roster.find((entry) => entry.name === name)
    if (!chosen || chosen.position === position) return
    const from = chosen.position
    saveRoster(
      roster.map((entry) => {
        if (entry.name === name) return { ...entry, position }
        if (entry.position === position) return { ...entry, position: from }
        return entry
      })
    )
  }

  function unassign(position: number) {
    saveRoster(
      roster.map((entry) =>
        entry.position === position ? { ...entry, position: null } : entry
      )
    )
  }

  function removeFromBracket(name: string) {
    saveRoster(roster.filter((entry) => entry.name !== name))
  }

  function handleManualAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    addPlayer({ name: manualName, playerId: null })
    setManualName('')
  }

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-4'>
        <div className='flex items-center gap-2'>
          <Button variant='ghost' size='sm' asChild>
            <Link href='/admin/brackets'>
              <ArrowLeft className='mr-1 size-4' />
              Brackets
            </Link>
          </Button>
          {bracket.isPublished ? (
            <Button variant='ghost' size='sm' asChild>
              <Link href={`/playoffs/${bracket.id}`} target='_blank'>
                View public page
                <ExternalLink className='ml-1 size-4' />
              </Link>
            </Button>
          ) : null}
        </div>

        <div className='flex flex-wrap items-end gap-4'>
          <div className='flex min-w-64 flex-1 flex-col gap-1'>
            <h1 className='font-bold text-3xl'>{bracket.name}</h1>
            <p className='text-muted-foreground text-sm'>
              Named after its season automatically. Winners advance through the
              bracket from the scores you enter.
            </p>
          </div>
          <div className='flex flex-col gap-2'>
            <Label>Season</Label>
            <Select
              value={String(bracket.seasonId)}
              onValueChange={(value) =>
                updateBracket.mutate({
                  id: bracket.id,
                  seasonId: Number.parseInt(value, 10),
                })
              }
              disabled={updateBracket.isPending}
            >
              <SelectTrigger className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((season) => (
                  <SelectItem key={season.id} value={String(season.id)}>
                    {season.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label>Series</Label>
            <Select
              value={String(bracket.bestOf)}
              onValueChange={(value) =>
                updateBracket.mutate({
                  id: bracket.id,
                  bestOf: Number.parseInt(value, 10),
                })
              }
              disabled={updateBracket.isPending}
            >
              <SelectTrigger className='w-24'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BEST_OF_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    Bo{option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex flex-col gap-2'>
            <Label>Finals</Label>
            <Select
              value={
                bracket.finalsBestOf === null
                  ? 'same'
                  : String(bracket.finalsBestOf)
              }
              onValueChange={(value) =>
                updateBracket.mutate({
                  id: bracket.id,
                  finalsBestOf:
                    value === 'same' ? null : Number.parseInt(value, 10),
                })
              }
              disabled={updateBracket.isPending}
            >
              <SelectTrigger className='w-24'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='same'>Same</SelectItem>
                {BEST_OF_OPTIONS.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    Bo{option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-center gap-2 pb-2'>
            <Switch
              id='bracket-published'
              checked={bracket.isPublished}
              disabled={updateBracket.isPending}
              onCheckedChange={(checked) =>
                updateBracket.mutate({ id: bracket.id, isPublished: checked })
              }
            />
            <Label htmlFor='bracket-published'>Published</Label>
          </div>
        </div>

        <div className='grid gap-3 md:grid-cols-2'>
          <PlayerSearch
            onPick={(player) =>
              addPlayer({ name: player.name, playerId: player.discordId })
            }
          />
          <form onSubmit={handleManualAdd} className='flex items-start gap-2'>
            <Input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder='Or type any name…'
              aria-label='Add player by name'
            />
            <Button
              type='submit'
              variant='outline'
              disabled={!manualName.trim() || updateBracket.isPending}
            >
              <UserPlus className='mr-1.5 size-4' />
              Add
            </Button>
          </form>
        </div>
      </div>

      <AdminBracketBoard
        size={bracket.size}
        hasThirdPlace={bracket.hasThirdPlace}
        bestOf={bracket.bestOf}
        finalsBestOf={bracket.finalsBestOf}
        roster={roster}
        results={bracket.results}
        busy={updateBracket.isPending || setResult.isPending}
        onAssign={assign}
        onUnassign={unassign}
        onRemove={removeFromBracket}
        onSetScore={(round, slot, score1, score2) =>
          setResult.mutate({
            bracketId: bracket.id,
            round,
            slot,
            score1,
            score2,
          })
        }
      />
    </div>
  )
}
