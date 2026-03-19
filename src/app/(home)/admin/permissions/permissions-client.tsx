'use client'

import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useDebounceCallback } from 'usehooks-ts'
import { PaginationControls } from '@/app/_components/pagination-controls'
import { SortableHeader } from '@/app/_components/sortable-header'
import { TableShell } from '@/app/_components/table-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PERMISSION_GROUPS, type PermissionKey } from '@/lib/permissions'
import { api } from '@/trpc/react'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  permissions: PermissionKey[]
  discord_id: string | null
}

type SortBy = 'name' | 'email' | 'permissions' | 'discord_id'

const SORTABLE_COLUMNS = ['name', 'email', 'permissions', 'discord_id'] as const

export function PermissionsClient() {
  const utils = api.useUtils()
  const pageSize = 50
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null)
  const [draftPermissions, setDraftPermissions] = useState<PermissionKey[]>([])
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
  const sortBy = SORTABLE_COLUMNS.includes(queryParams.sortBy as SortBy)
    ? (queryParams.sortBy as SortBy)
    : 'name'
  const sortOrder = queryParams.sortOrder === 'desc' ? 'desc' : 'asc'

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

  useEffect(() => {
    if (!selectedUser) return

    const refreshedUser = rows.find((row) => row.id === selectedUser.id)
    if (refreshedUser) {
      setSelectedUser(refreshedUser)
      setDraftPermissions(refreshedUser.permissions)
    }
  }, [rows, selectedUser])

  const updatePermissions = api.users.updateUserPermissions.useMutation({
    onSuccess: async () => {
      toast.success('Permissions updated')
      await utils.users.listUsers.invalidate()
      setSelectedUser(null)
      setDraftPermissions([])
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to update permissions')
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

  const groupedPermissionCount = useMemo(
    () =>
      PERMISSION_GROUPS.reduce(
        (sum, group) => sum + group.permissions.length,
        0
      ),
    []
  )

  const togglePermission = (permission: PermissionKey, checked: boolean) => {
    setDraftPermissions((current) => {
      if (checked) {
        return [...new Set([...current, permission])]
      }
      return current.filter((value) => value !== permission)
    })
  }

  const summarizedPermissions = (permissions: PermissionKey[]) => {
    if (permissions.length === 0) {
      return <span className='text-muted-foreground text-sm'>None</span>
    }

    return (
      <div className='flex flex-wrap gap-1'>
        {permissions.slice(0, 2).map((permission) => (
          <Badge key={permission} variant='secondary' className='font-normal'>
            {permission}
          </Badge>
        ))}
        {permissions.length > 2 ? (
          <Badge variant='outline'>+{permissions.length - 2}</Badge>
        ) : null}
      </div>
    )
  }

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
        <Button
          size='sm'
          variant='outline'
          onClick={() => utils.users.listUsers.invalidate()}
          disabled={usersQ.isFetching}
        >
          Refresh
        </Button>
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
                    column='permissions'
                    label='Permissions'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className='w-[140px]'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={5}>Loading users…</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No users found</TableCell>
                </TableRow>
              ) : (
                rows.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className='flex flex-col'>
                        <span className='font-medium'>{user.name ?? '—'}</span>
                        <span className='text-muted-foreground text-xs sm:hidden'>
                          {user.email ?? '—'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className='max-sm:hidden'>
                      {user.email ?? '—'}
                    </TableCell>
                    <TableCell>{user.discord_id ?? '—'}</TableCell>
                    <TableCell>
                      {summarizedPermissions(user.permissions)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setSelectedUser(user)
                          setDraftPermissions(user.permissions)
                        }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!usersQ.isLoading ? (
          <PaginationControls
            currentPage={page}
            totalPages={usersQ.data?.totalPages ?? 1}
            total={usersQ.data?.total ?? 0}
            pageSize={pageSize}
            itemLabel='users'
            onPageChange={(nextPage) => setQueryParams({ page: nextPage })}
            className='rounded-none border-0 border-t bg-background'
          />
        ) : null}
      </TableShell>

      <Dialog
        open={Boolean(selectedUser)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null)
            setDraftPermissions([])
          }
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Edit Permissions</DialogTitle>
            <DialogDescription>
              {selectedUser
                ? `Update access for ${selectedUser.name ?? selectedUser.email ?? selectedUser.id}.`
                : 'Update user access.'}
            </DialogDescription>
          </DialogHeader>

          <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
            <p className='font-medium'>
              {selectedUser?.name ?? 'Unknown user'}
            </p>
            <p className='text-muted-foreground'>
              {selectedUser?.email ?? 'No email'}
            </p>
            <p className='mt-1 text-muted-foreground text-xs'>
              {draftPermissions.length} of {groupedPermissionCount} permissions
              enabled
            </p>
          </div>

          <ScrollArea className='max-h-[55vh] pr-4'>
            <div className='space-y-4'>
              {PERMISSION_GROUPS.map((group) => (
                <section
                  key={group.title}
                  className='space-y-2 rounded-lg border p-3'
                >
                  <div>
                    <h3 className='font-medium text-sm'>{group.title}</h3>
                  </div>
                  <div className='space-y-3'>
                    {group.permissions.map((permission) => {
                      const checked = draftPermissions.includes(permission.key)

                      return (
                        <div
                          key={permission.key}
                          className='flex items-start gap-3 rounded-md border border-transparent p-2 hover:border-border hover:bg-muted/30'
                        >
                          <Checkbox
                            aria-label={permission.label}
                            checked={checked}
                            onCheckedChange={(value) =>
                              togglePermission(permission.key, value === true)
                            }
                            className='mt-0.5'
                          />
                          <div className='space-y-0.5'>
                            <p className='font-medium text-sm'>
                              {permission.label}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                              {permission.description}
                            </p>
                            <p className='text-[11px] text-muted-foreground'>
                              {permission.key}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setSelectedUser(null)
                setDraftPermissions([])
              }}
              disabled={updatePermissions.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!selectedUser) return
                updatePermissions.mutate({
                  userId: selectedUser.id,
                  permissions: draftPermissions,
                })
              }}
              disabled={!selectedUser || updatePermissions.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
