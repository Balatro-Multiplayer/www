import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { auth } from '@/server/auth'

import { AdminBlogClient } from './blog-client'

export default async function AdminBlogPage() {
  const session = await auth()

  if (!session?.user || !['admin', 'owner'].includes(session.user.role)) {
    redirect('/')
  }

  return (
    <div className='mx-auto flex w-[calc(100%-1rem)] max-w-fd-container flex-col gap-4 py-8'>
      <div className='flex items-center justify-between'>
        <h1 className='font-bold text-4xl'>Manage Blog Posts</h1>
        <Button asChild>
          <Link href='/admin/blog/new'>Create New Post</Link>
        </Button>
      </div>

      <AdminBlogClient />
    </div>
  )
}
