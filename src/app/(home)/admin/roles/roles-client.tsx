'use client'

import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import { useCallback } from 'react'
import { useDebounceCallback } from 'usehooks-ts'
import { PaginationControls } from '@/app/_components/pagination-controls'
import { SortableHeader } from '@/app/_components/sortable-header'
import { TableShell } from '@/app/_components/table-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api } from '@/trpc/react'

const roles: Array<'user' | 'helper' | 'admin' | 'owner'> = [
  'user',
  'helper',
  'admin',
  'owner',
]

type UserRow = {
  id: string
  name: string | null
  email: string | null
  role: 'user' | 'helper' | 'admin' | 'owner'
  discord_id: string | null
}

type SortBy = 'name' | 'email' | 'role' | 'discord_id'

export function RolesClient() {
  const utils = api.useUtils()

  const pageSize = 50
  const [queryParams, setQueryParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      search: parseAsString,
      sortBy: parseAsString.withDefault('name'),
      sortOrder: parseAsString.withDefault('asc'),
    },
    { history: 'push' }
  )

  const { page, search } = queryParams
  const sortBy = (['name', 'email', 'role', 'discord_id'] as const).includes(
    queryParams.sortBy as SortBy
  )
    ? (queryParams.sortBy as SortBy)
    : 'name'
  const sortOrder = (queryParams.sortOrder === 'desc' ? 'desc' : 'asc') as
    | 'asc'
    | 'desc'
  const updateSearch = useDebounceCallback((nextSearch: string) => {
    setQueryParams({ search: nextSearch || null, page: 1 })
  }, 400)

  const usersQ = api.users.listUsers.useQuery(
    {
      page,
      pageSize,
      search: search || undefined,
      sortBy,
      sortOrder,
    },
    { refetchOnWindowFocus: false }
  )

  const rows = (usersQ.data?.data ?? []) as UserRow[]
  const total = usersQ.data?.total ?? 0
  const totalPages = usersQ.data?.totalPages ?? 1
  const isLoading = usersQ.isLoading

  const updateRole = api.users.updateUserRole.useMutation({
    onSuccess: async () => {
      await utils.users.listUsers.invalidate()
    },
  })

  const handleSort = useCallback(
    (column: string) => {
      const nextOrder =
        sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      setQueryParams({ sortBy: column, sortOrder: nextOrder, page: 1 })
    },
    [setQueryParams, sortBy, sortOrder]
  )

  return (
    <div className='flex w-full flex-col gap-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <Input
          key={search ?? ''}
          placeholder='Search by name, email, or Discord ID'
          defaultValue={search ?? ''}
          onChange={(e) => updateSearch(e.target.value)}
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

      <TableShell className='overflow-hidden'>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader className='sticky top-0 z-10 bg-background'>
              <TableRow className='bg-muted/50'>
                <TableHead>
                  <SortableHeader
                    column='name'
                    label='Name'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    column='email'
                    label='Email'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    column='discord_id'
                    label='Discord'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    column='role'
                    label='Role'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading users…</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No users found</TableCell>
                </TableRow>
              ) : (
                rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className='flex flex-col'>
                        <span className='font-medium'>{u.name ?? '—'}</span>
                        <span className='text-muted-foreground text-xs sm:hidden'>
                          {u.email ?? '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className='max-sm:hidden'>
                      {u.email ?? '—'}
                    </TableCell>
                    <TableCell>{u.discord_id ?? '—'}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => utils.users.listUsers.invalidate()}
                        disabled={updateRole.isPending}
                      >
                        Refresh
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && (
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            itemLabel='users'
            onPageChange={(p) => setQueryParams({ page: p })}
            className='rounded-none border-0 border-t bg-background'
          />
        )}
      </TableShell>
    </div>
  )
}
