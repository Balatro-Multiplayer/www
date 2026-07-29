'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  computeHitBoundaries,
  computeIdolHitWindow,
  computeLabelPlacement,
  type IdolHitBoundary,
  isWinningEntry,
  NARROW_SEGMENT_THRESHOLD,
  suitGlyph,
  toRawIdolHitEntry,
} from '@/lib/idol-hit-geometry'
import type { IdolHit, IdolHitEntry } from '@/lib/log-source-parser'
import { cn } from '@/lib/utils'

const SUIT_TEXT_CLASS: Record<string, string> = {
  H: 'text-[#ff4d55]',
  D: 'text-[#ff9a2e]',
  C: 'text-[#37bd76]',
  S: 'text-[#cdd8e0]',
}

const GOLD_TEXT = 'text-[#a9741a] dark:text-[#ffcf5c]'
const GOLD_BORDER = 'border-[#a9741a] dark:border-[#ffcf5c]'
const GOLD_BG = 'bg-[#a9741a] dark:bg-[#ffcf5c]'
const FELT_BG = 'bg-[#0c1a13] dark:bg-[#081410]'
const FELT_LINE_BG = 'bg-[#1b2c22] dark:bg-[#16261d]'

const TINY_SEGMENT_THRESHOLD = 0.11

/** Above this many card entries, the number line switches to a windowed view centered on the winner. */
const MAX_INLINE_SEGMENTS = 12
/**
 * Expanded view width is scaled per COUNT UNIT, not per card. Sizing per card
 * would need a min-width floor, which inflates low-count slices past their
 * proportional share and pushes the caret out of the winning segment. One
 * pixel budget per unit of odds keeps every slice exactly proportional, so a
 * count-1 slice is still this wide and the geometry stays honest.
 */
const EXPANDED_PX_PER_COUNT = 40

function suitTextClass(suit: string): string {
  return SUIT_TEXT_CLASS[suit] ?? 'text-slate-300'
}

function cardLabel(rank: string, suit: string): string {
  return `${rank}${suitGlyph(suit)}`
}

function CardChip({ rank, suit }: { rank: string; suit: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-px rounded-[7px] px-2 py-0.5 font-extrabold font-mono text-sm text-white',
        FELT_BG
      )}
    >
      <span className={suitTextClass(suit)}>{cardLabel(rank, suit)}</span>
    </span>
  )
}

function IdolHitSegment({
  entry,
  total,
  won,
  sizingTotal,
}: {
  entry: IdolHitEntry
  total: number
  won: boolean
  /** Total used only to size the label text (defaults to `total`); lets a zoomed window size text by the visible proportion rather than the full-list proportion. */
  sizingTotal?: number
}) {
  const effectiveTotal = sizingTotal ?? total
  const frac = effectiveTotal > 0 ? entry.count / effectiveTotal : 0
  const narrow = frac < NARROW_SEGMENT_THRESHOLD
  const tiny = frac < TINY_SEGMENT_THRESHOLD

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-[7px] border',
        'min-w-0',
        won
          ? cn(
              GOLD_BORDER,
              'bg-gradient-to-b from-[#a9741a]/25 to-[#14261c] shadow-[0_0_0_1px_#a9741a,0_0_18px_rgba(183,121,31,.35)]',
              'dark:from-[#ffcf5c]/25 dark:to-[#10231a] dark:shadow-[0_0_0_1px_#ffcf5c,0_0_18px_rgba(255,207,92,.28)]'
            )
          : cn('border-[#0c1a13] dark:border-[#081410]', FELT_LINE_BG)
      )}
      // flexBasis 0 is load-bearing: with the default `auto` each segment would
      // start at its text width and only share the leftover space, so low-count
      // slices came out too wide and the caret could sit outside the winning
      // segment. Basis 0 makes width purely proportional to the odds.
      style={{ flexGrow: entry.count, flexBasis: 0 }}
      title={`${cardLabel(entry.rank, entry.suit)} · ${entry.count} of ${total}`}
    >
      <span
        className={cn(
          'font-extrabold font-mono leading-none',
          tiny ? 'text-xs' : 'text-[17px]',
          suitTextClass(entry.suit)
        )}
      >
        {cardLabel(entry.rank, entry.suit)}
      </span>
      {!narrow && (
        <span
          className={cn(
            'mt-1 font-mono text-[10.5px] tabular-nums tracking-wide',
            won ? GOLD_TEXT : 'text-muted-foreground'
          )}
        >
          ×{entry.count}
        </span>
      )}
    </div>
  )
}

