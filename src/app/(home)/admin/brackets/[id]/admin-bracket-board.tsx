'use client'

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { GripVertical, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ADMIN_SHEET, BracketSheet } from '@/app/_components/bracket-sheet'
import styles from '@/app/_components/bracket-view.module.css'
import { Badge } from '@/components/ui/badge'
import {
  type BracketResult,
  type BracketSize,
  type ComputedMatch,
  championOf,
  computeBracket,
  isValidSeriesScore,
  MAX_SCORE,
  type RosterEntry,
  rosterToSeeds,
  roundCount,
  seedNames,
  winsNeeded,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'

export type { RosterEntry }

type BoardProps = {
  size: BracketSize
  hasThirdPlace: boolean
  bestOf: number
  finalsBestOf: number | null
  roster: RosterEntry[]
  results: BracketResult[]
  busy: boolean
  /** Place `name` at `position` (parent swaps if the player was placed). */
  onAssign: (name: string, position: number) => void
  /** Send the player at `position` back to the pool. */
  onUnassign: (position: number) => void
  /** Remove a pool player from the bracket entirely. */
  onRemove: (name: string) => void
  onSetScore: (
    round: number,
    slot: number,
    score1: number | null,
    score2: number | null
  ) => void
}

/** Typing pauses this long before a score commits (blur/Enter commit now). */
const SCORE_COMMIT_DEBOUNCE_MS = 700
/** Pixels of movement before a press becomes a drag instead of a click. */
const DRAG_ACTIVATION_DISTANCE_PX = 4

function parseScore(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_SCORE)
    return undefined
  return parsed
}

/**
 * The admin's bracket: the same sheet layout the public sees, but live.
 * Drag pool chips onto first-round spots (or tap a chip, then a spot),
 * drag between spots to swap, and type scores straight into the cards.
 */
