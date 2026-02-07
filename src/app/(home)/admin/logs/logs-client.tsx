'use client'

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
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs'
import { useCallback, useEffect, useState } from 'react'
import { useDebounceValue } from 'usehooks-ts'

type LogFile = {
  id: number
  fileName: string
  fileUrl: string
  createdAt: string
  userId: string | null
  userName: string | null
  userEmail: string | null
}

type SortBy = 'createdAt' | 'fileName' | 'userName'

export function LogsClient() {
  const pageSize = 50
  const [logs, setLogs] = useState<LogFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const router = useRouter()

  const [queryParams, setQueryParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      search: parseAsString,
      sortBy: parseAsString.withDefault('createdAt'),
      sortOrder: parseAsString.withDefault('desc'),
    },
    { history: 'push' }
  )

  const { page, search } = queryParams
  const sortBy = (['createdAt', 'fileName', 'userName'] as const).includes(
    queryParams.sortBy as SortBy
  )
    ? (queryParams.sortBy as SortBy)
    : 'createdAt'
  const sortOrder = (queryParams.sortOrder === 'asc' ? 'asc' : 'desc') as
    | 'asc'
    | 'desc'

  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)

  const [searchInput, setSearchInput] = useState(search || '')
  const [debouncedSearch] = useDebounceValue(searchInput, 400)

  useEffect(() => {
    setSearchInput(search || '')
  }, [search])

  useEffect(() => {
    setQueryParams({ search: debouncedSearch || null, page: 1 })
  }, [debouncedSearch, setQueryParams])

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (search) params.set('search', search)
      if (sortBy) params.set('sortBy', sortBy)
      if (sortOrder) params.set('sortOrder', sortOrder)

      const response = await fetch(`/api/logs?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Failed to fetch logs')
      }

      const data = (await response.json()) as {
        data: LogFile[]
        page: number
        pageSize: number
        total: number
        totalPages: number
      }

      setLogs(data.data)
      setTotal(data.total)
      setTotalPages(data.totalPages)

      if (data.totalPages > 0 && page > data.totalPages) {
        setQueryParams({ page: data.totalPages })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, sortBy, sortOrder, setQueryParams])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSort = useCallback(
    (column: string) => {
      const nextOrder =
        sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc'
      setQueryParams({ sortBy: column, sortOrder: nextOrder, page: 1 })
    },
    [setQueryParams, sortBy, sortOrder]
  )

  const handleViewInParser = (id: number) => {
    // Navigate to the log parser page with the log ID as a query parameter
    router.push(`/log-parser?logId=${id}`)
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this log file?')) return

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/logs?id=${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete log file')
      }

      // Refresh the logs list
      await fetchLogs()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'An error occurred while deleting'
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className='flex w-full flex-col gap-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
        <Input
          placeholder='Search by file or user'
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className='w-full sm:max-w-sm'
        />
      </div>

      <TableShell className='overflow-hidden'>
        <div className='overflow-x-auto'>
          <Table>
            <TableHeader className='sticky top-0 z-10 bg-background'>
              <TableRow className='bg-muted/50'>
                <TableHead>
                  <SortableHeader
                    column='fileName'
                    label='File Name'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    column='userName'
                    label='Uploaded By'
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    column='createdAt'
                    label='Date'
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
                  <TableCell colSpan={4}>Loading logs...</TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className='text-red-500'>
                    {error}
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No logs found</TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.fileName}</TableCell>
                    <TableCell>
                      {log.userName || log.userEmail || 'Anonymous'}
                    </TableCell>
                    <TableCell>
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className='flex gap-2'>
                      <Button
                        variant='outline'
                        onClick={() => handleViewInParser(log.id)}
                      >
                        View in Parser
                      </Button>
                      <Button
                        variant='destructive'
                        size='icon'
                        onClick={() => handleDelete(log.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && !error && (
          <PaginationControls
            currentPage={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            itemLabel='logs'
            onPageChange={(p) => setQueryParams({ page: p })}
            className='rounded-none border-0 border-t bg-background'
          />
        )}
      </TableShell>
    </div>
  )
}
