import { TRPCError } from '@trpc/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { isPollClosed } from '@/lib/poll-status'
import { type Ballot, tally } from '@/lib/ranked-choice'
import {
  createTRPCRouter,
  permissionProcedure,
  protectedProcedure,
  publicProcedure,
} from '@/server/api/trpc'
import {
  pollBallotRankings,
  pollBallots,
  pollOptions,
  polls,
  users,
} from '@/server/db/schema'

type DbClient = typeof import('@/server/db').db

const TALLY_METHOD = 'borda' as const

async function getPollByUuidOrThrow(db: DbClient, uuid: string) {
  const poll = await db
    .select()
    .from(polls)
    .where(eq(polls.uuid, uuid))
    .limit(1)
    .then((rows) => rows[0])

  if (!poll) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Poll not found' })
  }

  return poll
}

async function getPollByIdOrThrow(db: DbClient, id: number) {
  const poll = await db
    .select()
    .from(polls)
    .where(eq(polls.id, id))
    .limit(1)
    .then((rows) => rows[0])

  if (!poll) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Poll not found' })
  }

  return poll
}

function loadOrderedOptions(db: DbClient, pollId: number) {
  return db
    .select()
    .from(pollOptions)
    .where(eq(pollOptions.pollId, pollId))
    .orderBy(asc(pollOptions.sortOrder), asc(pollOptions.id))
}

async function countBallots(db: DbClient, pollId: number) {
  const rows = await db
    .select({ id: pollBallots.id })
    .from(pollBallots)
    .where(eq(pollBallots.pollId, pollId))
  return rows.length
}

const createInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).optional(),
  options: z.array(z.string().trim().min(1).max(500)).min(2),
  // hours until the poll auto-closes; default 24. Max ~1 year.
  durationHours: z.number().int().min(1).max(8760).default(24),
})

