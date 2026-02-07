import { Button } from '@/components/ui/button'
import { auth } from '@/server/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AdminBlogClient } from './blog-client'

export default async function AdminBlogPage() {
  const session = await auth()

  if (!session?.user || !['admin', 'owner'].includes(session.user.role)) {
    redirect('/')
  }

  return (
    <div className='container py-10'>
      <div className='mb-8 flex items-center justify-between'>
        <h1 className='font-bold text-4xl'>Manage Blog Posts</h1>
        <Button asChild>
          <Link href='/admin/blog/new'>Create New Post</Link>
        </Button>
      </div>

      <AdminBlogClient />
    </div>
  )
}
