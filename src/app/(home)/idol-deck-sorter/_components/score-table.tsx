'use client'

/**
 * Full per-card score breakdown for a computed sort: tier, total score, and
 * every sub-term `computeIdolSort` produces, expandable per row. The row
 * matching the current roll's winner gets the same gold treatment
 * `idol-roll-track.tsx` uses for the winning segment on the track above.
 */

import { Fragment, useState } from 'react'
import { CardChip, GOLD_BORDER, GOLD_TEXT } from '@/components/idol-roll-track'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  IdolSortContext,
  IdolSortEntry,
  IdolSortWeights,
} from '@/lib/idol-sort'
import type { IdolHitEntry } from '@/lib/log-source-parser'
import { cn } from '@/lib/utils'
import { FACE_RANKS, LOW_RANKS } from '@/shared/cards'

function slotKey(entry: { rank: string; suit: string }): string {
  return `${entry.rank}_${entry.suit}`
}

function fmt(n: number): string {
  return n.toFixed(3)
}

type DetailRow = { label: string; formula: string; value: number }

/**
 * Builds the "label / formula with the actual numbers plugged in / result"
 * rows for one entry's breakdown. Mirrors `computeIdolSort`'s math in
 * `idol-sort.ts` term-for-term — if that changes, this should too.
 */
function buildDetailRows(
  entry: IdolSortEntry,
  weights: IdolSortWeights,
  context: IdolSortContext | null
): DetailRow[] {
  const isFaceRank = (FACE_RANKS as readonly string[]).includes(entry.rank)
  const isLowRank = (LOW_RANKS as readonly string[]).includes(entry.rank)
  const qualityWeight =
    entry.tier === 'A' ? weights.wEditionA : weights.wEditionB
  const qualityWeightName = entry.tier === 'A' ? 'wEditionA' : 'wEditionB'

  const rows: DetailRow[] = [
    {
      label: 'Own count',
      formula: 'physical copies of exactly this rank and suit',
      value: entry.ownCount,
    },
    {
      label: 'Wild elsewhere',
      formula: 'Wild-enhanced copies of this rank in other suits',
      value: entry.wildElsewhere,
    },
    {
      label: 'Effective count',
      formula: `ownCount + wildElsewhere = ${entry.ownCount} + ${entry.wildElsewhere}`,
      value: entry.effectiveCount,
    },
    {
      label: 'Seal score',
      formula: 'Σ seal weight over each physical copy in this group',
      value: entry.sealScore,
    },
    {
      label: 'Edition + enhancement score',
      formula:
        'Σ (edition weight + enhancement weight) over each physical copy',
      value: entry.editionScore,
    },
    {
      label: 'Quality contribution',
      formula: `(sealScore + editionScore) × ${qualityWeightName} = (${fmt(entry.sealScore)} + ${fmt(entry.editionScore)}) × ${fmt(qualityWeight)}`,
      value: entry.editionContribution,
    },
    {
      label: 'Face-rank bonus',
      formula:
        isFaceRank && context
          ? `max(genFloor, wGen × 1.1 × max(0, facePool − faceBaseline)) = max(${fmt(weights.genFloor)}, ${fmt(weights.wGen)} × 1.1 × max(0, ${fmt(context.facePool)} − ${fmt(context.faceBaseline)}))`
          : 'not a face rank (J/Q/K/A) → 0',
      value: entry.faceScore,
    },
    {
      label: 'Low-rank bonus',
      formula:
        isLowRank && context
          ? `max(genFloor, wGen × max(0, lowPool − lowBaseline)) = max(${fmt(weights.genFloor)}, ${fmt(weights.wGen)} × max(0, ${fmt(context.lowPool)} − ${fmt(context.lowBaseline)}))`
          : 'not a low rank (2-5) → 0',
      value: entry.lowScore,
    },
  ]

  if (entry.tier === 'A') {
    rows.push(
      {
        label: 'Count bonus (Tier A)',
        formula: `wCountA × effectiveCount = ${fmt(weights.wCountA)} × ${entry.effectiveCount}`,
        value: entry.countBonus,
      },
      {
        label: 'Total score',
        formula: `countBonus + faceScore + lowScore + qualityContribution = ${fmt(entry.countBonus)} + ${fmt(entry.faceScore)} + ${fmt(entry.lowScore)} + ${fmt(entry.editionContribution)}`,
        value: entry.totalScore,
      }
    )
    return rows
  }

  rows.push(
    {
      label: 'Needed for Tier A',
      formula: `targetCopies − effectiveCount = ${weights.targetCopies} − ${entry.effectiveCount}`,
      value: entry.needed,
    },
    {
      label: 'Main hit',
      formula: `wMain × effectiveCount = ${fmt(weights.wMain)} × ${entry.effectiveCount}`,
      value: entry.mainHit,
    },
    {
      label: 'Convertible pool',
      formula:
        'same-rank, other-suit, non-wild physical copies that could suit-change onto this card',
      value: entry.convertiblePool,
    },
    {
      label: 'Off-suit hit',
      formula: `wOff × min(3, max(0, convertiblePool), needed) = ${fmt(weights.wOff)} × min(3, max(0, ${entry.convertiblePool}), ${entry.needed})`,
      value: entry.offHit,
    },
    {
      label: 'Strength neighbor count',
      formula:
        'physical + wild-elsewhere copies at the same-suit previous rank (the Strength target)',
      value: entry.neighborCount,
    },
    {
      label: 'Strength adjustment',
      formula: `wStr × min(2, neighborCount, needed) = ${fmt(weights.wStr)} × min(2, ${entry.neighborCount}, ${entry.needed})`,
      value: entry.strengthAdj,
    },
    {
      label: 'Total score',
      formula: `mainHit + offHit + strengthAdj + faceScore + lowScore + qualityContribution = ${fmt(entry.mainHit)} + ${fmt(entry.offHit)} + ${fmt(entry.strengthAdj)} + ${fmt(entry.faceScore)} + ${fmt(entry.lowScore)} + ${fmt(entry.editionContribution)}`,
      value: entry.totalScore,
    }
  )
  return rows
}