function IdolHitElidedBand({ count }: { count: number }) {
  return (
    <div
      className='relative flex min-w-[34px] flex-none items-center justify-center overflow-hidden rounded-[7px] border border-transparent bg-muted/70'
      style={{ flexGrow: 0.4, flexBasis: 34 }}
      title={`${count} more card${count === 1 ? '' : 's'} not shown`}
    >
      <span className='font-mono text-[11px] text-muted-foreground tabular-nums'>
        +{count}
      </span>
    </div>
  )
}

function IdolHitCaret({
  position,
  label,
}: {
  /** 0-100 position within the segments box (see the `relative` container each track wraps
   * only its card segments in — never the felt row's padding or any elided band). */
  position: number
  label: string
}) {
  const clamped = Math.min(100, Math.max(0, position))

  return (
    <div
      className='pointer-events-none absolute bottom-full mb-1 flex -translate-x-1/2 flex-col items-center'
      style={{ left: `${clamped}%` }}
    >
      <span
        className={cn(
          'whitespace-nowrap rounded-full border px-1.5 py-px font-extrabold font-mono text-[11px] tabular-nums',
          GOLD_BORDER,
          GOLD_TEXT,
          FELT_BG
        )}
      >
        {label}
      </span>
      <span className={cn('h-2 w-0.5', GOLD_BG)} />
      <span
        className={cn(
          '-mt-px h-0 w-0 border-x-[6px] border-x-transparent border-t-8',
          'border-t-[#a9741a] dark:border-t-[#ffcf5c]'
        )}
      />
    </div>
  )
}

