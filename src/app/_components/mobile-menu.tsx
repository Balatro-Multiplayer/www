'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from 'fumadocs-ui/components/layout/theme-toggle'
import type { HomeLayoutProps } from 'fumadocs-ui/layouts/home'
import { replaceOrDefault } from 'fumadocs-ui/layouts/shared'
import {
  BarChart3,
  BookOpen,
  CircleDollarSign,
  FileText,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  Settings,
  Shield,
  Trophy,
  Tv,
  Upload,
  User,
} from 'lucide-react'
import { signIn, signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { useState } from 'react'

function MobileMenuLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className='flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground active:bg-fd-accent/80'
    >
      {icon}
      {children}
    </Link>
  )
}

export function MobileMenu({
  themeSwitch,
  className,
}: {
  themeSwitch?: HomeLayoutProps['themeSwitch']
  className?: string
}) {
  const { data: session, status } = useSession()
  const isAuthenticated = status === 'authenticated'
  const isAdmin = isAuthenticated && session?.user?.role === 'admin'
  const isOwner = isAuthenticated && session?.user?.role === 'owner'
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className={className}
          aria-label='Open menu'
        >
          <MenuIcon className='size-5' />
        </Button>
      </SheetTrigger>
      <SheetContent side='right' className='w-72 p-0'>
        <SheetTitle className='sr-only'>Navigation menu</SheetTitle>

        {/* User section */}
        {isAuthenticated && session?.user ? (
          <div className='flex items-center gap-3 border-b px-5 pt-14 pb-4'>
            <Avatar className='size-9'>
              <AvatarImage
                src={session.user.image ?? ''}
                alt={session.user.name ?? 'User'}
              />
              <AvatarFallback className='bg-violet-50 text-violet-600 dark:bg-violet-900/50 dark:text-violet-300'>
                {session.user.name?.slice(0, 2).toUpperCase() ?? 'U'}
              </AvatarFallback>
            </Avatar>
            <div className='flex flex-col'>
              <span className='text-sm font-semibold'>
                {session.user.name}
              </span>
              <span className='text-xs text-fd-muted-foreground'>
                Signed in
              </span>
            </div>
          </div>
        ) : (
          <div className='border-b px-5 pt-14 pb-4'>
            <Button
              variant='outline'
              size='sm'
              className='w-full'
              onClick={() => {
                close()
                signIn('discord')
              }}
            >
              <LogIn className='mr-2 size-4' />
              Sign in with Discord
            </Button>
          </div>
        )}

        {/* Navigation */}
        <div className='flex flex-1 flex-col overflow-y-auto'>
          <nav className='flex flex-col gap-0.5 px-3 py-3'>
            <MobileMenuLink
              href='/docs'
              icon={<BookOpen className='size-4' />}
              onClick={close}
            >
              Documentation
            </MobileMenuLink>
            <MobileMenuLink
              href='/leaderboards'
              icon={<Trophy className='size-4' />}
              onClick={close}
            >
              Leaderboards
            </MobileMenuLink>
            <MobileMenuLink
              href='/support-us'
              icon={<CircleDollarSign className='size-4' />}
              onClick={close}
            >
              Support Us
            </MobileMenuLink>
            <MobileMenuLink
              href='/stats'
              icon={<BarChart3 className='size-4' />}
              onClick={close}
            >
              Stats
            </MobileMenuLink>
            <MobileMenuLink
              href='/blog'
              icon={<FileText className='size-4' />}
              onClick={close}
            >
              Blog
            </MobileMenuLink>
          </nav>

          <Separator />

          {/* Tools */}
          <div className='px-3 py-3'>
            <p className='mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground'>
              Tools
            </p>
            <MobileMenuLink
              href='/profile-fix'
              icon={<Upload className='size-4' />}
              onClick={close}
            >
              Fix Corrupted Profile
            </MobileMenuLink>
            <MobileMenuLink
              href='/log-parser'
              icon={<FileText className='size-4' />}
              onClick={close}
            >
              Log Parser
            </MobileMenuLink>
          </div>

          {/* User links */}
          {isAuthenticated && session?.user && (
            <>
              <Separator />
              <div className='px-3 py-3'>
                <p className='mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground'>
                  Account
                </p>
                <MobileMenuLink
                  href={`/players/${session.user.discord_id}`}
                  icon={<User className='size-4' />}
                  onClick={close}
                >
                  Profile
                </MobileMenuLink>
                <MobileMenuLink
                  href='/profile/settings'
                  icon={<Settings className='size-4' />}
                  onClick={close}
                >
                  Settings
                </MobileMenuLink>
                <MobileMenuLink
                  href={`/stream-card/${session.user.discord_id}`}
                  icon={<Tv className='size-4' />}
                  onClick={close}
                >
                  Stream Widget
                </MobileMenuLink>
              </div>
            </>
          )}

          {/* Admin */}
          {(isAdmin || isOwner) && (
            <>
              <Separator />
              <div className='px-3 py-3'>
                <p className='mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-fd-muted-foreground'>
                  <Shield className='mr-1 inline size-3' />
                  Admin
                </p>
                {isOwner && (
                  <MobileMenuLink
                    href='/admin/roles'
                    icon={<Shield className='size-4' />}
                    onClick={close}
                  >
                    Role Manager
                  </MobileMenuLink>
                )}
                {isOwner && (
                  <MobileMenuLink
                    href='/admin/seasons'
                    icon={<Settings className='size-4' />}
                    onClick={close}
                  >
                    Seasons
                  </MobileMenuLink>
                )}
                <MobileMenuLink
                  href='/admin/blog'
                  icon={<FileText className='size-4' />}
                  onClick={close}
                >
                  Blog
                </MobileMenuLink>
                <MobileMenuLink
                  href='/admin/logs'
                  icon={<FileText className='size-4' />}
                  onClick={close}
                >
                  Logs
                </MobileMenuLink>
                <MobileMenuLink
                  href='/admin/releases'
                  icon={<FileText className='size-4' />}
                  onClick={close}
                >
                  Releases
                </MobileMenuLink>
                <MobileMenuLink
                  href='/admin/stream/obs-control-panel'
                  icon={<Tv className='size-4' />}
                  onClick={close}
                >
                  OBS Control Panel
                </MobileMenuLink>
              </div>
            </>
          )}

          {/* Footer */}
          <div className='mt-auto border-t px-3 py-3'>
            <div className='flex items-center justify-between px-3'>
              <span className='text-xs text-fd-muted-foreground'>Theme</span>
              {replaceOrDefault(
                themeSwitch,
                <ThemeToggle mode={themeSwitch?.mode} />
              )}
            </div>
            {isAuthenticated && (
              <button
                type='button'
                onClick={() => {
                  close()
                  signOut()
                }}
                className='mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 active:bg-destructive/20'
              >
                <LogOut className='size-4' />
                Sign out
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
