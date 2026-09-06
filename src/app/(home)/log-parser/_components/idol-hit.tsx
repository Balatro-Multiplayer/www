'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CardChip,
  EXPAND_TOGGLE_CLASS,
  FELT_BG,
  IdolRollTrack,
} from '@/components/idol-roll-track'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isWinningEntry, toRawIdolHitEntry } from '@/lib/idol-hit-geometry'
import type { IdolHit } from '@/lib/log-source-parser'
import { cn } from '@/lib/utils'

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

function IdolHitBlock({ hit, index }: { hit: IdolHit; index: number }) {
  const total = hit.cards.reduce((sum, entry) => sum + entry.count, 0)
  const winnerEntry = hit.cards.find((entry) =>
    isWinningEntry(entry, hit.winner)
  )
  const winnerCount = winnerEntry?.count ?? 0
  const pct = total > 0 ? (winnerCount / total) * 100 : 0
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

      <IdolRollTrack cards={hit.cards} winner={hit.winner} roll={hit.roll} />
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
