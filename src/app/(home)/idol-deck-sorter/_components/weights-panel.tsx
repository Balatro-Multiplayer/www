'use client'

/**
 * Lets the user override any coefficient `computeIdolSort` uses and re-run
 * the current deck against it — every field here maps 1:1 to a field on
 * `IdolSortWeights`. Field labels for the per-modifier tables are pulled
 * from the same name maps the deck grid uses, so renaming a card modifier
 * anywhere in the app only has to happen in one place.
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  cloneWeights,
  DEFAULT_WEIGHTS,
  type IdolSortWeights,
} from '@/lib/idol-sort'
import {
  EDITION_NAMES,
  ENHANCEMENT_NAMES,
  SEAL_NAMES,
} from '../../log-parser/deck-utils'

type ScalarKey =
  | 'targetCopies'
  | 'wEditionA'
  | 'wEditionB'
  | 'wCountA'
  | 'wMain'
  | 'wOff'
  | 'wStr'
  | 'wGen'
  | 'genFloor'

type TableName = 'edition' | 'enhancement' | 'seal'

type FieldDef =
  | {
      kind: 'scalar'
      key: ScalarKey
      label: string
      step: number
      min?: number
    }
  | {
      kind: 'table'
      table: TableName
      key: string
      label: string
      step: number
    }

type FieldGroup = { title: string; hint?: string; fields: FieldDef[] }

/** One field per key in a weight table, labelled from `names` (falling back to the raw key) with an optional common suffix stripped (e.g. " Card", " Seal"). `exclude` drops keys that are never reachable from this app's card data (e.g. `edition.glass` — glass is always an enhancement here, see idol-sort.ts). */
function tableGroup(
  title: string,
  table: TableName,
  names: Record<string, string>,
  options: { stripSuffix?: RegExp; exclude?: string[] } = {}
): FieldGroup {
  const exclude = new Set(options.exclude ?? [])
  return {
    title,
    fields: Object.keys(DEFAULT_WEIGHTS[table])
      .filter((key) => !exclude.has(key))
      .map((key) => {
        const rawLabel = names[key] ?? key
        return {
          kind: 'table',
          table,
          key,
          label: options.stripSuffix
            ? rawLabel.replace(options.stripSuffix, '')
            : rawLabel,
          step: 0.05,
        }
      }),
  }
}

const WEIGHT_GROUPS: FieldGroup[] = [
  {
    title: 'Tiers & achievability',
    hint: 'Tier A = a (rank, suit) already at or above the target copy count; Tier B = still building toward it.',
    fields: [
      {
        kind: 'scalar',
        key: 'targetCopies',
        label: 'Target copies',
        step: 1,
        min: 1,
      },
      {
        kind: 'scalar',
        key: 'wCountA',
        label: 'Tier A: reward per copy',
        step: 0.05,
      },
      {
        kind: 'scalar',
        key: 'wMain',
        label: 'Tier B: reward per copy',
        step: 0.05,
      },
      {
        kind: 'scalar',
        key: 'wOff',
        label: 'Tier B: suit-changer bonus',
        step: 0.05,
      },
      {
        kind: 'scalar',
        key: 'wStr',
        label: 'Tier B: Strength-adjacent bonus',
        step: 0.05,
      },
    ],
  },
  {
    title: 'Quality multipliers',
    hint: 'Multiplies the sum of the seal + edition + enhancement weights below.',
    fields: [
      {
        kind: 'scalar',
        key: 'wEditionA',
        label: 'Tier A multiplier',
        step: 0.05,
      },
      {
        kind: 'scalar',
        key: 'wEditionB',
        label: 'Tier B multiplier',
        step: 0.05,
      },
    ],
  },
  {
    title: 'Face / low-rank pool bonus',
    hint: 'Rewards having noticeably more face (J/Q/K/A) or low (2-5) cards than the deck’s average rank count.',
    fields: [
      { kind: 'scalar', key: 'wGen', label: 'Pool bonus weight', step: 0.01 },
      {
        kind: 'scalar',
        key: 'genFloor',
        label: 'Pool bonus floor',
        step: 0.01,
      },
    ],
  },
  // `glass` is excluded from edition weights: in this app's data model glass is
  // always an enhancement, never an edition (see idol-sort.ts), so no card can
  // ever trigger it — editing it here would look live but never do anything.
  tableGroup('Edition weights', 'edition', EDITION_NAMES, {
    exclude: ['glass'],
  }),
  tableGroup('Enhancement weights', 'enhancement', ENHANCEMENT_NAMES, {
    stripSuffix: / Card$/,
  }),
  tableGroup('Seal weights', 'seal', SEAL_NAMES, { stripSuffix: / Seal$/ }),
]

function fieldKey(field: FieldDef): string {
  return field.kind === 'scalar' ? field.key : `${field.table}.${field.key}`
}

function getFieldValue(weights: IdolSortWeights, field: FieldDef): number {
  return field.kind === 'scalar'
    ? weights[field.key]
    : (weights[field.table][field.key] ?? 0)
}

function setFieldValue(
  weights: IdolSortWeights,
  field: FieldDef,
  value: number
): IdolSortWeights {
  if (field.kind === 'scalar') {
    return { ...weights, [field.key]: value }
  }
  return {
    ...weights,
    [field.table]: { ...weights[field.table], [field.key]: value },
  }
}

export function WeightsPanel({
  weights,
  onChange,
}: {
  weights: IdolSortWeights
  onChange: (weights: IdolSortWeights) => void
}) {
  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs'>
          Matches{' '}
          <a
            href='https://github.com/Balatro-Multiplayer/BalatroMultiplayer/pull/527'
            target='_blank'
            rel='noreferrer'
            className='underline decoration-dotted underline-offset-4 hover:text-foreground'
          >
            PR #527
          </a>
          &rsquo;s proposed values by default — change any of these and the deck
          above re-sorts immediately.
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => onChange(cloneWeights(DEFAULT_WEIGHTS))}
        >
          Reset to defaults
        </Button>
      </div>

      {WEIGHT_GROUPS.map((group) => (
        <div key={group.title} className='space-y-2'>
          <div>
            <p className='font-semibold text-sm'>{group.title}</p>
            {group.hint && (
              <p className='text-muted-foreground text-xs'>{group.hint}</p>
            )}
          </div>
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
            {group.fields.map((field) => {
              const inputId = `idol-weight-${fieldKey(field)}`
              return (
                <div key={inputId} className='space-y-1'>
                  <label
                    htmlFor={inputId}
                    className='block text-[11px] text-muted-foreground'
                  >
                    {field.label}
                  </label>
                  <Input
                    id={inputId}
                    type='number'
                    step={field.step}
                    min={field.kind === 'scalar' ? field.min : undefined}
                    value={getFieldValue(weights, field)}
                    onChange={(event) => {
                      const next = Number.parseFloat(event.target.value)
                      onChange(
                        setFieldValue(
                          weights,
                          field,
                          Number.isFinite(next) ? next : 0
                        )
                      )
                    }}
                    className='h-8 text-xs'
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
