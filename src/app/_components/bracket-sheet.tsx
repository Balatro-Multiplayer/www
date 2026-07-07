'use client'

import { useEffect } from 'react'
import {
  type BracketSize,
  type ComputedMatch,
  type ComputedRound,
  matchLabel,
  roundCount,
} from '@/lib/bracket'
import { cn } from '@/lib/utils'
import styles from './bracket-view.module.css'
import { FitToWidth, useContainerWidth } from './fit-to-width'

/**
 * The one place that knows the playoff-sheet geometry. Both the public view
 * and the admin board render through it, supplying only their match card.
 */

/**
 * Sheet geometry, in px. The connector elbows are drawn with absolutely
 * positioned pseudo-elements, so the layout must be built from known pixel
 * values rather than free-flowing CSS — these constants are that single
 * source (they feed both the styles and the stack-vs-sheet breakpoint math).
 */
const COLUMN_GAP = 40
const CENTER_WIDTH = 208
const PANEL_PADDING = 56

/**
 * Scaling below ~72% makes the pixel font unreadable, so under that the
 * layout stacks rounds vertically instead of shrinking further.
 */
const SHEET_MIN_SCALE = 0.72

/** Column presets: the admin board runs wider/taller for inline inputs. */
export const PUBLIC_SHEET = { columnWidth: 160, slotHeight: 96 } as const
export const ADMIN_SHEET = { columnWidth: 192, slotHeight: 104 } as const

export type RenderMatch = (
  match: ComputedMatch,
  context: { mirrored: boolean }
) => React.ReactNode

export function ColumnHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className='mb-2 text-center font-m6x11 text-[#f4eee0]/85 text-lg'>
      {children}
    </p>
  )
}

export function ChampionBox({
  won,
  children,
}: {
  won: boolean
  children: React.ReactNode
}) {
  return (
    <div className='flex w-full max-w-64 flex-col self-center'>
      <ColumnHeader>Champion</ColumnHeader>
      <div
        className={cn(
          'flex min-h-12 items-center justify-center gap-2 px-3 py-2',
          styles.championCard,
          won && styles.championCardWon
        )}
      >
        {children}
      </div>
    </div>
  )
}

function connectorClass(
  columnIndex: number,
  lastColumn: number,
  matchIndex: number,
  mirrored: boolean
) {
  return cn(
    styles.slot,
    columnIndex < lastColumn &&
      (matchIndex % 2 === 0
        ? mirrored
          ? styles.outTopMirror
          : styles.outTop
        : mirrored
          ? styles.outBottomMirror
          : styles.outBottom),
    columnIndex > 0 && (mirrored ? styles.inMirror : styles.in)
  )
}

