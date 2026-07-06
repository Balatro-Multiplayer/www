import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  BRACKET_SIZES,
  type BracketSize,
  championOf,
  computeBracket,
  isBracketSize,
  isValidMatchAddress,
  seedNames,
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
import { redis } from '@/server/redis'
import { botlatro_service } from '@/server/services/botlatro.service'

type DbClient = typeof import('@/server/db').db

// Champions only change when an admin edits a bracket, so the full map
// (one entry per published bracket with a linked winner) lives in Redis and
// every mutation below invalidates it. The TTL is just a safety net.
const CHAMPIONS_CACHE_KEY = 'brackets:champions'
const CHAMPIONS_CACHE_TTL_SECONDS = 24 * 60 * 60

type ChampionEntry = { playerId: string; bracketId: number; label: string }

async function computeChampions(db: DbClient): Promise<ChampionEntry[]> {
  const publishedBrackets = await db
    .select({
      id: brackets.id,
      name: brackets.name,
      size: brackets.size,
      hasThirdPlace: brackets.hasThirdPlace,
      seasonName: seasons.name,
    })
    .from(brackets)
    .leftJoin(seasons, eq(brackets.seasonId, seasons.id))
    .where(eq(brackets.isPublished, true))

  const entries: ChampionEntry[] = []

  for (const bracket of publishedBrackets) {
    if (!isBracketSize(bracket.size)) continue

    const [seeds, results] = await Promise.all([
      loadSeedArray(db, bracket.id, bracket.size),
      loadResults(db, bracket.id),
    ])
    const champion = championOf(
      computeBracket(
        bracket.size,
        bracket.hasThirdPlace,
        seedNames(seeds),
        results
      )
    )
    if (!champion) continue

    const championSeed = seeds.find((seed) => seed?.name === champion)
    if (championSeed?.playerId) {
      entries.push({
        playerId: championSeed.playerId,
        bracketId: bracket.id,
        label: bracket.seasonName
          ? `${bracket.seasonName} Playoff Champion`
          : `${bracket.name} Champion`,
      })
    }
  }

  return entries
}

async function getChampions(db: DbClient): Promise<ChampionEntry[]> {
  const cached = await redis.get(CHAMPIONS_CACHE_KEY)
  if (cached) {
    return JSON.parse(cached) as ChampionEntry[]
  }
  const entries = await computeChampions(db)
  await redis.setEx(
    CHAMPIONS_CACHE_KEY,
    CHAMPIONS_CACHE_TTL_SECONDS,
    JSON.stringify(entries)
  )
  return entries
}

async function invalidateChampionsCache() {
  await redis.del(CHAMPIONS_CACHE_KEY)
}

const sizeSchema = z
  .number()
  .int()
  .refine(isBracketSize, {
    message: `Size must be one of ${BRACKET_SIZES.join(', ')}`,
  })

// Full-length seed list; blank names mean TBD. playerId optionally links the
// seed to a site player profile (Discord id).
const seedsSchema = z.array(
  z.object({
    name: z.string().trim().max(100),
    playerId: z.string().trim().max(64).nullable().optional(),
  })
)

const seasonIdSchema = z.number().int().positive().nullable()

async function getBracketOrThrow(db: DbClient, id: number) {
  const bracket = await db
    .select()
    .from(brackets)
    .where(eq(brackets.id, id))
    .limit(1)
    .then((rows) => rows[0])

  if (!bracket) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Bracket not found' })
  }

  return bracket
}

