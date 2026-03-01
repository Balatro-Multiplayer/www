import { redirect } from 'next/navigation'
import { ProfileSettingsPageClient } from '@/app/(home)/profile/settings/page-client'
import { auth } from '@/server/auth'
import { api, HydrateClient } from '@/trpc/server'

export default async function ProfileSettingsPage() {
  const session = await auth()
  if (!session) {
    redirect('/')
  }
  await Promise.all([api.profile.getSocialLinks.prefetch()])
  return (
    <HydrateClient>
      <ProfileSettingsPageClient userId={session.user.discord_id} />
    </HydrateClient>
  )
}
