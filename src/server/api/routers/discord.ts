import { createTRPCRouter, publicProcedure } from '@/server/api/trpc'
import { db } from '@/server/db'
import { users } from '@/server/db/schema'
import { discord_service } from '@/server/services/discord.service'
import { DISCORD_SNOWFLAKE_REGEX } from '@/shared/discord'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

export const discord_router = createTRPCRouter({
  get_user_by_id: publicProcedure
    .input(
      z.object({
        user_id: z
          .string()
          .regex(DISCORD_SNOWFLAKE_REGEX, 'Invalid Discord user ID'),
      })
    )
    .query(async ({ ctx, input }) => {
      const discordUser = await discord_service.get_user_by_id(input.user_id)

      // Get social media links from the database
      const userData = await db.query.users.findFirst({
        where: eq(users.discord_id, input.user_id),
        columns: {
          twitch_url: true,
          youtube_url: true,
        },
      })

      return {
        ...discordUser,
        twitch_url: userData?.twitch_url || null,
        youtube_url: userData?.youtube_url || null,
      }
    }),
})
