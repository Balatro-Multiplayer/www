import { TRPCError } from '@trpc/server'
import { and, asc, count, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  affectedResultAddresses,
  BEST_OF_OPTIONS,
  BRACKET_SIZES,
  type BracketSize,
  isBestOf,
  isBracketSize,
  isValidMatchAddress,
  isValidSeriesScore,
  MAX_SCORE,
  rosterToSeeds,
  roundCount,
} from '@/lib/bracket'
import {
  createTRPCRouter,
  permissionProcedure,
  publicProcedure,
} from '@/server/api/trpc'
import {
  bracketResults,
  bracketSeeds,
  brackets,
  seasons,
} from '@/server/db/schema'
import { leaderboardService } from '@/server/services/leaderboard'
import { RANKED_QUEUE_ID } from '@/shared/constants'

type DbClient = typeof import('@/server/db').db

const sizeSchema = z
  .number()
  .int()
  .refine(isBracketSize, {
    message: `Size must be one of ${BRACKET_SIZES.join(', ')}`,
  })

const bestOfSchema = z
  .number()
  .int()
  .refine(isBestOf, {
    message: `Series must be best of ${BEST_OF_OPTIONS.join(', ')}`,
  })

// Twice the largest bracket size, leaving pool room for alternates.
const MAX_ROSTER_ENTRIES = 64
// Generous ceiling for a Discord snowflake id (currently 17-19 digits).
const MAX_PLAYER_ID_LENGTH = 64

// The bracket's roster: every player in the bracket, each optionally placed
// at a first-round position (null = in the pool, not yet assigned a match).
// playerId optionally links the entry to a site player profile (Discord id).
const rosterSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(100),
      playerId: z
        .string()
        .trim()
        .max(MAX_PLAYER_ID_LENGTH)
        .nullable()
        .optional(),
      position: z.number().int().min(0).nullable(),
    })
  )
  .max(MAX_ROSTER_ENTRIES)

function assertRosterFits(roster: z.infer<typeof rosterSchema>, size: number) {
  const positions = roster
    .map((entry) => entry.position)
    .filter((position): position is number => position !== null)
  const unique = new Set(positions)
  if (
    unique.size !== positions.length ||
    positions.some((position) => position >= size)
  ) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Roster positions must be unique and inside the bracket.',
    })
  }

  // Names are the roster identity (assignment, profile links), so enforce
  // uniqueness here too — the client guard alone doesn't cover API callers.
  const names = roster.map((entry) => entry.name.trim().toLowerCase())
  if (new Set(names).size !== names.length) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Every player in a bracket needs a distinct name.',
    })
  }
}

/** Playoff brackets are named after their season. */
function bracketDisplayName(seasonName: string) {
  return `${seasonName} Playoffs`
}

async function getBracketOrThrow(db: DbClient, id: number) {
  const row = await db
    .select({ bracket: brackets, seasonName: seasons.name })
    .from(brackets)
    .innerJoin(seasons, eq(brackets.seasonId, seasons.id))
    .where(eq(brackets.id, id))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bracket not found' })
  }

  return { ...row.bracket, seasonName: row.seasonName }
}

async function assertSeasonIsFree(
  db: DbClient,
  seasonId: number,
  excludeBracketId?: number
) {
  const existing = await db
    .select({ id: brackets.id })
    .from(brackets)
    .where(eq(brackets.seasonId, seasonId))
    .limit(1)
    .then((rows) => rows[0])

  if (existing && existing.id !== excludeBracketId) {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'That season already has a playoff bracket.',
    })
  }
}

function loadRoster(db: DbClient, bracketId: number) {
  return db
    .select({
      name: bracketSeeds.name,
      playerId: bracketSeeds.playerId,
      position: bracketSeeds.position,
    })
    .from(bracketSeeds)
    .where(eq(bracketSeeds.bracketId, bracketId))
    .orderBy(asc(bracketSeeds.position), asc(bracketSeeds.name))
}

/** Seeds as a full positional array (nulls where no name is set). */
async function loadSeedArray(db: DbClient, bracketId: number, size: number) {
  return rosterToSeeds(await loadRoster(db, bracketId), size)
}

function loadResults(db: DbClient, bracketId: number) {
  return db
    .select({
      round: bracketResults.round,
      slot: bracketResults.slot,
      score1: bracketResults.score1,
      score2: bracketResults.score2,
    })
    .from(bracketResults)
    .where(eq(bracketResults.bracketId, bracketId))
}

/**
 * Replace the roster and, in the same transaction, clear every stored result
 * whose match is invalidated by a placement change — otherwise scores from
 * the old pairings would instantly "decide" matches between the new ones.
 */
