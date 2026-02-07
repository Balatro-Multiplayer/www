import { LogsClient } from '@/app/(home)/admin/logs/logs-client'
import { auth } from '@/server/auth'
import { Suspense } from 'react'

export default async function LogsPage() {
  const session = await auth()
  const isAdmin = ['owner', 'admin'].includes(session?.user.role ?? '')

  if (!isAdmin) {
    return (
      <div className={'container mx-auto px-4 py-10'}>
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
          'mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 pt-8'
        }
      >
        <h1 className='font-bold text-3xl'>Log Files</h1>
        <LogsClient />
      </div>
    </Suspense>
  )
}