/** Seeds as a full positional array (nulls where no name is set). */
async function loadSeedArray(db: DbClient, bracketId: number, size: number) {
  const rows = await db
    .select()
    .from(bracketSeeds)
    .where(eq(bracketSeeds.bracketId, bracketId))
    .orderBy(asc(bracketSeeds.position))

  const seeds: ({ name: string; playerId: string | null } | null)[] =
    Array.from({ length: size }, () => null)
  for (const row of rows) {
    if (row.position >= 0 && row.position < size) {
      seeds[row.position] = { name: row.name, playerId: row.playerId }
    }
  }
  return seeds
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

async function replaceSeeds(
  db: DbClient,
  bracketId: number,
  seeds: z.infer<typeof seedsSchema>
) {
  await db.transaction(async (tx) => {
    await tx.delete(bracketSeeds).where(eq(bracketSeeds.bracketId, bracketId))
    const values = seeds
      .map((seed, position) => ({
        bracketId,
        position,
        name: seed.name.trim(),
        playerId: seed.playerId?.trim() || null,
      }))
      .filter((seed) => seed.name.length > 0)
    if (values.length > 0) {
      await tx.insert(bracketSeeds).values(values)
    }
  })
}

function toBracketPayload(
  bracket: typeof brackets.$inferSelect,
  seeds: Awaited<ReturnType<typeof loadSeedArray>>,
  results: Awaited<ReturnType<typeof loadResults>>
) {
  return {
    id: bracket.id,
    name: bracket.name,
    seasonId: bracket.seasonId,
    // The column is a plain integer; it only ever holds validated sizes.
    size: bracket.size as BracketSize,
    hasThirdPlace: bracket.hasThirdPlace,
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
        name: z.string().trim().min(1).max(255),
        size: sizeSchema.default(16),
        hasThirdPlace: z.boolean().default(true),
        seasonId: seasonIdSchema.optional(),
        seeds: seedsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.seeds && input.seeds.length > input.size) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Too many seeds for a ${input.size}-player bracket.`,
        })
      }

      const [created] = await ctx.db
        .insert(brackets)
        .values({
          name: input.name,
          size: input.size,
          hasThirdPlace: input.hasThirdPlace,
          seasonId: input.seasonId ?? null,
          createdBy: ctx.session.user.id,
        })
        .returning()

      if (!created) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed creating bracket',
        })
      }

      if (input.seeds?.some((seed) => seed.name.trim().length > 0)) {
        await replaceSeeds(ctx.db, created.id, input.seeds)
      }

      return { id: created.id }
    }),

  adminList: permissionProcedure('brackets.manage').query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(brackets)
      .orderBy(desc(brackets.createdAt))

    const seedRows = await ctx.db
      .select({ bracketId: bracketSeeds.bracketId })
      .from(bracketSeeds)

    const seedCounts = new Map<number, number>()
    for (const row of seedRows) {
      seedCounts.set(row.bracketId, (seedCounts.get(row.bracketId) ?? 0) + 1)
    }

    return rows.map((bracket) => ({
      ...bracket,
      seedCount: seedCounts.get(bracket.id) ?? 0,
    }))
  }),

  getForAdmin: permissionProcedure('brackets.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.id)
      const [seeds, results] = await Promise.all([
        loadSeedArray(ctx.db, bracket.id, bracket.size),
        loadResults(ctx.db, bracket.id),
      ])
      return toBracketPayload(bracket, seeds, results)
    }),

  update: permissionProcedure('brackets.manage')
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255).optional(),
        isPublished: z.boolean().optional(),
        hasThirdPlace: z.boolean().optional(),
        seasonId: seasonIdSchema.optional(),
        // Full replacement, indexed by seed position; omitted = unchanged.
        seeds: seedsSchema.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const bracket = await getBracketOrThrow(ctx.db, input.id)

      if (input.seeds && input.seeds.length > bracket.size) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Too many seeds for a ${bracket.size}-player bracket.`,
        })
      }

      if (
        input.name !== undefined ||
        input.isPublished !== undefined ||
        input.hasThirdPlace !== undefined ||
        input.seasonId !== undefined
      ) {
        await ctx.db
          .update(brackets)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.isPublished !== undefined
              ? { isPublished: input.isPublished }
              : {}),
            ...(input.hasThirdPlace !== undefined
              ? { hasThirdPlace: input.hasThirdPlace }
              : {}),
            ...(input.seasonId !== undefined
              ? { seasonId: input.seasonId }
              : {}),
          })
          .where(eq(brackets.id, bracket.id))
      }

      if (input.seeds) {
        await replaceSeeds(ctx.db, bracket.id, input.seeds)
      }

      await invalidateChampionsCache()
      return { success: true }
    }),

  setResult: permissionProcedure('brackets.manage')
    .input(
      z.object({
        bracketId: z.number().int().positive(),
        round: z.number().int(),
        slot: z.number().int(),
        score1: z.number().int().min(0).max(999).nullable(),
        score2: z.number().int().min(0).max(999).nullable(),
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
        await invalidateChampionsCache()
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

      await invalidateChampionsCache()
      return { success: true }
    }),

  delete: permissionProcedure('brackets.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getBracketOrThrow(ctx.db, input.id)
      await ctx.db.delete(brackets).where(eq(brackets.id, input.id))
      await invalidateChampionsCache()
      return { success: true }
    }),

  /**
   * Discord guild member search (via the bot) so seeds can be picked from
   * real players instead of hand-typing ids.
   */
  searchPlayers: permissionProcedure('brackets.manage')
    .input(z.object({ q: z.string().trim().min(2).max(100) }))
    .query(async ({ input }) => {
      const members = await botlatro_service.searchGuildMembers(input.q)
      return members.slice(0, 10).map((member) => ({
        discordId: member.discord_id,
        name: member.display_name || member.username,
        username: member.username,
        avatarUrl: member.avatar_url,
      }))
    }),

  // ---- Public reads ------------------------------------------------------

  listPublic: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: brackets.id,
        name: brackets.name,
        seasonId: brackets.seasonId,
        size: brackets.size,
        createdAt: brackets.createdAt,
      })
      .from(brackets)
      .where(eq(brackets.isPublished, true))
      .orderBy(desc(brackets.createdAt))
    return rows
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

  /**
   * Playoff titles won by a player (matched via seed player links) across
   * published brackets — powers the profile "Season X Playoff Champion" badge.
   * Served from the cached champions map; champions only change when an
   * admin edits a bracket, which invalidates the cache.
   */
  championsForPlayer: publicProcedure
    .input(z.object({ playerId: z.string().trim().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const champions = await getChampions(ctx.db)
      return champions
        .filter((entry) => entry.playerId === input.playerId)
        .map((entry) => ({ bracketId: entry.bracketId, label: entry.label }))
    }),
})