function DetailGrid({
  entry,
  weights,
  context,
}: {
  entry: IdolSortEntry
  weights: IdolSortWeights
  context: IdolSortContext | null
}) {
  const rows = buildDetailRows(entry, weights, context)

  return (
    <dl className='space-y-2 py-2 font-mono text-xs'>
      {rows.map((row) => (
        <div
          key={row.label}
          className='flex flex-col gap-0.5 border-border/40 border-b pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4'
        >
          <div>
            <dt className='text-foreground'>{row.label}</dt>
            <dd className='text-[10.5px] text-muted-foreground'>
              {row.formula}
            </dd>
          </div>
          <dd className='shrink-0 tabular-nums'>{fmt(row.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function ScoreTable({
  entries,
  winner,
  weights,
  context,
}: {
  entries: IdolSortEntry[]
  winner: IdolHitEntry | null
  weights: IdolSortWeights
  context: IdolSortContext | null
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())

  if (entries.length === 0) {
    return null
  }

  const toggle = (key: string) => {
    setExpandedKeys((previous) => {
      const next = new Set(previous)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className='w-10'>#</TableHead>
          <TableHead>Card</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead className='text-right'>Effective count</TableHead>
          <TableHead className='text-right'>Total score</TableHead>
          <TableHead className='w-16' />
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry, index) => {
          const key = slotKey(entry)
          const isWinner =
            winner != null &&
            winner.rank === entry.rank &&
            winner.suit === entry.suit
          const expanded = expandedKeys.has(key)

          return (
            <Fragment key={key}>
              <TableRow
                className={cn(
                  isWinner &&
                    cn(GOLD_BORDER, 'bg-[#a9741a]/10 dark:bg-[#ffcf5c]/10')
                )}
              >
                <TableCell className='text-muted-foreground tabular-nums'>
                  {index + 1}
                </TableCell>
                <TableCell>
                  <CardChip rank={entry.rank} suit={entry.suit} />
                </TableCell>
                <TableCell>
                  <Badge variant={entry.tier === 'A' ? 'default' : 'secondary'}>
                    Tier {entry.tier}
                  </Badge>
                </TableCell>
                <TableCell className='text-right tabular-nums'>
                  {entry.effectiveCount}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-right font-semibold tabular-nums',
                    isWinner && GOLD_TEXT
                  )}
                >
                  {entry.totalScore.toFixed(3)}
                </TableCell>
                <TableCell>
                  <button
                    type='button'
                    onClick={() => toggle(key)}
                    aria-expanded={expanded}
                    className='text-muted-foreground text-xs underline decoration-dotted underline-offset-4 hover:text-foreground'
                  >
                    {expanded ? 'Hide' : 'Details'}
                  </button>
                </TableCell>
              </TableRow>
              {expanded && (
                <TableRow>
                  <TableCell colSpan={6} className='bg-muted/30'>
                    <DetailGrid
                      entry={entry}
                      weights={weights}
                      context={context}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