async function replaceRoster(
  db: DbClient,
  bracket: { id: number; size: number; hasThirdPlace: boolean },
  roster: z.infer<typeof rosterSchema>
) {
  const occupant = (entry: { name: string; playerId: string | null } | null) =>
    entry ? JSON.stringify([entry.name, entry.playerId]) : ''

  const before = isBracketSize(bracket.size)
    ? rosterToSeeds(await loadRoster(db, bracket.id), bracket.size)
    : []
  const after = isBracketSize(bracket.size)
    ? rosterToSeeds(
        roster.map((entry) => ({
          name: entry.name.trim(),
          playerId: entry.playerId?.trim() || null,
          position: entry.position,
        })),
        bracket.size
      )
    : []

  const changedFirstRoundSlots = before
    .map((entry, position) =>
      occupant(entry) !== occupant(after[position] ?? null)
        ? Math.floor(position / 2)
        : null
    )
    .filter((slot): slot is number => slot !== null)

  const invalidated = isBracketSize(bracket.size)
    ? affectedResultAddresses(
        bracket.size,
        bracket.hasThirdPlace,
        changedFirstRoundSlots
      )
    : []

  await db.transaction(async (tx) => {
    await tx.delete(bracketSeeds).where(eq(bracketSeeds.bracketId, bracket.id))
    if (roster.length > 0) {
      await tx.insert(bracketSeeds).values(
        roster.map((entry) => ({
          bracketId: bracket.id,
          position: entry.position,
          name: entry.name.trim(),
          playerId: entry.playerId?.trim() || null,
        }))
      )
    }
    for (const address of invalidated) {
      await tx
        .delete(bracketResults)
        .where(
          and(
            eq(bracketResults.bracketId, bracket.id),
            eq(bracketResults.round, address.round),
            eq(bracketResults.slot, address.slot)
          )
        )
    }
  })
}

/** Re-render the cached public playoff pages after an admin edit. */
function revalidatePublicPages(bracketId: number) {
  revalidatePath('/playoffs')
  revalidatePath(`/playoffs/${bracketId}`)
}

function toBracketPayload(
  bracket: Awaited<ReturnType<typeof getBracketOrThrow>>,
  seeds: Awaited<ReturnType<typeof loadSeedArray>>,
  results: Awaited<ReturnType<typeof loadResults>>
) {
  return {
    id: bracket.id,
    name: bracketDisplayName(bracket.seasonName),
    seasonId: bracket.seasonId,
    // The column is a plain integer; it only ever holds validated sizes.
    size: bracket.size as BracketSize,
    hasThirdPlace: bracket.hasThirdPlace,
    bestOf: bracket.bestOf,
    finalsBestOf: bracket.finalsBestOf,
    isPublished: bracket.isPublished,
    createdAt: bracket.createdAt,
    updatedAt: bracket.updatedAt,
    seeds,
    results,
  }
}

