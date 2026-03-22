import { TranscriptCodesClient } from '@/app/(home)/admin/transcript-codes/transcript-codes-client'
import { hasPermission } from '@/lib/permissions'
import { auth } from '@/server/auth'
import { createMetadata } from '../../../../../lib/metadata'

export const metadata = createMetadata({
  title: 'Transcript Codes',
  description: 'Search lobby codes extracted from internal match transcripts.',
  path: '/admin/transcript-codes',
  noIndex: true,
})

export default async function TranscriptCodesPage() {
  const session = await auth()
  const canSearchTranscriptCodes = hasPermission(
    session?.user,
    'transcripts.search'
  )

  if (!canSearchTranscriptCodes) {
    return (
      <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col py-8'>
        <div className='prose'>
          <h1>Forbidden</h1>
        </div>
      </div>
    )
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 py-8'>
      <div className='space-y-1'>
        <h1 className='font-bold text-3xl'>Transcript Codes</h1>
        <p className='text-fd-muted-foreground text-sm'>
          Search lobby codes extracted from match transcripts.
        </p>
      </div>
      <TranscriptCodesClient
        canViewTranscripts={hasPermission(session?.user, 'transcripts.view')}
      />
    </div>
  )
}