function IdolHitBoundaryRow({
  boundaries,
  trackWidthPx,
}: {
  boundaries: IdolHitBoundary[]
  /** Actual rendered track width in px, when known (expanded view) — see computeLabelPlacement. */
  trackWidthPx?: number
}) {
  if (boundaries.length === 0) {
    return null
  }

  const placement = computeLabelPlacement(boundaries, trackWidthPx)
  const lastIndex = boundaries.length - 1

  return (
    <div className='pointer-events-none absolute inset-x-0 top-full mt-2'>
      {boundaries.map((boundary, boundaryIndex) => {
        const showLabel = placement.shown.has(boundaryIndex)
        const isStaggered = placement.staggered.has(boundaryIndex)
        // The two end boundaries (0.00 / 1.00) sit exactly at the track's edges — centering
        // their label on the tick (as every interior label does) would push half the text
        // past the container edge and clip it. Anchor them to grow inward instead: the first
        // label's left edge sits at the tick, the last label's right edge sits at the tick.
        // The tick itself always stays centered on the boundary position (see the separate
        // tick span below), so this only affects label text, never the geometry it annotates.
        const labelTranslateClass =
          boundaryIndex === 0
            ? 'translate-x-0'
            : boundaryIndex === lastIndex
              ? '-translate-x-full'
              : '-translate-x-1/2'

        return (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: boundaries derive from card array order
            key={`boundary-${boundaryIndex}`}
            className='absolute top-0'
            style={{ left: `${boundary.position}%` }}
          >
            <span
              className={cn(
                'absolute top-0 h-1.5 w-px -translate-x-1/2',
                boundary.isWinnerEdge ? GOLD_BG : 'bg-border'
              )}
            />
            {showLabel && (
              <span
                className={cn(
                  'absolute whitespace-nowrap font-mono text-[10px] tabular-nums',
                  isStaggered ? 'top-[18px]' : 'top-2',
                  labelTranslateClass,
                  boundary.isWinnerEdge
                    ? cn(GOLD_TEXT, 'font-bold')
                    : 'text-muted-foreground'
                )}
              >
                {boundary.frac.toFixed(2)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const EXPAND_TOGGLE_CLASS = cn(
  'rounded-[6px] px-1.5 py-1 font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-4',
  'hover:text-foreground focus-visible:text-foreground focus-visible:outline-none',
  'focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[#a9741a] dark:focus-visible:ring-[#ffcf5c]'
)

type CopyStatus = 'idle' | 'copied' | 'failed'

const COPY_RESET_MS = 2000

/**
 * Quiet utility button that copies `text` to the clipboard. Tracks its own
 * copied/failed feedback + reset timer, so N instances on one page (one per
 * hit, plus a card-level "Copy all") never share or clobber each other's state.
 */
function CopyButton({
  text,
  idleLabel,
  ariaLabel,
  className,
}: {
  text: string
  idleLabel: string
  ariaLabel: string
  className?: string
}) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current)
      }
    }
  }, [])

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    if (resetTimer.current) {
      clearTimeout(resetTimer.current)
    }
    resetTimer.current = setTimeout(() => setStatus('idle'), COPY_RESET_MS)
  }

  const label =
    status === 'copied'
      ? 'Copied'
      : status === 'failed'
        ? 'Copy failed'
        : idleLabel

  return (
    <button
      type='button'
      onClick={handleClick}
      aria-label={ariaLabel}
      className={cn(EXPAND_TOGGLE_CLASS, className)}
    >
      {label}
    </button>
  )
}

/** The unmodified, always-fully-visible card track — used when the list is small enough to fit inline. */
function IdolHitTrack({
  cards,
  total,
  winner,
  roll,
}: {
  cards: IdolHitEntry[]
  total: number
  winner: IdolHit['winner']
  roll: number | null
}) {
  const boundaries = computeHitBoundaries(cards, winner)

  return (
    <div className='pt-8 pb-6'>
      <div
        className={cn('flex gap-0 rounded-[10px] p-1', FELT_BG)}
        style={{
          height: 62,
          boxShadow: 'inset 0 2px 10px rgba(0,0,0,.45)',
        }}
      >
        {/* Positioning context for the caret + boundary row: exactly the segments' box, so
         * 0%-100% maps precisely onto the odds range (never the felt row's p-1 padding). */}
        <div className='relative flex min-w-0 flex-1 gap-0'>
          {roll != null && (
            <IdolHitCaret position={roll * 100} label={roll.toFixed(2)} />
          )}

          {cards.map((entry, entryIndex) => (
            <IdolHitSegment
              // biome-ignore lint/suspicious/noArrayIndexKey: card entries have no stable id
              key={`${entry.rank}-${entry.suit}-${entryIndex}`}
              entry={entry}
              total={total}
              won={isWinningEntry(entry, winner)}
            />
          ))}

          <IdolHitBoundaryRow boundaries={boundaries} />
        </div>
      </div>
    </div>
  )
}

/** A windowed number line zoomed on the winner, with elided-card bands on either side. */
function IdolHitWindowedTrack({
  cards,
  total,
  winner,
  roll,
  onExpand,
}: {
  cards: IdolHitEntry[]
  total: number
  winner: IdolHit['winner']
  roll: number | null
  onExpand: () => void
}) {
  const hitWindow = computeIdolHitWindow(cards, winner)
  const boundaries = computeHitBoundaries(cards, winner, {
    start: hitWindow.sliceStart,
    end: hitWindow.sliceEnd,
    lo: hitWindow.windowLo,
    hi: hitWindow.windowHi,
  })
  const span = hitWindow.windowHi - hitWindow.windowLo || 1
  const caretPosition =
    roll != null
      ? Math.min(100, Math.max(0, ((roll - hitWindow.windowLo) / span) * 100))
      : null

  return (
    <div>
      <div className='pt-8 pb-6'>
        <div
          className={cn('flex gap-0 rounded-[10px] p-1', FELT_BG)}
          style={{
            height: 62,
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,.45)',
          }}
        >
          {hitWindow.beforeCount > 0 && (
            <IdolHitElidedBand count={hitWindow.beforeCount} />
          )}

          {/* Positioning context for the caret + boundary row: exactly the segments' box —
           * the elided bands flank it but sit outside, so 0%-100% still maps onto
           * [windowLo, windowHi] only, never the bands' width. */}
          <div className='relative flex min-w-0 flex-1 gap-0'>
            {roll != null && caretPosition != null && (
              <IdolHitCaret position={caretPosition} label={roll.toFixed(2)} />
            )}

            {hitWindow.windowEntries.map((entry, entryIndex) => (
              <IdolHitSegment
                // biome-ignore lint/suspicious/noArrayIndexKey: card entries have no stable id
                key={`${entry.rank}-${entry.suit}-${entryIndex}`}
                entry={entry}
                total={total}
                sizingTotal={hitWindow.windowTotal}
                won={isWinningEntry(entry, winner)}
              />
            ))}

            <IdolHitBoundaryRow boundaries={boundaries} />
          </div>

          {hitWindow.afterCount > 0 && (
            <IdolHitElidedBand count={hitWindow.afterCount} />
          )}
        </div>
      </div>

      <button
        type='button'
        onClick={onExpand}
        className={EXPAND_TOGGLE_CLASS}
        aria-label={`Show all ${cards.length} cards`}
      >
        Show all {cards.length} cards
      </button>
    </div>
  )
}

/** The full card list, all segments, inside a horizontally-scrolling container so it stays readable. */
function IdolHitExpandedTrack({
  cards,
  total,
  winner,
  roll,
  onCollapse,
}: {
  cards: IdolHitEntry[]
  total: number
  winner: IdolHit['winner']
  roll: number | null
  onCollapse: () => void
}) {
  const boundaries = computeHitBoundaries(cards, winner)
  // Width is deterministic here (min-width is set from this same product below),
  // so the real px gap can be used for label collision instead of a %-of-width guess.
  const trackWidthPx = total * EXPANDED_PX_PER_COUNT
  const winnerIndex = cards.findIndex((entry) => isWinningEntry(entry, winner))
  const scrollRef = useRef<HTMLDivElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount (expand), not on every render
  useEffect(() => {
    const container = scrollRef.current
    if (!container || winnerIndex < 0) {
      return
    }
    // Centre on the winning slice, measured in count units so it matches the
    // proportional layout above.
    const countBefore = cards
      .slice(0, winnerIndex)
      .reduce((sum, entry) => sum + entry.count, 0)
    const winnerCount = cards[winnerIndex]?.count ?? 0
    const target =
      (countBefore + winnerCount / 2) * EXPANDED_PX_PER_COUNT -
      container.clientWidth / 2
    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth)
    container.scrollLeft = Math.min(Math.max(target, 0), maxScroll)
  }, [])

  return (
    <div>
      <div className='overflow-x-auto overflow-y-visible' ref={scrollRef}>
        <div className='pt-8 pb-14' style={{ minWidth: trackWidthPx }}>
          <div
            className={cn('flex gap-0 rounded-[10px] p-1', FELT_BG)}
            style={{
              height: 62,
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,.45)',
            }}
          >
            {/* Positioning context for the caret + boundary row: exactly the segments' box
             * (no bands here, but still inset from the felt row's p-1 padding). */}
            <div className='relative flex min-w-0 flex-1 gap-0'>
              {roll != null && (
                <IdolHitCaret position={roll * 100} label={roll.toFixed(2)} />
              )}

              {cards.map((entry, entryIndex) => (
                <IdolHitSegment
                  // biome-ignore lint/suspicious/noArrayIndexKey: card entries have no stable id
                  key={`${entry.rank}-${entry.suit}-${entryIndex}`}
                  entry={entry}
                  total={total}
                  won={isWinningEntry(entry, winner)}
                />
              ))}

              <IdolHitBoundaryRow
                boundaries={boundaries}
                trackWidthPx={trackWidthPx}
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type='button'
        onClick={onCollapse}
        className={cn(EXPAND_TOGGLE_CLASS, 'mt-2')}
        aria-label='Collapse card list'
      >
        Collapse
      </button>
    </div>
  )
}

