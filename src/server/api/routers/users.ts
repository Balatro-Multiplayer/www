import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, ownerProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'

export const usersRouter = createTRPCRouter({
  listUsers: ownerProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        search: z.string().trim().optional(),
        sortBy: z.enum(['name', 'email', 'role', 'discord_id']).default('name'),
        sortOrder: z.enum(['asc', 'desc']).default('asc'),
      })
    )
    .query(async ({ input }) => {
      const page = input.page
      const pageSize = input.pageSize
      const offset = (page - 1) * pageSize
      const search = input.search?.trim()

      const where = search
        ? or(
            ilike(users.name, `%${search}%`),
            ilike(users.email, `%${search}%`),
            ilike(users.discord_id, `%${search}%`)
          )
        : undefined

      const dir = input.sortOrder === 'asc' ? asc : desc
      const orderBy =
        input.sortBy === 'email'
          ? [dir(users.email), asc(users.name), asc(users.id)]
          : input.sortBy === 'role'
            ? [dir(users.role), asc(users.name), asc(users.id)]
            : input.sortBy === 'discord_id'
              ? [dir(users.discord_id), asc(users.name), asc(users.id)]
              : [dir(users.name), asc(users.id)]

      const [{ total } = { total: 0 }] = await (where
        ? db
            .select({ total: sql<string>`count(*)::int` })
            .from(users)
            .where(where)
        : db.select({ total: sql<string>`count(*)::int` }).from(users))

      const res = await (where
        ? db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
              discord_id: users.discord_id,
            })
            .from(users)
            .where(where)
            .orderBy(...orderBy)
            .limit(pageSize)
            .offset(offset)
        : db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              role: users.role,
              discord_id: users.discord_id,
            })
            .from(users)
            .orderBy(...orderBy)
            .limit(pageSize)
            .offset(offset))

      const totalNum = Number(total ?? 0)
      const totalPages = Math.max(1, Math.ceil(totalNum / pageSize))

      return {
        data: res,
        page,
        pageSize,
        total: totalNum,
        totalPages,
        search: search || null,
        sortBy: input.sortBy,
        sortOrder: input.sortOrder,
      }
    }),

  updateUserRole: ownerProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum(['user', 'helper', 'admin', 'owner']),
      })
    )
    .mutation(async ({ input }) => {
      // Prevent demoting the last owner
      const currentOwners = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'owner'))

      const isDemotingOwner = input.role !== 'owner'

      if (isDemotingOwner && currentOwners.length <= 1) {
        // If attempting to demote the last owner, block
        const lastOwnerId = currentOwners[0]?.id
        if (!lastOwnerId || lastOwnerId === input.userId) {
          throw new Error('Cannot demote the last remaining owner')
        }
      }

      const updated = await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId))
        .returning({ id: users.id, role: users.role })

      return updated[0]
    }),
})
