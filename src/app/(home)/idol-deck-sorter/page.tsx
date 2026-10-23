'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounceCallback } from 'usehooks-ts'
import { IdolRollTrack } from '@/components/idol-roll-track'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  cloneWeights,
  computeIdolSort,
  DEFAULT_WEIGHTS,
  type IdolSortWeights,
  pickWinnerForRoll,
} from '@/lib/idol-sort'
import { DeckGrid } from './_components/deck-grid'
import { RollControls } from './_components/roll-controls'
import { ScoreTable } from './_components/score-table'
import { WeightsPanel } from './_components/weights-panel'
import {
  type DeckBuilderEntry,
  type EntryVariant,
  expandEntriesToCards,
  removeEntry,
  upsertEntry,
} from './deck-builder-model'
import {
  type ParseResult,
  parseDeckText,
  serializeCanonical,
  serializeShorthand,
} from './deck-shorthand'

type TextFormat = 'shorthand' | 'canonical'
type ParseError = Extract<ParseResult, { ok: false }>['error']

const DECK_TEXT_PLACEHOLDER = [
  '# One card per line — shorthand, e.g.:',
  'AS',
  '4x KH-steel-foil',
  '10H-goldseal',
].join('\n')

/**
 * The weights-tuning card is fully built (state, panel, equations all still
 * wired up — `weights` still flows into `computeIdolSort` and the score
 * breakdown either way) but hidden from everyone for now. Flip this back to
 * `true` to re-show it — no other changes needed.
 */
const SHOW_WEIGHTS_PANEL = false

