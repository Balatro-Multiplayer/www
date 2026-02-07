'use client'

import { PaginationControls } from '@/app/_components/pagination-controls'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    },
    { history: 'push' }
  )

  const { page, search } = queryParams

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
  }, [page, search, setQueryParams])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleViewInParser = (id: number) => {
    // Navigate to the log parser page with the log ID as a query parameter
    router.push(`/log-parser?logId=${id}`)
  }

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this log file?')) {
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
          err instanceof Error
            ? err.message
            : 'An error occurred while deleting'
        )
      } finally {
        setIsDeleting(false)
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <CardTitle>Log Files</CardTitle>
            <CardDescription>
              View and manage uploaded log files
            </CardDescription>
          </div>
          <div className='flex w-full flex-col gap-1 sm:w-[320px]'>
            <Label>Search</Label>
            <Input
              placeholder='File/user...'
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p>Loading logs...</p>
        ) : error ? (
          <p className='text-red-500'>{error}</p>
        ) : logs.length === 0 ? (
          <p>No logs found</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Uploaded By</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
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
              ))}
            </TableBody>
          </Table>
        )}

        {!isLoading && !error && (
          <div className='pt-4'>
            <PaginationControls
              currentPage={page}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              itemLabel='logs'
              onPageChange={(p) => setQueryParams({ page: p })}
              className='rounded-lg'
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
