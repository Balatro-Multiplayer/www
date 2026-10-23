'use client'

/**
 * The visual card-builder grid: one cell per (rank, suit), badged with the
 * total physical copies across every variant at that slot. Clicking a cell
 * opens a popover to add/remove/edit variants (enhancement/edition/seal) —
 * a single cell can hold several distinct variants (e.g. 2 plain K♥ + 1
 * steel-foil K♥), each tracked as its own `DeckBuilderEntry` row.
 */

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { CARD_HEIGHT, CARD_WIDTH, getCardFaceStyle } from '@/shared/card-sprite'
import { RANK_NAMES, RANK_ORDER, SUIT_NAMES, SUIT_ORDER } from '@/shared/cards'
import {
  EDITION_NAMES,
  ENHANCEMENT_NAMES,
  SEAL_NAMES,
} from '../../log-parser/deck-utils'
import {
  type DeckBuilderEntry,
  type EntryVariant,
  entryKey,
} from '../deck-builder-model'

const NONE = 'none'

const ENHANCEMENT_OPTIONS = [
  { value: NONE, label: 'Plain' },
  ...Object.entries(ENHANCEMENT_NAMES).map(([value, label]) => ({
    value,
    label: label.replace(/ Card$/, ''),
  })),
]

// "Negative" is deliberately excluded: `deck-utils.ts`'s `normalizeEdition`
// already collapses it to `null` on parse for playing cards, and it has zero
// scoring weight in the idol algorithm regardless — offering it here would
// be a toggle that does nothing.
const EDITION_OPTIONS = [
  { value: NONE, label: 'None' },
  ...Object.entries(EDITION_NAMES)
    .filter(([value]) => value !== 'negative')
    .map(([value, label]) => ({ value, label })),
]

const SEAL_OPTIONS = [
  { value: NONE, label: 'None' },
  ...Object.entries(SEAL_NAMES).map(([value, label]) => ({
    value,
    label: label.replace(/ Seal$/, ''),
  })),
]

function displayName<T extends Record<string, string>>(
  names: T,
  key: string | null
): string | null {
  if (!key) {
    return null
  }
  return names[key as keyof T] ?? key
}

function ModifierToggleGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-1'>
      <p className='text-[10px] text-muted-foreground uppercase tracking-wide'>
        {label}
      </p>
      <ToggleGroup
        type='single'
        variant='outline'
        size='sm'
        value={value}
        onValueChange={(next) => next && onChange(next)}
        className='flex-wrap justify-start'
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className='px-2 text-[10px]'
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