function Wing({
  columns,
  labels,
  columnWidth,
  columnHeight,
  mirrored,
  renderMatch,
}: {
  columns: ComputedMatch[][]
  labels: string[]
  columnWidth: number
  columnHeight: number
  mirrored: boolean
  renderMatch: RenderMatch
}) {
  const lastColumn = columns.length - 1
  return (
    <div
      className={cn('flex', mirrored && 'flex-row-reverse')}
      style={{ gap: COLUMN_GAP }}
    >
      {columns.map((matches, columnIndex) => (
        <div
          key={labels[columnIndex]}
          className='flex flex-col'
          style={{ width: columnWidth }}
        >
          <ColumnHeader>{labels[columnIndex]}</ColumnHeader>
          <div className='flex flex-col' style={{ height: columnHeight }}>
            {matches.map((match, matchIndex) => (
              <div
                key={`${match.round}:${match.slot}`}
                className={connectorClass(
                  columnIndex,
                  lastColumn,
                  matchIndex,
                  mirrored
                )}
              >
                {renderMatch(match, { mirrored })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function BracketSheet({
  size,
  rounds,
  columnWidth,
  slotHeight,
  championWon,
  championContent,
  renderMatch,
  onScaleChange,
}: {
  size: BracketSize
  rounds: ComputedRound[]
  /** Width of a wing column in px (the admin board runs wider for inputs). */
  columnWidth: number
  /** Vertical space reserved per first-round match in a wing, in px. */
  slotHeight: number
  championWon: boolean
  championContent: React.ReactNode
  renderMatch: RenderMatch
  onScaleChange?: (scale: number) => void
}) {
  const totalRounds = roundCount(size)
  const mainRounds = rounds.map((round) =>
    round.matches.filter((match) => !match.isThirdPlace)
  )
  const grandFinal = mainRounds[totalRounds - 1]?.[0]
  const thirdPlace = rounds[totalRounds - 1]?.matches.find(
    (match) => match.isThirdPlace
  )

  // Wings hold every round but the final; the first half of each round's
  // matches feeds the left wing, the second half the right wing.
  const wingRounds = mainRounds.slice(0, totalRounds - 1)
  const wingLabels = wingRounds.map(
    (_, index) => rounds[index]?.label ?? String(index + 1)
  )
  const leftColumns = wingRounds.map((matches) =>
    matches.slice(0, matches.length / 2)
  )
  const rightColumns = wingRounds.map((matches) =>
    matches.slice(matches.length / 2)
  )
  const columnHeight = Math.max(1, size / 4) * slotHeight

  const { ref: containerRef, width: containerWidth } = useContainerWidth()
  const wingColumns = 2 * (totalRounds - 1)
  const intrinsicWidth =
    wingColumns * columnWidth +
    CENTER_WIDTH +
    (wingColumns + 1) * COLUMN_GAP +
    PANEL_PADDING
  const stacked =
    containerWidth !== null && containerWidth < intrinsicWidth * SHEET_MIN_SCALE

  // In the stacked layout nothing is scaled; report 1 so consumers using the
  // scale for pointer math stay correct.
  useEffect(() => {
    if (stacked) onScaleChange?.(1)
  }, [stacked, onScaleChange])

  const championBox = (
    <ChampionBox won={championWon}>{championContent}</ChampionBox>
  )
  const thirdPlaceHeader = (
    <p className='mb-2 text-center font-m6x11 text-[#bd4a3f] text-lg'>
      Third Place Match
    </p>
  )

  if (stacked) {
    return (
      <div
        ref={containerRef}
        className={cn('flex flex-col gap-6 p-3 sm:p-5', styles.panel)}
      >
        {championBox}
        {rounds.map((round) => (
          <section key={round.round} className='flex flex-col gap-2'>
            <ColumnHeader>{round.label}</ColumnHeader>
            <div className='grid gap-2.5 sm:grid-cols-2'>
              {round.matches.map((match) => (
                <div
                  key={`${match.round}:${match.slot}`}
                  className='flex flex-col gap-1'
                >
                  {round.round === totalRounds ? (
                    <p className='text-center font-m6x11 text-[#8b93a7] text-sm'>
                      {matchLabel(match, totalRounds)}
                    </p>
                  ) : null}
                  {renderMatch(match, { mirrored: false })}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('p-3 sm:p-5', styles.panel)}>
      <FitToWidth onScaleChange={onScaleChange}>
        <div
          className='flex w-fit min-w-max items-start p-1'
          style={{ gap: COLUMN_GAP }}
        >
          <Wing
            columns={leftColumns}
            labels={wingLabels}
            columnWidth={columnWidth}
            columnHeight={columnHeight}
            mirrored={false}
            renderMatch={renderMatch}
          />

          <div
            className='flex flex-col justify-center gap-8'
            style={{ width: CENTER_WIDTH, minHeight: columnHeight + 32 }}
          >
            {championBox}

            {grandFinal ? (
              <div className='flex flex-col'>
                <ColumnHeader>Grand Finals</ColumnHeader>
                {renderMatch(grandFinal, { mirrored: false })}
              </div>
            ) : null}

            {thirdPlace ? (
              <div className='flex flex-col'>
                {thirdPlaceHeader}
                {renderMatch(thirdPlace, { mirrored: false })}
              </div>
            ) : null}
          </div>

          <Wing
            columns={rightColumns}
            labels={wingLabels}
            columnWidth={columnWidth}
            columnHeight={columnHeight}
            mirrored={true}
            renderMatch={renderMatch}
          />
        </div>
      </FitToWidth>
    </div>
  )
}