function IdolHitBlock({ hit, index }: { hit: IdolHit; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const total = hit.cards.reduce((sum, entry) => sum + entry.count, 0)
  const winnerEntry = hit.cards.find((entry) =>
    isWinningEntry(entry, hit.winner)
  )
  const winnerCount = winnerEntry?.count ?? 0
  const pct = total > 0 ? (winnerCount / total) * 100 : 0
  const isLargeHit = hit.cards.length > MAX_INLINE_SEGMENTS
  const hitJson = useMemo(
    () => JSON.stringify(toRawIdolHitEntry(hit), null, 2),
    [hit]
  )

  return (
    <div className='rounded-2xl border bg-card p-4 pb-5 shadow-sm sm:p-[18px] sm:pb-[22px]'>
      <div className='mb-4 flex flex-wrap items-baseline justify-between gap-3'>
        <span className='block font-semibold text-[11.5px] text-muted-foreground uppercase tracking-[.12em]'>
          {`Hit ${index + 1}`}
        </span>
        <span className='inline-flex flex-wrap items-center justify-end gap-2 text-[13.5px] text-muted-foreground'>
          <span>Winner</span>
          <CardChip rank={hit.winner.rank} suit={hit.winner.suit} />
          {hit.roll != null && (
            <span>
              · landed{' '}
              <span className='font-bold text-foreground tabular-nums'>
                {hit.roll.toFixed(2)}
              </span>
            </span>
          )}
          <span>
            ·{' '}
            <span className='font-bold text-foreground tabular-nums'>
              {winnerCount}
            </span>
            -in-
            <span className='font-bold text-foreground tabular-nums'>
              {total}
            </span>{' '}
            ({pct.toFixed(0)}%)
          </span>
          <CopyButton
            text={hitJson}
            idleLabel='Copy'
            ariaLabel={`Copy hit ${index + 1} as JSON`}
          />
        </span>
      </div>

      {isLargeHit && !expanded && (
        <IdolHitWindowedTrack
          cards={hit.cards}
          total={total}
          winner={hit.winner}
          roll={hit.roll}
          onExpand={() => setExpanded(true)}
        />
      )}
      {isLargeHit && expanded && (
        <IdolHitExpandedTrack
          cards={hit.cards}
          total={total}
          winner={hit.winner}
          roll={hit.roll}
          onCollapse={() => setExpanded(false)}
        />
      )}
      {!isLargeHit && (
        <IdolHitTrack
          cards={hit.cards}
          total={total}
          winner={hit.winner}
          roll={hit.roll}
        />
      )}
    </div>
  )
}

function IdolHitRawOutput({ hits }: { hits: IdolHit[] }) {
  const [expanded, setExpanded] = useState(false)

  const rawJson = useMemo(
    () => JSON.stringify(hits.map(toRawIdolHitEntry), null, 2),
    [hits]
  )

  return (
    <div className='pt-1'>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls='idol-hit-raw-output'
          className={EXPAND_TOGGLE_CLASS}
        >
          Raw output
        </button>
        <CopyButton
          text={rawJson}
          idleLabel='Copy all'
          ariaLabel='Copy all hits as JSON'
        />
      </div>
      {expanded && (
        <pre
          id='idol-hit-raw-output'
          className={cn(
            'mt-2 max-h-[320px] overflow-x-auto overflow-y-auto whitespace-pre rounded-[10px] p-3 font-mono text-[11px] text-slate-100',
            FELT_BG
          )}
        >
          {rawJson}
        </pre>
      )}
    </div>
  )
}

export function IdolHitCard({ hits }: { hits?: IdolHit[] }) {
  const [open, setOpen] = useState(false)

  // `hits` can be missing entirely: parses stored before this feature existed
  // are rendered straight from the database with no `idolHits` key.
  if (!hits || hits.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <button
          type='button'
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-controls='idol-hits-body'
          className='flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a9741a] dark:focus-visible:ring-[#ffcf5c]'
        >
          <CardTitle className='text-lg'>
            Idol Hits{' '}
            <span className='font-normal text-muted-foreground text-sm tabular-nums'>
              ({hits.length})
            </span>
          </CardTitle>
          <span className='font-mono text-muted-foreground text-xs'>
            {open ? 'Hide' : 'Show'}
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent id='idol-hits-body' className='space-y-4'>
          {hits.map((hit, index) => (
            <IdolHitBlock
              // biome-ignore lint/suspicious/noArrayIndexKey: hits have no stable id
              key={`idol-hit-${index}`}
              hit={hit}
              index={index}
            />
          ))}
          <IdolHitRawOutput hits={hits} />
        </CardContent>
      )}
    </Card>
  )
}
