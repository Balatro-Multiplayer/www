/**
 * Shared vocabulary for a poll's voting method so the schema, API boundary,
 * tally dispatch, admin UI, and Discord embeds all agree on one set of values.
 *
 * A poll is either:
 *  - `ranked`:   voters order options; results use Borda count.
 *  - `approval`: voters pick any subset of options (multiple choice); each
 *               option's share is (voters who picked it) / (total voters).
 */
import { z } from 'zod'
import type { TallyMethod } from '@/lib/ranked-choice'

export const POLL_METHODS = ['ranked', 'approval'] as const
export type PollMethod = (typeof POLL_METHODS)[number]

export const DEFAULT_POLL_METHOD: PollMethod = 'ranked'

/** Zod enum for validating the method at the API boundary. */
export const pollMethodSchema = z.enum(POLL_METHODS)

/** Narrow an arbitrary DB/string value to a known method, defaulting safely. */
export function toPollMethod(value: string | null | undefined): PollMethod {
  return (POLL_METHODS as readonly string[]).includes(value ?? '')
    ? (value as PollMethod)
    : DEFAULT_POLL_METHOD
}

/** The tally algorithm used to score each voting method's ballots. */
export function tallyMethodFor(method: PollMethod): TallyMethod {
  return method === 'approval' ? 'approval' : 'borda'
}

/** Short human label for a method (admin badges, embeds). */
export function pollMethodLabel(method: PollMethod): string {
  return method === 'approval' ? 'Multiple choice' : 'Ranked choice'
}

/** One-line description used in metadata/OG copy when a poll has no blurb. */
export function pollMethodBlurb(method: PollMethod): string {
  return method === 'approval'
    ? 'Multiple-choice poll: pick any options and see live results.'
    : 'Ranked-choice poll: vote and see live results.'
}
