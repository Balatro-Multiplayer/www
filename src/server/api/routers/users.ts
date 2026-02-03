import { createTRPCRouter, ownerProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

export const usersRouter = createTRPCRouter({
  listUsers: ownerProcedure.query(async () => {
    const res = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        discord_id: users.discord_id,
      })
      .from(users)
      .orderBy(asc(users.name))

    return res
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
