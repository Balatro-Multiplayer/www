import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { env } from '@/env'
import { PERMISSION_KEYS } from '@/lib/permissions'
import { db } from '@/server/db'
import { sessions, users } from '@/server/db/schema'

/**
 * Local-dev-only login shortcut that skips Discord OAuth.
 *
 * Visiting `/api/dev-login` upserts a full-permission admin user and mints a
 * real database session (the exact same mechanism prod uses — we just bypass
 * the OAuth step), then sets the Auth.js session cookie and redirects home.
 *
 * Hard-disabled in production. Never ships a usable login there.
 */
const DEV_USER_ID = 'dev-admin'
// Auth.js v5 default cookie name over http (no `__Secure-` prefix locally).
const SESSION_COOKIE = 'authjs.session-token'
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  if (env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      name: 'Dev Admin',
      email: 'dev-admin@localhost',
      discord_id: DEV_USER_ID,
      role: 'admin',
      permissions: [...PERMISSION_KEYS],
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { role: 'admin', permissions: [...PERMISSION_KEYS] },
    })

  const sessionToken = randomUUID()
  const expires = new Date(Date.now() + THIRTY_DAYS_MS)

  await db.insert(sessions).values({
    sessionToken,
    userId: DEV_USER_ID,
    expires,
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires,
  })

  return NextResponse.redirect(new URL('/', request.url))
}