export const bracketsRouter = createTRPCRouter({
  // ---- Admin management (brackets.manage) --------------------------------

  create: permissionProcedure('brackets.manage')
    .input(
      z.object({
        seasonId: z.number().int().positive(),
        size: sizeSchema.default(16),
        hasThirdPlace: z.boolean().default(true),
        bestOf: bestOfSchema.default(3),
        finalsBestOf: bestOfSchema.nullable().default(null),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertSeasonIsFree(ctx.db, input.seasonId)

      const [created] = await ctx.db
        .insert(brackets)
        .values({
          seasonId: input.seasonId,
          size: input.size,
          hasThirdPlace: input.hasThirdPlace,
          bestOf: input.bestOf,
          finalsBestOf: input.finalsBestOf,
          createdBy: ctx.session.user.id,
        })
        .returning()

      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed creating bracket',
        })
      }

      return { id: created.id }
    }),

  adminList: permissionProcedure('brackets.manage').query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ bracket: brackets, seasonName: seasons.name })
      .from(brackets)
      .innerJoin(seasons, eq(brackets.seasonId, seasons.id))
      .orderBy(desc(brackets.seasonId))

    const seedRows = await ctx.db
      .select({ bracketId: bracketSeeds.bracketId, seedCount: count() })
      .from(bracketSeeds)
      .groupBy(bracketSeeds.bracketId)
    const seedCounts = new Map(
      seedRows.map((row) => [row.bracketId, row.seedCount])
    )

    return rows.map(({ bracket, seasonName }) => ({
      ...bracket,
      name: bracketDisplayName(seasonName),
      seasonName,
      seedCount: seedCounts.get(bracket.id) ?? 0,
    }))
  }),

  getForAdmin: permissionProcedure('brackets.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.id)
      const [roster, results] = await Promise.all([
        loadRoster(ctx.db, bracket.id),
        loadResults(ctx.db, bracket.id),
      ])
      return {
        ...toBracketPayload(
          bracket,
          rosterToSeeds(roster, bracket.size),
          results
        ),
        roster,
      }
    }),

  update: permissionProcedure('brackets.manage')
    .input(
      z.object({
        id: z.number().int().positive(),
        isPublished: z.boolean().optional(),
        hasThirdPlace: z.boolean().optional(),
        seasonId: z.number().int().positive().optional(),
        bestOf: bestOfSchema.optional(),
        // null = grand final uses the same format as every other match.
        finalsBestOf: bestOfSchema.nullable().optional(),
        // Full roster replacement; omitted = unchanged.
        roster: rosterSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.id)

      if (input.roster) {
        assertRosterFits(input.roster, bracket.size)
      }

      if (input.seasonId !== undefined) {
        await assertSeasonIsFree(ctx.db, input.seasonId, bracket.id)
      }

      if (
        input.isPublished !== undefined ||
        input.hasThirdPlace !== undefined ||
        input.seasonId !== undefined ||
        input.bestOf !== undefined ||
        input.finalsBestOf !== undefined
      ) {
        await ctx.db
          .update(brackets)
          .set({
            ...(input.isPublished !== undefined
              ? { isPublished: input.isPublished }
              : {}),
            ...(input.hasThirdPlace !== undefined
              ? { hasThirdPlace: input.hasThirdPlace }
              : {}),
            ...(input.seasonId !== undefined
              ? { seasonId: input.seasonId }
              : {}),
            ...(input.bestOf !== undefined ? { bestOf: input.bestOf } : {}),
            ...(input.finalsBestOf !== undefined
              ? { finalsBestOf: input.finalsBestOf }
              : {}),
          })
          .where(eq(brackets.id, bracket.id))
      }

      if (input.roster) {
        await replaceRoster(ctx.db, bracket, input.roster)
      }

      revalidatePublicPages(bracket.id)
      return { success: true }
    }),

  setResult: permissionProcedure('brackets.manage')
    .input(
      z.object({
        bracketId: z.number().int().positive(),
        round: z.number().int(),
        slot: z.number().int(),
        score1: z.number().int().min(0).max(MAX_SCORE).nullable(),
        score2: z.number().int().min(0).max(MAX_SCORE).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.bracketId)

      if (
        !isBracketSize(bracket.size) ||
        !isValidMatchAddress(
          bracket.size,
          bracket.hasThirdPlace,
          input.round,
          input.slot
        )
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No such match in this bracket.',
        })
      }

      // A score must be a possible state of the match's series format,
      // otherwise a typo like 2-2 in a Bo3 silently stalls the bracket.
      const isGrandFinal =
        input.round === roundCount(bracket.size) && input.slot === 0
      const seriesBestOf =
        isGrandFinal && bracket.finalsBestOf !== null
          ? bracket.finalsBestOf
          : bracket.bestOf
      if (!isValidSeriesScore(input.score1, input.score2, seriesBestOf)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Impossible best-of-${seriesBestOf} score — the series ends when someone reaches ${Math.ceil(seriesBestOf / 2)} wins.`,
        })
      }

      if (input.score1 === null && input.score2 === null) {
        await ctx.db
          .delete(bracketResults)
          .where(
            and(
              eq(bracketResults.bracketId, bracket.id),
              eq(bracketResults.round, input.round),
              eq(bracketResults.slot, input.slot)
            )
          )
        revalidatePublicPages(bracket.id)
        return { success: true }
      }

      await ctx.db
        .insert(bracketResults)
        .values({
          bracketId: bracket.id,
          round: input.round,
          slot: input.slot,
          score1: input.score1,
          score2: input.score2,
        })
        .onConflictDoUpdate({
          target: [
            bracketResults.bracketId,
            bracketResults.round,
            bracketResults.slot,
          ],
          set: {
            score1: input.score1,
            score2: input.score2,
            updatedAt: new Date(),
          },
        })

      revalidatePublicPages(bracket.id)
      return { success: true }
    }),

  delete: permissionProcedure('brackets.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getBracketOrThrow(ctx.db, input.id)
      await ctx.db.delete(brackets).where(eq(brackets.id, input.id))
      revalidatePublicPages(input.id)
      return { success: true }
    }),

  /**
   * Player search over the ranked leaderboard the site already caches —
   * playoff qualifiers come from there, and every entry carries the
   * Discord id needed for profile links. No extra bot calls.
   */
  searchPlayers: permissionProcedure('brackets.manage')
    .input(z.object({ q: z.string().trim().min(2).max(100) }))
    .query(async ({ input }) => {
      const result = await leaderboardService.getLeaderboard(RANKED_QUEUE_ID, {
        search: input.q,
        page: 1,
        pageSize: 10,
        sortBy: 'rank',
        sortOrder: 'asc',
      })
      return result.data.map((entry) => ({
        discordId: entry.id,
        name: entry.name,
        rank: entry.rank,
        mmr: Math.round(entry.mmr),
      }))
    }),

  // ---- Public reads ------------------------------------------------------

  listPublic: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: brackets.id,
        seasonId: brackets.seasonId,
        seasonName: seasons.name,
        seasonIsActive: seasons.isActive,
        size: brackets.size,
        createdAt: brackets.createdAt,
      })
      .from(brackets)
      .innerJoin(seasons, eq(brackets.seasonId, seasons.id))
      .where(eq(brackets.isPublished, true))
      .orderBy(desc(brackets.seasonId))
    return rows.map((row) => ({
      ...row,
      name: bracketDisplayName(row.seasonName),
    }))
  }),

  getPublic: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.id)
      if (!bracket.isPublished) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bracket not found' })
      }
      const [seeds, results] = await Promise.all([
        loadSeedArray(ctx.db, bracket.id, bracket.size),
        loadResults(ctx.db, bracket.id),
      ])
      return toBracketPayload(bracket, seeds, results)
    }),
})
