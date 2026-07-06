'use client'

import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { startTransition, useState } from 'react'
import { toast } from 'sonner'
import { BracketView } from '@/app/_components/bracket-view'
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
import { Textarea } from '@/components/ui/textarea'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  computeBracket,
  matchLabel,
  roundCount,
  type SeedEntry,
  seedNames,
  seedPlayerLinks,
} from '@/lib/bracket'
import { api } from '@/trpc/react'
import type { SeasonOption } from '../brackets-client'
import { formatSeedLines, parseSeedLines } from '../seed-lines'

export type BracketDetail = {
  id: number
  name: string
  seasonId: number | null
  size: BracketSize
  hasThirdPlace: boolean
  isPublished: boolean
  seeds: (SeedEntry | null)[]
  results: BracketResult[]
}

type ScoreDraft = { score1: string; score2: string }

function draftKey(round: number, slot: number) {
  return `${round}:${slot}`
}

function initialDrafts(results: BracketResult[]) {
  const drafts: Record<string, ScoreDraft> = {}
  for (const result of results) {
    drafts[draftKey(result.round, result.slot)] = {
      score1: result.score1 === null ? '' : String(result.score1),
      score2: result.score2 === null ? '' : String(result.score2),
    }
  }
  return drafts
}

function parseScore(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) return undefined
  return parsed
}