export function AdminBracketBoard({
  size,
  hasThirdPlace,
  bestOf,
  finalsBestOf,
  roster,
  results,
  busy,
  onAssign,
  onUnassign,
  onRemove,
  onSetScore,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null)
  // The sheet may render scaled; drag deltas arrive in screen pixels and
  // must be divided by the scale to move chips 1:1 with the cursor.
  const [boardScale, setBoardScale] = useState(1)
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  // Refs so debounced commits always read the latest drafts and latest
  // server results (never a stale closure), and pending timers can be
  // flushed per match.
  const draftsRef = useRef<Record<string, string>>(scoreDrafts)
  draftsRef.current = scoreDrafts
  const resultsRef = useRef(results)
  resultsRef.current = results
  const commitTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Fresh server results supersede local drafts: after any save (success or
  // failure triggers a refresh) the inputs show exactly what is stored.
  const serverResults = JSON.stringify(results)
  const lastResults = useRef(serverResults)
  if (lastResults.current !== serverResults) {
    lastResults.current = serverResults
    setScoreDrafts({})
  }

  // Debounce timers must not fire after unmount.
  useEffect(() => {
    const timers = commitTimers.current
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer)
      }
    }
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    })
  )

  const seeds = useMemo(() => rosterToSeeds(roster, size), [roster, size])
  const rounds = useMemo(
    () =>
      computeBracket(size, hasThirdPlace, seedNames(seeds), results, {
        bestOf,
        finalsBestOf,
      }),
    [size, hasThirdPlace, seeds, results, bestOf, finalsBestOf]
  )
  const totalRounds = roundCount(size)
  const champion = championOf(rounds)
  const pool = roster.filter((entry) => entry.position === null)

  // ---- Placement ----------------------------------------------------------

  function place(name: string, position: number) {
    setSelected(null)
    onAssign(name, position)
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId) return

    const fromPool = activeId.startsWith('pool:')
    const name = fromPool
      ? activeId.slice('pool:'.length)
      : (seeds[Number.parseInt(activeId.slice('slot:'.length), 10)]?.name ??
        null)
    if (!name) return

    if (overId === 'pool') {
      if (!fromPool) {
        onUnassign(Number.parseInt(activeId.slice('slot:'.length), 10))
      }
      return
    }
    place(name, Number.parseInt(overId.slice('slot:'.length), 10))
  }

  // ---- Scores -------------------------------------------------------------

  function draftValue(
    drafts: Record<string, string>,
    match: ComputedMatch,
    side: 1 | 2
  ): string {
    const key = `${match.round}:${match.slot}:${side}`
    if (key in drafts) return drafts[key] ?? ''
    const saved = side === 1 ? match.score1 : match.score2
    return saved === null ? '' : String(saved)
  }

  function scoreValue(match: ComputedMatch, side: 1 | 2): string {
    return draftValue(scoreDrafts, match, side)
  }

  function commitScores(match: ComputedMatch) {
    const timerKey = `${match.round}:${match.slot}`
    const pending = commitTimers.current[timerKey]
    if (pending) {
      clearTimeout(pending)
      delete commitTimers.current[timerKey]
    }
    // Read drafts AND the saved baseline through refs so a debounced commit
    // sees the latest keystrokes and compares against current server truth,
    // not whatever the timer's closure captured at typing time.
    const score1 = parseScore(draftValue(draftsRef.current, match, 1))
    const score2 = parseScore(draftValue(draftsRef.current, match, 2))
    if (score1 === undefined || score2 === undefined) {
      toast.error('Scores must be whole numbers (0–999)')
      return
    }
    const isGrandFinal = match.round === totalRounds && !match.isThirdPlace
    const seriesBestOf =
      isGrandFinal && finalsBestOf !== null ? finalsBestOf : bestOf
    if (!isValidSeriesScore(score1, score2, seriesBestOf)) {
      toast.error(
        `Impossible Bo${seriesBestOf} score — the series ends at ${winsNeeded(seriesBestOf)} wins.`
      )
      return
    }
    const saved = resultsRef.current.find(
      (result) => result.round === match.round && result.slot === match.slot
    )
    if (
      score1 === (saved?.score1 ?? null) &&
      score2 === (saved?.score2 ?? null)
    )
      return
    onSetScore(match.round, match.slot, score1, score2)
  }

  /** Save shortly after typing stops, so a reload can't eat a typed score. */
  function setScoreDraft(match: ComputedMatch, side: 1 | 2, value: string) {
    setScoreDrafts((prev) => ({
      ...prev,
      [`${match.round}:${match.slot}:${side}`]: value,
    }))
    const timerKey = `${match.round}:${match.slot}`
    const pending = commitTimers.current[timerKey]
    if (pending) clearTimeout(pending)
    commitTimers.current[timerKey] = setTimeout(() => {
      delete commitTimers.current[timerKey]
      commitScores(match)
    }, SCORE_COMMIT_DEBOUNCE_MS)
  }

  // ---- Pieces -------------------------------------------------------------

  function PoolChip({ entry }: { entry: RosterEntry }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
      useDraggable({ id: `pool:${entry.name}`, disabled: busy })
    return (
      <Badge
        ref={setNodeRef}
        variant='secondary'
        className={cn(
          'cursor-grab select-none gap-1 py-1 pr-1 pl-1.5 text-sm',
          selected === entry.name && 'ring-2 ring-primary',
          isDragging && 'opacity-50'
        )}
        style={
          transform
            ? {
                transform: `translate(${transform.x / boardScale}px, ${transform.y / boardScale}px)`,
                zIndex: 40,
                position: 'relative',
              }
            : undefined
        }
        {...attributes}
        {...listeners}
        onClick={() =>
          setSelected((current) => (current === entry.name ? null : entry.name))
        }
      >
        <GripVertical className='size-3 text-muted-foreground' />
        {entry.name}
        <button
          type='button'
          className='rounded-full p-0.5 transition-colors hover:bg-foreground/10'
          onClick={(e) => {
            e.stopPropagation()
            setSelected(null)
            onRemove(entry.name)
          }}
          aria-label={`Remove ${entry.name} from the bracket`}
        >
          <X className='size-3' />
        </button>
      </Badge>
    )
  }

  function PlacedChip({
    name,
    position,
    won,
  }: {
    name: string
    position: number
    won: boolean
  }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } =
      useDraggable({ id: `slot:${position}`, disabled: busy })
    return (
      <span
        ref={setNodeRef}
        className={cn(
          'flex min-w-0 flex-1 cursor-grab select-none items-center gap-1',
          isDragging && 'opacity-50'
        )}
        style={
          transform
            ? {
                transform: `translate(${transform.x / boardScale}px, ${transform.y / boardScale}px)`,
                zIndex: 40,
                position: 'relative',
              }
            : undefined
        }
        {...attributes}
        {...listeners}
      >
        <GripVertical className='size-3 shrink-0 text-[#8b93a7]' />
        <span
          className={cn(
            'truncate font-m6x11 text-lg text-white leading-6',
            won && styles.winnerName
          )}
          title={name}
        >
          {name}
        </span>
        <button
          type='button'
          className='ml-auto shrink-0 rounded p-0.5 text-[#8b93a7] transition-colors hover:text-white'
          onClick={(e) => {
            e.stopPropagation()
            onUnassign(position)
          }}
          aria-label={`Send ${name} back to the pool`}
        >
          <X className='size-3.5' />
        </button>
      </span>
    )
  }

  function SeedSlot({
    position,
    outcome,
  }: {
    position: number
    outcome: 'won' | 'lost' | null
  }) {
    const occupant = seeds[position]
    const { setNodeRef, isOver } = useDroppable({ id: `slot:${position}` })
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: becomes a button-role target only while a player is selected for placement
      <div
        ref={setNodeRef}
        role={selected ? 'button' : undefined}
        tabIndex={selected ? 0 : undefined}
        className={cn(
          'flex min-h-9 items-center gap-2 px-2.5 py-1.5',
          styles.playerBox,
          outcome === 'lost' && 'opacity-50',
          isOver && 'ring-2 ring-primary',
          selected && 'cursor-pointer'
        )}
        onClick={() => {
          if (selected) place(selected, position)
        }}
        onKeyDown={(e) => {
          if (selected && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            place(selected, position)
          }
        }}
      >
        {occupant ? (
          <PlacedChip
            name={occupant.name}
            position={position}
            won={outcome === 'won'}
          />
        ) : (
          <span
            className={cn(
              'font-m6x11 text-[#8b93a7] text-lg leading-6',
              selected && 'text-primary'
            )}
          >
            {selected ? `Place ${selected} here` : 'Open spot'}
          </span>
        )}
      </div>
    )
  }

  function ScoreInput({ match, side }: { match: ComputedMatch; side: 1 | 2 }) {
    const playersKnown = match.player1 !== null && match.player2 !== null
    return (
      <input
        value={scoreValue(match, side)}
        onChange={(e) => setScoreDraft(match, side, e.target.value)}
        onBlur={() => commitScores(match)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitScores(match)
        }}
        // Deliberately NOT disabled by `busy`: score saves are per-match and
        // independent, and a shared lock would drop focus/keystrokes when
        // hopping between matches while a save is in flight.
        disabled={!playersKnown}
        inputMode='numeric'
        aria-label={`Score for ${
          (side === 1 ? match.player1 : match.player2) ?? 'TBD'
        }`}
        placeholder='-'
        className={cn(
          'w-9 shrink-0 rounded-md border-0 px-1 pt-0.5 text-center font-m6x11 text-base leading-5 outline-none focus:ring-2 focus:ring-primary disabled:opacity-40',
          scoreValue(match, side) === '' ? styles.chipEmpty : styles.chip
        )}
      />
    )
  }

  function DerivedRow({
    match,
    side,
    mirrored,
  }: {
    match: ComputedMatch
    side: 1 | 2
    mirrored: boolean
  }) {
    const name = side === 1 ? match.player1 : match.player2
    const winner = match.winner === side
    const loser = match.winner !== null && match.winner !== side
    return (
      <div
        className={cn(
          'flex min-h-9 items-center justify-between gap-2 px-2.5 py-1.5',
          styles.playerBox,
          mirrored && 'flex-row-reverse',
          loser && 'opacity-50'
        )}
      >
        <span
          className={cn(
            'truncate font-m6x11 text-lg text-white leading-6',
            !name && 'text-[#8b93a7]',
            winner && styles.winnerName
          )}
          title={name ?? undefined}
        >
          {name ?? 'TBD'}
        </span>
        <ScoreInput match={match} side={side} />
      </div>
    )
  }

  function AdminMatchCard({
    match,
    mirrored = false,
  }: {
    match: ComputedMatch
    mirrored?: boolean
  }) {
    const seatOutcome = (side: 1 | 2): 'won' | 'lost' | null =>
      match.winner === null ? null : match.winner === side ? 'won' : 'lost'
    return (
      <div className={cn('w-full', styles.card)}>
        {match.round === 1 ? (
          <>
            <div className='flex items-center gap-1'>
              <div className='min-w-0 flex-1'>
                <SeedSlot position={2 * match.slot} outcome={seatOutcome(1)} />
              </div>
              <ScoreInput match={match} side={1} />
            </div>
            <div className='flex items-center gap-1'>
              <div className='min-w-0 flex-1'>
                <SeedSlot
                  position={2 * match.slot + 1}
                  outcome={seatOutcome(2)}
                />
              </div>
              <ScoreInput match={match} side={2} />
            </div>
          </>
        ) : (
          <>
            <DerivedRow match={match} side={1} mirrored={mirrored} />
            <DerivedRow match={match} side={2} mirrored={mirrored} />
          </>
        )}
      </div>
    )
  }

  function Pool() {
    const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-12 flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2.5',
          isOver && 'ring-2 ring-primary'
        )}
      >
        {pool.length > 0 ? (
          pool.map((entry) => <PoolChip key={entry.name} entry={entry} />)
        ) : (
          <span className='text-muted-foreground text-sm'>
            Pool is empty — add players above, or drag someone off the bracket
            to unseat them.
          </span>
        )}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className='flex flex-col gap-4'>
        <Pool />
        <p className='text-muted-foreground text-sm'>
          Drag players onto spots (or tap a player, then a spot). Drag between
          spots to swap. Type scores right on the cards — they save when you
          click away.
        </p>
        <BracketSheet
          size={size}
          rounds={rounds}
          columnWidth={ADMIN_SHEET.columnWidth}
          slotHeight={ADMIN_SHEET.slotHeight}
          championWon={champion !== null}
          championContent={
            <span
              className={cn(
                'truncate pt-0.5 font-m6x11 text-xl',
                champion ? 'text-[#f5c452]' : 'text-[#8b93a7] text-lg'
              )}
            >
              {champion ?? 'TBD'}
            </span>
          }
          renderMatch={(match, { mirrored }) => (
            <AdminMatchCard match={match} mirrored={mirrored} />
          )}
          onScaleChange={setBoardScale}
        />
      </div>
    </DndContext>
  )
}
