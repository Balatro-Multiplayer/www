'use client'

import { SiTwitch, SiYoutube } from '@icons-pack/react-simple-icons'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/trpc/react'

export function ProfileSettingsPageClient({
  userId,
}: {
  userId: string | null
}) {
  const [socialLinks] = api.profile.getSocialLinks.useSuspenseQuery()
  const [twitchUrl, setTwitchUrl] = useState<string | null>(
    socialLinks.twitch_url
  )
  const [youtubeUrl, setYoutubeUrl] = useState<string | null>(
    socialLinks.youtube_url
  )

  const { mutate: updateSocialLinks, isPending } =
    api.profile.updateSocialLinks.useMutation({
      onSuccess: () => {
        toast.success('Social links updated successfully')
      },
    })

  const handleSave = () => {
    updateSocialLinks({
      twitch_url: twitchUrl,
      youtube_url: youtubeUrl,
    })
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-1 flex-col py-8'>
      <div className='mb-6'>
        <h1 className='font-bold text-3xl text-gray-900 dark:text-white'>
          Profile Settings
        </h1>
        <p className='mt-2 text-gray-500 dark:text-zinc-400'>
          Manage your profile settings and social links
        </p>
      </div>

      <div className='space-y-6'>
        <div className='rounded-lg border bg-white p-6 dark:bg-zinc-800/20'>
          <h2 className='mb-4 font-semibold text-xl'>Stream Widget</h2>
          <p className='mb-4 text-gray-500 dark:text-zinc-400'>
            Use this widget to display your stats on your stream
          </p>
          {userId && (
            <Link
              href={`/stream-card/${userId}`}
              target='_blank'
              className='inline-flex items-center gap-2 text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300'
            >
              Open Stream Widget <ExternalLink className='h-4 w-4' />
            </Link>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className='rounded-lg border bg-white p-6 dark:bg-zinc-800/20'
        >
          <h2 className='mb-4 font-semibold text-xl'>Social Links</h2>
          <div className='space-y-4'>
            <div>
              <Label className='mb-2' htmlFor={'ttv-url'}>
                Twitch URL
              </Label>
              <div className='flex items-center gap-2'>
                <SiTwitch className='h-5 w-5 text-purple-500' />
                <Input
                  id={'ttv-url'}
                  type='url'
                  value={twitchUrl || ''}
                  onChange={(e) => setTwitchUrl(e.target.value || null)}
                  placeholder='https://twitch.tv/yourusername'
                />
              </div>
            </div>
            <div>
              <Label className='mb-2' htmlFor={'yt-url'}>
                YouTube URL
              </Label>
              <div className='flex items-center gap-2'>
                <SiYoutube className='h-5 w-5 text-red-500' />
                <Input
                  id={'yt-url'}
                  type='url'
                  value={youtubeUrl || ''}
                  onChange={(e) => setYoutubeUrl(e.target.value || null)}
                  placeholder='https://youtube.com/c/yourchannel'
                  className='w-full rounded-md border border-gray-300 p-2 dark:border-zinc-700 dark:bg-zinc-900'
                />
              </div>
            </div>
          </div>
          <div className='mt-6 flex justify-end gap-2'>
            <Button disabled={isPending} type={'submit'}>
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
