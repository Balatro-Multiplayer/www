import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'

export const profileRouter = createTRPCRouter({
  getSocialLinks: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.session.user.id),
      columns: {
        twitch_url: true,
        youtube_url: true,
      },
    })
    return {
      twitch_url: user?.twitch_url || null,
      youtube_url: user?.youtube_url || null,
    }
  }),

  updateSocialLinks: protectedProcedure
    .input(
      z.object({
        twitch_url: z.string().url().nullable(),
        youtube_url: z.string().url().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .update(users)
        .set({
          twitch_url: input.twitch_url,
          youtube_url: input.youtube_url,
        })
        .where(eq(users.id, ctx.session.user.id))

      return { success: true }
    }),
})