export const pollsRouter = createTRPCRouter({
  // ---- Admin management (polls.manage) ----------------------------------

  create: permissionProcedure('polls.manage')
    .input(createInputSchema)
    .mutation(async ({ ctx, input }) => {
      const poll = await ctx.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(polls)
          .values({
            title: input.title,
            description: input.description ?? null,
            createdBy: ctx.session.user.id,
            closesAt: new Date(Date.now() + input.durationHours * 3_600_000),
          })
          .returning()

        if (!created) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed creating poll',
          })
        }

        await tx.insert(pollOptions).values(
          input.options.map((label, index) => ({
            pollId: created.id,
            label,
            sortOrder: index,
          }))
        )

        return created
      })

      return { id: poll.id, uuid: poll.uuid }
    }),

  adminList: permissionProcedure('polls.manage').query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(polls).orderBy(asc(polls.id))

    const [optionRows, ballotRows] = await Promise.all([
      ctx.db.select({ pollId: pollOptions.pollId }).from(pollOptions),
      ctx.db.select({ pollId: pollBallots.pollId }).from(pollBallots),
    ])

    const optionCounts = new Map<number, number>()
    for (const row of optionRows) {
      optionCounts.set(row.pollId, (optionCounts.get(row.pollId) ?? 0) + 1)
    }
    const ballotCounts = new Map<number, number>()
    for (const row of ballotRows) {
      ballotCounts.set(row.pollId, (ballotCounts.get(row.pollId) ?? 0) + 1)
    }

    return rows.map((poll) => ({
      ...poll,
      optionCount: optionCounts.get(poll.id) ?? 0,
      ballotCount: ballotCounts.get(poll.id) ?? 0,
    }))
  }),

  getForAdmin: permissionProcedure('polls.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const poll = await getPollByIdOrThrow(ctx.db, input.id)
      const options = await loadOrderedOptions(ctx.db, poll.id)
      const ballotCount = await countBallots(ctx.db, poll.id)
      return { ...poll, options, ballotCount }
    }),

  update: permissionProcedure('polls.manage')
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(10_000).nullable().optional(),
        // null clears the auto-close; omitted leaves it unchanged.
        closesAt: z.coerce.date().nullable().optional(),
        addOptions: z.array(z.string().trim().min(1).max(500)).optional(),
        renameOptions: z
          .array(
            z.object({
              id: z.number().int().positive(),
              label: z.string().trim().min(1).max(500),
            })
          )
          .optional(),
        removeOptionIds: z.array(z.number().int().positive()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const poll = await getPollByIdOrThrow(ctx.db, input.id)

      await ctx.db.transaction(async (tx) => {
        if (
          input.title !== undefined ||
          input.description !== undefined ||
          input.closesAt !== undefined
        ) {
          await tx
            .update(polls)
            .set({
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
              ...(input.closesAt !== undefined
                ? { closesAt: input.closesAt }
                : {}),
            })
            .where(eq(polls.id, poll.id))
        }

        if (input.removeOptionIds?.length) {
          // Block removing options that already have votes to avoid silently
          // rewriting people's ballots.
          const ranked = await tx
            .select({ optionId: pollBallotRankings.optionId })
            .from(pollBallotRankings)
            .where(inArray(pollBallotRankings.optionId, input.removeOptionIds))
            .limit(1)
          if (ranked.length > 0) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Cannot remove an option that already has votes.',
            })
          }
          await tx
            .delete(pollOptions)
            .where(
              and(
                eq(pollOptions.pollId, poll.id),
                inArray(pollOptions.id, input.removeOptionIds)
              )
            )
        }

        for (const rename of input.renameOptions ?? []) {
          await tx
            .update(pollOptions)
            .set({ label: rename.label })
            .where(
              and(
                eq(pollOptions.pollId, poll.id),
                eq(pollOptions.id, rename.id)
              )
            )
        }

        if (input.addOptions?.length) {
          const existing = await tx
            .select({ sortOrder: pollOptions.sortOrder })
            .from(pollOptions)
            .where(eq(pollOptions.pollId, poll.id))
          const nextOrder =
            existing.reduce((max, o) => Math.max(max, o.sortOrder), -1) + 1
          await tx.insert(pollOptions).values(
            input.addOptions.map((label, index) => ({
              pollId: poll.id,
              label,
              sortOrder: nextOrder + index,
            }))
          )
        }
      })

      const options = await loadOrderedOptions(ctx.db, poll.id)
      return { id: poll.id, options }
    }),

  reorderOptions: permissionProcedure('polls.manage')
    .input(
      z.object({
        pollId: z.number().int().positive(),
        optionIds: z.array(z.number().int().positive()).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await getPollByIdOrThrow(ctx.db, input.pollId)

      const existing = await ctx.db
        .select({ id: pollOptions.id })
        .from(pollOptions)
        .where(eq(pollOptions.pollId, input.pollId))

      const submitted = new Set(input.optionIds)
      const expected = new Set(existing.map((o) => o.id))
      if (
        submitted.size !== input.optionIds.length ||
        existing.length !== input.optionIds.length ||
        existing.some((o) => !submitted.has(o.id)) ||
        input.optionIds.some((id) => !expected.has(id))
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Option order is stale. Refresh and try again.',
        })
      }

      await ctx.db.transaction(async (tx) => {
        await Promise.all(
          input.optionIds.map((optionId, index) =>
            tx
              .update(pollOptions)
              .set({ sortOrder: index })
              .where(eq(pollOptions.id, optionId))
          )
        )
      })

      return loadOrderedOptions(ctx.db, input.pollId)
    }),

  setStatus: permissionProcedure('polls.manage')
    .input(
      z.object({
        id: z.number().int().positive(),
        status: z.enum(['open', 'closed']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const poll = await getPollByIdOrThrow(ctx.db, input.id)
      // Reopening a poll whose timer already elapsed would instantly re-close it,
      // so clear the stale auto-close time on reopen.
      const clearExpiredClose =
        input.status === 'open' &&
        poll.closesAt != null &&
        poll.closesAt.getTime() <= Date.now()
      const [updated] = await ctx.db
        .update(polls)
        .set({
          status: input.status,
          closedAt: input.status === 'closed' ? new Date() : null,
          ...(clearExpiredClose ? { closesAt: null } : {}),
        })
        .where(eq(polls.id, input.id))
        .returning()
      return updated
    }),

  delete: permissionProcedure('polls.manage')
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getPollByIdOrThrow(ctx.db, input.id)
      await ctx.db.delete(polls).where(eq(polls.id, input.id))
      return { success: true }
    }),

  // ---- Public reads ------------------------------------------------------

  getPublic: publicProcedure
    .input(z.object({ uuid: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const poll = await getPollByUuidOrThrow(ctx.db, input.uuid)
      const options = await loadOrderedOptions(ctx.db, poll.id)
      const totalBallots = await countBallots(ctx.db, poll.id)
      return {
        id: poll.id,
        uuid: poll.uuid,
        title: poll.title,
        description: poll.description,
        status: poll.status,
        closedAt: poll.closedAt,
        closesAt: poll.closesAt,
        isClosed: isPollClosed(poll),
        options: options.map((o) => ({ id: o.id, label: o.label })),
        totalBallots,
      }
    }),

  getResults: publicProcedure
    .input(z.object({ uuid: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const poll = await getPollByUuidOrThrow(ctx.db, input.uuid)
      const options = await loadOrderedOptions(ctx.db, poll.id)
      const optionIds = options.map((o) => o.id)
      const labelById = new Map(options.map((o) => [o.id, o.label]))

      // Load ballots + rankings + voter identity.
      const ballotRows = await ctx.db
        .select({
          ballotId: pollBallots.id,
          userId: pollBallots.userId,
          updatedAt: pollBallots.updatedAt,
          name: users.name,
          image: users.image,
          discordId: users.discord_id,
        })
        .from(pollBallots)
        .innerJoin(users, eq(users.id, pollBallots.userId))
        .where(eq(pollBallots.pollId, poll.id))

      const rankingRows = ballotRows.length
        ? await ctx.db
            .select({
              ballotId: pollBallotRankings.ballotId,
              optionId: pollBallotRankings.optionId,
              rank: pollBallotRankings.rank,
            })
            .from(pollBallotRankings)
            .where(
              inArray(
                pollBallotRankings.ballotId,
                ballotRows.map((b) => b.ballotId)
              )
            )
        : []

      const rankingsByBallot = new Map<
        number,
        { optionId: number; rank: number }[]
      >()
      for (const row of rankingRows) {
        const list = rankingsByBallot.get(row.ballotId) ?? []
        list.push({ optionId: row.optionId, rank: row.rank })
        rankingsByBallot.set(row.ballotId, list)
      }

      const ballots: Ballot[] = ballotRows.map((b) => {
        const ranked = (rankingsByBallot.get(b.ballotId) ?? [])
          .sort((a, c) => a.rank - c.rank)
          .map((r) => r.optionId)
        return { userId: b.userId, ranked }
      })

      const ranking = tally(TALLY_METHOD, ballots, optionIds).map((r) => ({
        ...r,
        label: labelById.get(r.optionId) ?? '',
      }))

      const perPerson = ballotRows
        .map((b) => ({
          userId: b.userId,
          name: b.name,
          image: b.image,
          discordId: b.discordId,
          updatedAt: b.updatedAt,
          choices: (rankingsByBallot.get(b.ballotId) ?? [])
            .sort((a, c) => a.rank - c.rank)
            .map((r) => ({
              optionId: r.optionId,
              label: labelById.get(r.optionId) ?? '',
              rank: r.rank,
            })),
        }))
        // Most recently voted first, oldest last.
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

      return {
        method: TALLY_METHOD,
        totalBallots: ballots.length,
        ranking,
        ballots: perPerson,
      }
    }),

  // ---- Voter (must be logged in) ----------------------------------------

  getMyBallot: protectedProcedure
    .input(z.object({ uuid: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const poll = await getPollByUuidOrThrow(ctx.db, input.uuid)
      const ballot = await ctx.db
        .select({ id: pollBallots.id })
        .from(pollBallots)
        .where(
          and(
            eq(pollBallots.pollId, poll.id),
            eq(pollBallots.userId, ctx.session.user.id)
          )
        )
        .limit(1)
        .then((rows) => rows[0])

      if (!ballot) return { hasVoted: false, rankedOptionIds: [] as number[] }

      const rankings = await ctx.db
        .select({
          optionId: pollBallotRankings.optionId,
          rank: pollBallotRankings.rank,
        })
        .from(pollBallotRankings)
        .where(eq(pollBallotRankings.ballotId, ballot.id))
        .orderBy(asc(pollBallotRankings.rank))

      return {
        hasVoted: true,
        rankedOptionIds: rankings.map((r) => r.optionId),
      }
    }),

  submitBallot: protectedProcedure
    .input(
      z.object({
        uuid: z.string().min(1),
        rankedOptionIds: z.array(z.number().int().positive()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const poll = await getPollByUuidOrThrow(ctx.db, input.uuid)

      if (isPollClosed(poll)) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'This poll is closed.',
        })
      }

      // Validate: no duplicates, all ids belong to this poll.
      const unique = new Set(input.rankedOptionIds)
      if (unique.size !== input.rankedOptionIds.length) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Duplicate options in ranking.',
        })
      }
      if (input.rankedOptionIds.length > 0) {
        const validOptions = await ctx.db
          .select({ id: pollOptions.id })
          .from(pollOptions)
          .where(eq(pollOptions.pollId, poll.id))
        const validIds = new Set(validOptions.map((o) => o.id))
        if (input.rankedOptionIds.some((id) => !validIds.has(id))) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Ranking includes options not in this poll.',
          })
        }
      }

      await ctx.db.transaction(async (tx) => {
        const existing = await tx
          .select({ id: pollBallots.id })
          .from(pollBallots)
          .where(
            and(
              eq(pollBallots.pollId, poll.id),
              eq(pollBallots.userId, ctx.session.user.id)
            )
          )
          .limit(1)
          .then((rows) => rows[0])

        let ballotId: number
        if (existing) {
          ballotId = existing.id
          await tx
            .update(pollBallots)
            .set({ updatedAt: new Date() })
            .where(eq(pollBallots.id, ballotId))
          await tx
            .delete(pollBallotRankings)
            .where(eq(pollBallotRankings.ballotId, ballotId))
        } else {
          const [created] = await tx
            .insert(pollBallots)
            .values({ pollId: poll.id, userId: ctx.session.user.id })
            .returning({ id: pollBallots.id })
          if (!created) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed creating ballot',
            })
          }
          ballotId = created.id
        }

        if (input.rankedOptionIds.length > 0) {
          await tx.insert(pollBallotRankings).values(
            input.rankedOptionIds.map((optionId, index) => ({
              ballotId,
              optionId,
              rank: index + 1,
            }))
          )
        }
      })

      return { success: true }
    }),
})