export default function IdolDeckSorterPage() {
  const [entries, setEntries] = useState<DeckBuilderEntry[]>([])
  const [textDraft, setTextDraft] = useState('')
  const [activeFormat, setActiveFormat] = useState<TextFormat>('shorthand')
  const [parseError, setParseError] = useState<ParseError | null>(null)
  const [roll, setRoll] = useState(0)
  const [weights, setWeights] = useState<IdolSortWeights>(() =>
    cloneWeights(DEFAULT_WEIGHTS)
  )
  const [weightsOpen, setWeightsOpen] = useState(false)
  /** Which side an `entries` change came from, so the text box doesn't fight the user mid-typing (see the effects below). */
  const lastEditOrigin = useRef<'grid' | 'text'>('grid')

  const cards = useMemo(() => expandEntriesToCards(entries), [entries])
  const sortResult = useMemo(
    () => computeIdolSort(cards, weights),
    [cards, weights]
  )
  const winner = useMemo(
    () => pickWinnerForRoll(sortResult.hitEntries, roll),
    [sortResult.hitEntries, roll]
  )

  const handleUpsert = (patch: EntryVariant, delta: number) => {
    lastEditOrigin.current = 'grid'
    setEntries((previous) => upsertEntry(previous, patch, delta))
  }

  const handleRemove = (key: string) => {
    lastEditOrigin.current = 'grid'
    setEntries((previous) => removeEntry(previous, key))
  }

  const debouncedParse = useDebounceCallback((text: string) => {
    const result = parseDeckText(text)
    if (result.ok) {
      lastEditOrigin.current = 'text'
      setEntries(result.entries)
      setParseError(null)
    } else {
      setParseError(result.error)
    }
  }, 300)

  const handleTextChange = (value: string) => {
    setTextDraft(value)
    debouncedParse(value)
  }

  // Grid-originated `entries` changes stay authoritative: regenerate the text
  // box to match. Text-originated changes are deliberately NOT re-synced here
  // (see the effect below for why) so the box doesn't reformat itself out
  // from under someone still composing more lines.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately entries-only — a format-tab switch is handled by the effect below, which always re-derives regardless of edit origin
  useEffect(() => {
    if (lastEditOrigin.current !== 'grid') {
      return
    }
    setTextDraft(
      activeFormat === 'canonical'
        ? serializeCanonical(entries)
        : serializeShorthand(entries)
    )
  }, [entries])

  // Switching which format the text box displays always re-derives from the
  // authoritative `entries`, never from whatever (possibly invalid,
  // mid-edit) string happens to be in the box — so switching tabs can never
  // "freeze in" a broken draft.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberately activeFormat-only — reacting to an explicit format switch, not to entries changes (handled above)
  useEffect(() => {
    setTextDraft(
      activeFormat === 'canonical'
        ? serializeCanonical(entries)
        : serializeShorthand(entries)
    )
    lastEditOrigin.current = 'grid'
  }, [activeFormat])

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 pt-16 pb-16'>
      <div className='space-y-1'>
        <h1 className='font-bold text-2xl'>Idol Deck Sorter</h1>
        <p className='text-muted-foreground text-sm'>
          Build a deck and see how the modded Idol joker's algorithm would
          score, sort, and weight it — the same math the log parser's{' '}
          <span className='font-medium'>Idol Hits</span> section decodes from
          real games, run against a deck you make up.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className='text-lg'>Build your deck</CardTitle>
          <CardDescription>
            Click cards in the grid, or type/paste a deck in the text box — both
            stay in sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue='grid'>
            <TabsList>
              <TabsTrigger value='grid'>Grid</TabsTrigger>
              <TabsTrigger value='text'>Text</TabsTrigger>
            </TabsList>
            <TabsContent value='grid' className='pt-3'>
              <DeckGrid
                entries={entries}
                onUpsert={handleUpsert}
                onRemove={handleRemove}
              />
            </TabsContent>
            <TabsContent value='text' className='space-y-2 pt-3'>
              <Tabs
                value={activeFormat}
                onValueChange={(value) => setActiveFormat(value as TextFormat)}
              >
                <TabsList>
                  <TabsTrigger value='shorthand'>Shorthand</TabsTrigger>
                  <TabsTrigger value='canonical'>Canonical</TabsTrigger>
                </TabsList>
              </Tabs>
              <Textarea
                value={textDraft}
                onChange={(event) => handleTextChange(event.target.value)}
                placeholder={DECK_TEXT_PLACEHOLDER}
                rows={10}
                className='font-mono text-xs'
                aria-invalid={parseError != null}
              />
              {parseError && (
                <p className='text-destructive text-xs'>
                  Line {parseError.line}: {parseError.message}
                </p>
              )}
              <p className='text-muted-foreground text-xs'>
                Shorthand: one card per line, e.g. "AS" or "4x KH-steel-foil".
                Canonical: the site's own{' '}
                <code className='font-mono'>suit-rank-enh-edition-seal</code>{' '}
                format, semicolon-joined — paste a deck copied from a parsed log
                directly here.
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {SHOW_WEIGHTS_PANEL && (
        <Card>
          <CardHeader>
            <button
              type='button'
              onClick={() => setWeightsOpen((previous) => !previous)}
              aria-expanded={weightsOpen}
              aria-controls='idol-weights-body'
              className='flex w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            >
              <div>
                <CardTitle className='text-lg'>Scoring weights</CardTitle>
                <CardDescription>
                  Tune any coefficient the algorithm uses and re-simulate this
                  same deck against it.
                </CardDescription>
              </div>
              <span className='font-mono text-muted-foreground text-xs'>
                {weightsOpen ? 'Hide' : 'Show'}
              </span>
            </button>
          </CardHeader>
          {weightsOpen && (
            <CardContent id='idol-weights-body'>
              <WeightsPanel weights={weights} onChange={setWeights} />
            </CardContent>
          )}
        </Card>
      )}

      {sortResult.entries.length === 0 ? (
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground text-sm'>
            {cards.length === 0
              ? "Add cards above to see how they'd be sorted and weighted."
              : "Every card in this deck is a Stone Card — the Idol algorithm never considers them, so there's nothing to sort."}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Roll</CardTitle>
              <CardDescription>
                There's no real seed here — scrub the roll to see which card
                would win at that value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RollControls roll={roll} onRollChange={setRoll} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className='text-lg'>Sorted result</CardTitle>
              <CardDescription>
                {cards.length} card{cards.length === 1 ? '' : 's'} in the pool,
                sorted tier → score → rank → suit — the same order the mod would
                present the deck in.
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <IdolRollTrack
                cards={sortResult.hitEntries}
                winner={winner ?? { rank: '', suit: '' }}
                roll={roll}
              />
              <ScoreTable
                entries={sortResult.entries}
                winner={winner}
                weights={weights}
                context={sortResult.context}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
