import { Suspense } from 'react'
import { LogsClient } from '@/app/(home)/admin/logs/logs-client'
import { auth } from '@/server/auth'
import { createMetadata } from '../../../../../lib/metadata'

export const metadata = createMetadata({
  title: 'Log Files',
  description: 'Browse uploaded log files and diagnostics.',
  path: '/admin/logs',
  noIndex: true,
})

export default async function LogsPage() {
  const session = await auth()
  const isAdmin = ['owner', 'admin'].includes(session?.user.role ?? '')

  if (!isAdmin) {
    return (
      <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col py-8'>
        <div className={'prose'}>
          <h1>Forbidden</h1>
        </div>
      </div>
    )
  }

  return (
    <Suspense>
      <div
        className={
          'mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 py-8'
        }
      >
        <h1 className='font-bold text-3xl'>Log Files</h1>
        <LogsClient />
      </div>
    </Suspense>
  )
}
