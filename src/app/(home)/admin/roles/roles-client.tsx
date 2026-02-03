'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api } from '@/trpc/react'
import { useCallback, useMemo, useState } from 'react'

const roles: Array<'user' | 'helper' | 'admin' | 'owner'> = ['user', 'helper', 'admin', 'owner']

type UserRow = {
  id: string
  name: string | null
  email: string | null
  role: 'user' | 'helper' | 'admin' | 'owner'
  discord_id: string | null
}

export function RolesClient() {
  const [query, setQuery] = useState('')
  const utils = api.useUtils()
  const { data: users = [], isLoading } = api.users.listUsers.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
    }
  )
  const updateRole = api.users.updateUserRole.useMutation({
    onSuccess: async () => {
      await utils.users.listUsers.invalidate()
    },
  })

  type Role = 'user' | 'helper' | 'admin' | 'owner'
  const isRole = useCallback(
    (r: unknown): r is Role =>
      typeof r === 'string' &&
      (['user', 'helper', 'admin', 'owner'] as const).includes(r as Role),
    []
  )

  type RawUser = {
    id: unknown
    name?: unknown
    email?: unknown
    role?: unknown
    discord_id?: unknown
  }

  const safeUsers = useMemo<UserRow[]>(() => {
    // Normalize and narrow the incoming data to UserRow[]
    const list: RawUser[] = Array.isArray(users)
      ? (users as unknown[] as RawUser[])
      : []
    return list
      .filter((u): u is RawUser & { id: string } => typeof u.id === 'string')
      .filter((u): u is RawUser & { id: string; role: unknown } => true)
      .filter((u): u is RawUser & { id: string; role: Role } => isRole(u.role))
      .map((u) => ({
        id: u.id,
        name: typeof u.name === 'string' ? u.name : null,
        email: typeof u.email === 'string' ? u.email : null,
        role: u.role,
        discord_id: typeof u.discord_id === 'string' ? u.discord_id : null,
      }))
  }, [users, isRole])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return safeUsers
    return safeUsers.filter((u) =>
      [u.name ?? '', u.email ?? '', u.discord_id ?? ''].some((v) =>
        v.toLowerCase().includes(q)
      )
    )
  }, [safeUsers, query])

  return (
    <div className='flex w-full flex-col gap-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <Input
          placeholder='Search by name, email, or Discord ID'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='w-full sm:max-w-sm'
        />
        {updateRole.isError && (
          <p className='text-red-600 text-sm'>
            {updateRole.error?.message ?? 'Failed to update role'}
          </p>
        )}
        {updateRole.isSuccess && (
          <p className='text-green-600 text-sm'>Role updated</p>
        )}
      </div>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='p-3'>Name</th>
              <th className='p-3'>Email</th>
              <th className='p-3'>Discord</th>
              <th className='p-3'>Role</th>
              <th className='p-3'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className='p-3' colSpan={5}>
                  Loading users…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className='p-3' colSpan={5}>
                  No users found
                </td>
              </tr>
            ) : (
              filtered.map((u: UserRow) => (
                <tr key={u.id} className='border-t'>
                  <td className='p-3'>
                    <div className='flex flex-col'>
                      <span className='font-medium'>{u.name ?? '—'}</span>
                      <span className='text-muted-foreground text-xs sm:hidden'>
                        {u.email ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td className='p-3 max-sm:hidden'>{u.email ?? '—'}</td>
                  <td className='p-3'>{u.discord_id ?? '—'}</td>
                  <td className='p-3'>
                    <select
                      className='w-full rounded border bg-background p-2 text-sm'
                      value={u.role}
                      onChange={(e) => {
                        const newRole = e.target.value as
                          | 'user'
                          | 'helper'
                          | 'admin'
                          | 'owner'
                        updateRole.mutate({ userId: u.id, role: newRole })
                      }}
                      disabled={updateRole.isPending}
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className='p-3'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => utils.users.listUsers.invalidate()}
                      disabled={updateRole.isPending}
                    >
                      Refresh
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className='text-muted-foreground text-xs'>
        Mobile-first layout: key info is visible, email collapses on small
        screens.
      </p>
    </div>
  )
}