function DeckGridCell({
  rank,
  suit,
  variants,
  onUpsert,
  onRemove,
}: {
  rank: string
  suit: string
  variants: DeckBuilderEntry[]
  onUpsert: (patch: EntryVariant, delta: number) => void
  onRemove: (key: string) => void
}) {
  const totalCount = variants.reduce((sum, variant) => sum + variant.count, 0)
  const [enhancement, setEnhancement] = useState(NONE)
  const [edition, setEdition] = useState(NONE)
  const [seal, setSeal] = useState(NONE)
  const [count, setCount] = useState(1)

  const spriteStyle = getCardFaceStyle({ rank, suit })
  const rankName = RANK_NAMES[rank as keyof typeof RANK_NAMES] ?? rank
  const suitName = SUIT_NAMES[suit as keyof typeof SUIT_NAMES] ?? suit

  const handleAdd = () => {
    onUpsert(
      {
        rank,
        suit,
        enhancement: enhancement === NONE ? null : enhancement,
        edition: edition === NONE ? null : edition,
        seal: seal === NONE ? null : seal,
      },
      Math.max(1, count)
    )
    setEnhancement(NONE)
    setEdition(NONE)
    setSeal(NONE)
    setCount(1)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          className={cn(
            'relative overflow-hidden rounded-[6px] border transition-transform hover:z-10 hover:scale-105 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            totalCount > 0
              ? 'border-primary'
              : 'border-border/60 opacity-50 hover:opacity-100'
          )}
          style={{ ...spriteStyle, width: CARD_WIDTH, height: CARD_HEIGHT }}
          aria-label={`${rankName} of ${suitName}${totalCount > 0 ? `, ${totalCount} in deck` : ''}`}
        >
          {totalCount > 0 && (
            <span className='absolute right-0 bottom-0 rounded-tl-[6px] bg-black px-1.5 py-0.5 font-bold text-[11px] text-white leading-none dark:bg-white dark:text-black'>
              {totalCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className='w-80 space-y-3'>
        <p className='font-semibold text-sm'>
          {rankName} of {suitName}
        </p>

        {variants.length > 0 && (
          <div className='space-y-1.5'>
            {variants.map((variant) => {
              const enhancementLabel = displayName(
                ENHANCEMENT_NAMES,
                variant.enhancement
              )
              const editionLabel = displayName(EDITION_NAMES, variant.edition)
              const sealLabel = displayName(SEAL_NAMES, variant.seal)

              return (
                <div
                  key={entryKey(variant)}
                  className='flex items-center justify-between gap-2 rounded-md border px-2 py-1.5'
                >
                  <div className='flex flex-wrap gap-1'>
                    {!(enhancementLabel || editionLabel || sealLabel) && (
                      <Badge variant='outline' className='text-[10px]'>
                        Plain
                      </Badge>
                    )}
                    {enhancementLabel && (
                      <Badge variant='outline' className='text-[10px]'>
                        {enhancementLabel}
                      </Badge>
                    )}
                    {editionLabel && (
                      <Badge variant='outline' className='text-[10px]'>
                        {editionLabel}
                      </Badge>
                    )}
                    {sealLabel && (
                      <Badge variant='outline' className='text-[10px]'>
                        {sealLabel}
                      </Badge>
                    )}
                  </div>
                  <div className='flex items-center gap-1'>
                    <span className='font-mono text-xs tabular-nums'>
                      ×{variant.count}
                    </span>
                    <Button
                      type='button'
                      variant='ghost'
                      size='iconSm'
                      className='h-6 w-6'
                      aria-label={`Remove one copy of this ${rankName} of ${suitName} variant`}
                      onClick={() => onUpsert(variant, -1)}
                    >
                      −
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='iconSm'
                      className='h-6 w-6'
                      aria-label={`Remove all copies of this ${rankName} of ${suitName} variant`}
                      onClick={() => onRemove(entryKey(variant))}
                    >
                      ×
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className='space-y-2 border-t pt-3'>
          <p className='font-medium text-xs'>Add copies</p>
          <ModifierToggleGroup
            label='Enhancement'
            options={ENHANCEMENT_OPTIONS}
            value={enhancement}
            onChange={setEnhancement}
          />
          <ModifierToggleGroup
            label='Edition'
            options={EDITION_OPTIONS}
            value={edition}
            onChange={setEdition}
          />
          <ModifierToggleGroup
            label='Seal'
            options={SEAL_OPTIONS}
            value={seal}
            onChange={setSeal}
          />
          <div className='flex items-center gap-2 pt-1'>
            <Input
              type='number'
              min={1}
              value={count}
              onChange={(event) =>
                setCount(
                  Math.max(1, Number.parseInt(event.target.value, 10) || 1)
                )
              }
              className='h-8 w-16'
              aria-label='Number of copies to add'
            />
            <Button
              type='button'
              size='sm'
              onClick={handleAdd}
              className='flex-1'
            >
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DeckGrid({
  entries,
  onUpsert,
  onRemove,
}: {
  entries: DeckBuilderEntry[]
  onUpsert: (patch: EntryVariant, delta: number) => void
  onRemove: (key: string) => void
}) {
  const bySlot = useMemo(() => {
    const map = new Map<string, DeckBuilderEntry[]>()
    for (const entry of entries) {
      const slotKey = `${entry.suit}_${entry.rank}`
      const list = map.get(slotKey)
      if (list) {
        list.push(entry)
      } else {
        map.set(slotKey, [entry])
      }
    }
    return map
  }, [entries])

  return (
    <div className='space-y-3'>
      <div className='overflow-x-auto pb-2'>
        <div className='inline-flex flex-col gap-1'>
          {SUIT_ORDER.map((suit) => (
            <div key={suit} className='flex gap-1'>
              {RANK_ORDER.map((rank) => (
                <DeckGridCell
                  key={`${suit}_${rank}`}
                  rank={rank}
                  suit={suit}
                  variants={bySlot.get(`${suit}_${rank}`) ?? []}
                  onUpsert={onUpsert}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className='text-muted-foreground text-xs'>
        Stone cards can be added but never enter Idol scoring — the mod excludes
        them entirely, same as here.
      </p>
    </div>
  )
}
