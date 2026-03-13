import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { logFilePlayers, logFiles, users } from '@/server/db/schema'

function buildPlayerSearchFilter(search: string) {
  const searchTerm = `%${search.trim().toLowerCase()}%`

  return sql`
    exists (
      select 1
      from ${logFilePlayers}
      where
        ${logFilePlayers.logFileId} = ${logFiles.id}
        and ${logFilePlayers.playerNameLower} like ${searchTerm}
    )
  `
}

export async function GET(req: NextRequest) {
  try {
    // Get the log file ID from the request
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const pageParam = searchParams.get('page')
    const pageSizeParam = searchParams.get('pageSize')
    const sortBy = (searchParams.get('sortBy') ?? 'createdAt').trim()
    const sortOrder = (searchParams.get('sortOrder') ?? 'desc').trim() as
      | 'asc'
      | 'desc'
    const search = (
      searchParams.get('search') ??
      searchParams.get('q') ??
      ''
    ).trim()

    // Check if user is authenticated
    const session = await auth()

    if (id) {
      const idNum = Number.parseInt(id, 10)
      if (Number.isNaN(idNum)) {
        return NextResponse.json(
          { error: 'Invalid log file id' },
          { status: 400 }
        )
      }

      // Fetching a specific log file by ID
      // For specific log files, we allow access to the owner or admins
      const logFile = await db
        .select({
          id: logFiles.id,
          fileName: logFiles.fileName,
          fileUrl: logFiles.fileUrl,
          parsedJson: logFiles.parsedJson,
          createdAt: logFiles.createdAt,
          userId: logFiles.userId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(logFiles)
        .leftJoin(users, eq(logFiles.userId, users.id))
        .where(eq(logFiles.id, idNum))
        .limit(1)

      if (logFile.length === 0) {
        return NextResponse.json(
          { error: 'Log file not found' },
          { status: 404 }
        )
      }

      // Check if user is authorized to access this log file
      // Allow access if user is admin or the owner of the log file
      if (
        !session ||
        (!['admin', 'owner'].includes(session.user.role) &&
          logFile?.[0]?.userId !== session.user.id)
      ) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      return NextResponse.json(logFile[0])
    }
    // Fetching all log files (admin only)
    if (!session || !['admin', 'owner'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSizeParam ?? '50', 10) || 50)
    )
    const offset = (page - 1) * pageSize

    const dir = sortOrder === 'asc' ? asc : desc
    const orderBy =
      sortBy === 'fileName'
        ? [dir(logFiles.fileName), desc(logFiles.createdAt), desc(logFiles.id)]
        : sortBy === 'userName'
          ? [
              dir(users.name),
              dir(users.email),
              desc(logFiles.createdAt),
              desc(logFiles.id),
            ]
          : [dir(logFiles.createdAt), desc(logFiles.id)]

    const where = search
      ? or(
          ilike(logFiles.fileName, `%${search}%`),
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
          buildPlayerSearchFilter(search)
        )
      : undefined

    const [{ total } = { total: 0 }] = await (where
      ? db
          .select({ total: sql<string>`count(*)::int` })
          .from(logFiles)
          .leftJoin(users, eq(logFiles.userId, users.id))
          .where(where)
      : db
          .select({ total: sql<string>`count(*)::int` })
          .from(logFiles)
          .leftJoin(users, eq(logFiles.userId, users.id)))

    // Get paginated log files with user info
    const logs = await (where
      ? db
          .select({
            id: logFiles.id,
            fileName: logFiles.fileName,
            fileUrl: logFiles.fileUrl,
            createdAt: logFiles.createdAt,
            userId: logFiles.userId,
            userName: users.name,
            userEmail: users.email,
          })
          .from(logFiles)
          .leftJoin(users, eq(logFiles.userId, users.id))
          .where(where)
          .orderBy(...orderBy)
          .limit(pageSize)
          .offset(offset)
      : db
          .select({
            id: logFiles.id,
            fileName: logFiles.fileName,
            fileUrl: logFiles.fileUrl,
            createdAt: logFiles.createdAt,
            userId: logFiles.userId,
            userName: users.name,
            userEmail: users.email,
          })
          .from(logFiles)
          .leftJoin(users, eq(logFiles.userId, users.id))
          .orderBy(...orderBy)
          .limit(pageSize)
          .offset(offset))

    const totalNum = Number(total ?? 0)
    const totalPages = Math.max(1, Math.ceil(totalNum / pageSize))

    return NextResponse.json({
      data: logs,
      page,
      pageSize,
      total: totalNum,
      totalPages,
      search: search || null,
    })
  } catch (error) {
    console.error('Error fetching log files:', error)
    return NextResponse.json(
      { error: 'Failed to fetch log files' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Check if user is authenticated and is an admin
    const session = await auth()
    if (!session || !['admin', 'owner'].includes(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the log file ID from the request
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Log file ID is required' },
        { status: 400 }
      )
    }

    // Delete the log file from the database
    await db.delete(logFiles).where(eq(logFiles.id, Number.parseInt(id, 10)))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting log file:', error)
    return NextResponse.json(
      { error: 'Failed to delete log file' },
      { status: 500 }
    )
  }
}