export function BracketDetailClient({
  bracket,
  seasons,
}: {
  bracket: BracketDetail
  seasons: SeasonOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(bracket.name)
  const [seedsText, setSeedsText] = useState(formatSeedLines(bracket.seeds))
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>(() =>
    initialDrafts(bracket.results)
  )

  const refresh = () => startTransition(() => router.refresh())

  const updateBracket = api.brackets.update.useMutation({
    onSuccess: () => {
      toast.success('Bracket updated')
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })

  const setResult = api.brackets.setResult.useMutation({
    onSuccess: () => refresh(),
    onError: (err) => toast.error(err.message),
  })

  const names = seedNames(bracket.seeds)
  const rounds = computeBracket(
    bracket.size,
    bracket.hasThirdPlace,
    names,
    bracket.results
  )
  const totalRounds = roundCount(bracket.size)

  function draftFor(match: ComputedMatch): ScoreDraft {
    return (
      drafts[draftKey(match.round, match.slot)] ?? { score1: '', score2: '' }
    )
  }

  function setDraft(match: ComputedMatch, patch: Partial<ScoreDraft>) {
    const key = draftKey(match.round, match.slot)
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? { score1: '', score2: '' }), ...patch },
    }))
  }

  function isDirty(match: ComputedMatch): boolean {
    const draft = draftFor(match)
    const saved1 = match.score1 === null ? '' : String(match.score1)
    const saved2 = match.score2 === null ? '' : String(match.score2)
    return draft.score1.trim() !== saved1 || draft.score2.trim() !== saved2
  }

  function saveResult(match: ComputedMatch) {
    const draft = draftFor(match)
    const score1 = parseScore(draft.score1)
    const score2 = parseScore(draft.score2)
    if (score1 === undefined || score2 === undefined) {
      toast.error('Scores must be whole numbers (0–999)')
      return
    }
    setResult.mutate({
      bracketId: bracket.id,
      round: match.round,
      slot: match.slot,
      score1,
      score2,
    })
  }

  function saveSeeds() {
    const seeds = parseSeedLines(seedsText)
    if (seeds.filter((seed) => seed.name).length > bracket.size) {
      toast.error(`Too many players for a ${bracket.size}-player bracket`)
      return
    }
    // Pad/truncate to the bracket size so positions stay aligned to lines.
    const padded = Array.from(
      { length: bracket.size },
      (_, i) => seeds[i] ?? { name: '', playerId: null }
    )
    updateBracket.mutate({ id: bracket.id, seeds: padded })
  }

  return (
    <div className='flex flex-col gap-8'>
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
          <div className='flex min-w-64 flex-1 flex-col gap-2'>
            <Label htmlFor='bracket-name'>Name</Label>
            <Input
              id='bracket-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            variant='outline'
            disabled={
              updateBracket.isPending ||
              !name.trim() ||
              name.trim() === bracket.name
            }
            onClick={() =>
              updateBracket.mutate({ id: bracket.id, name: name.trim() })
            }
          >
            Rename
          </Button>
          <div className='flex flex-col gap-2'>
            <Label>Season</Label>
            <Select
              value={
                bracket.seasonId === null ? 'none' : String(bracket.seasonId)
              }
              onValueChange={(value) =>
                updateBracket.mutate({
                  id: bracket.id,
                  seasonId:
                    value === 'none' ? null : Number.parseInt(value, 10),
                })
              }
              disabled={updateBracket.isPending}
            >
              <SelectTrigger className='w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='none'>No season</SelectItem>
                {seasons.map((season) => (
                  <SelectItem key={season.id} value={String(season.id)}>
                    {season.name}
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
      </div>

      <div className='grid gap-8 lg:grid-cols-[280px_1fr]'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='bracket-seeds'>
            Players (one per line, seed order)
          </Label>
          <Textarea
            id='bracket-seeds'
            value={seedsText}
            onChange={(e) => setSeedsText(e.target.value)}
            rows={bracket.size + 1}
            className='font-mono text-sm'
          />
          <Button
            variant='outline'
            onClick={saveSeeds}
            disabled={updateBracket.isPending}
          >
            Save Players
          </Button>
          <p className='text-muted-foreground text-xs'>
            Line number = seed position. Keep a line blank for TBD. Optionally
            link a player profile with a pipe: <code>Name | discord id</code>{' '}
            (powers profile champion badges). Changing players does not clear
            entered scores.
          </p>
        </div>

        <div className='flex flex-col gap-6'>
          {rounds.map((round) => (
            <div key={round.round} className='flex flex-col gap-2'>
              <h3 className='font-semibold text-sm'>{round.label}</h3>
              <div className='flex flex-col divide-y rounded-lg border'>
                {round.matches.map((match) => {
                  const draft = draftFor(match)
                  const playersKnown =
                    match.player1 !== null && match.player2 !== null
                  return (
                    <div
                      key={draftKey(match.round, match.slot)}
                      className='flex flex-wrap items-center gap-2 px-3 py-2'
                    >
                      <span className='w-32 shrink-0 text-muted-foreground text-xs'>
                        {matchLabel(match, totalRounds)}{' '}
                        {match.round < totalRounds ? `#${match.slot + 1}` : ''}
                      </span>
                      <span className='min-w-28 flex-1 truncate text-right text-sm'>
                        {match.player1 ?? <em className='opacity-60'>TBD</em>}
                      </span>
                      <Input
                        className='w-14 text-center'
                        inputMode='numeric'
                        value={draft.score1}
                        disabled={!playersKnown}
                        onChange={(e) =>
                          setDraft(match, { score1: e.target.value })
                        }
                        aria-label='Score for player 1'
                      />
                      <span className='text-muted-foreground text-xs'>–</span>
                      <Input
                        className='w-14 text-center'
                        inputMode='numeric'
                        value={draft.score2}
                        disabled={!playersKnown}
                        onChange={(e) =>
                          setDraft(match, { score2: e.target.value })
                        }
                        aria-label='Score for player 2'
                      />
                      <span className='min-w-28 flex-1 truncate text-sm'>
                        {match.player2 ?? <em className='opacity-60'>TBD</em>}
                      </span>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={
                          !playersKnown ||
                          !isDirty(match) ||
                          setResult.isPending
                        }
                        onClick={() => saveResult(match)}
                      >
                        Save
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className='flex flex-col gap-3'>
        <h2 className='font-semibold text-lg'>Preview</h2>
        <BracketView
          bracket={{
            size: bracket.size,
            hasThirdPlace: bracket.hasThirdPlace,
            seeds: names,
            results: bracket.results,
          }}
          playerLinks={seedPlayerLinks(bracket.seeds)}
        />
      </div>
    </div>
  )
}
