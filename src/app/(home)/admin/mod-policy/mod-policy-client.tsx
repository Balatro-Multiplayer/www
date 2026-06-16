'use client'

import { Check, ExternalLink, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { api } from '@/trpc/react'

type Status = 'banned' | 'approved'
type Category = { id: number; name: string }
type Entry = {
  id: number
  modId: string
  name: string
  url: string | null
  status: Status
  versions: string[] | null
  categories: Category[]
}
type Draft = {
  modId: string
  name: string
  url: string
  status: Status
  categoryIds: number[]
}

const STATUS_OPTIONS: Status[] = ['banned', 'approved']

const emptyDraft: Draft = {
  modId: '',
  name: '',
  url: '',
  status: 'banned',
  categoryIds: [],
}

const toggleId = (ids: number[], id: number) =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]

export function ModPolicyClient() {
  const utils = api.useUtils()
  const { data: list = [] } = api.modPolicy.list.useQuery()
  const { data: categories = [] } = api.modPolicy.categories.useQuery()

  const [add, setAdd] = useState<Draft>(emptyDraft)
  const [editId, setEditId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [newCategory, setNewCategory] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null
  )

  const save = api.modPolicy.save.useMutation({
    onSuccess: async () => {
      await utils.modPolicy.list.invalidate()
      toast.success('Saved')
    },
    onError: (e) => toast.error(e.message),
  })
  const del = api.modPolicy.delete.useMutation({
    onSuccess: async () => {
      await utils.modPolicy.list.invalidate()
      toast.success('Removed')
    },
    onError: (e) => toast.error(e.message),
  })
  const addCategory = api.modPolicy.addCategory.useMutation({
    onSuccess: async () => {
      await utils.modPolicy.categories.invalidate()
      setNewCategory('')
      setEditingCategoryId(null)
      toast.success('Category saved')
    },
    onError: (e) => toast.error(e.message),
  })
  const renameCategory = api.modPolicy.renameCategory.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.modPolicy.categories.invalidate(),
        utils.modPolicy.list.invalidate(),
      ])
      setNewCategory('')
      setEditingCategoryId(null)
      toast.success('Category renamed')
    },
    onError: (e) => toast.error(e.message),
  })
  const deleteCategory = api.modPolicy.deleteCategory.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.modPolicy.categories.invalidate(),
        utils.modPolicy.list.invalidate(),
      ])
      toast.success('Category removed')
    },
    onError: (e) => toast.error(e.message),
  })

  const { banned, approved } = useMemo(
    () => ({
      banned: list.filter((e) => e.status === 'banned'),
      approved: list.filter((e) => e.status === 'approved'),
    }),
    [list]
  )

  // Called only after validate() — modId and name are guaranteed non-empty.
  const toPayload = (d: Draft) => ({
    modId: d.modId.trim(),
    status: d.status,
    name: d.name.trim(),
    url: d.url.trim() || null,
    categoryIds: d.categoryIds,
    versions: null,
  })
  const validate = (d: Draft) => {
    if (!d.modId.trim()) {
      toast.error('A mod id is required')
      return false
    }
    if (!d.name.trim()) {
      toast.error('A name is required')
      return false
    }
    return true
  }

  const submitAdd = () => {
    if (!validate(add)) return
    save.mutate(toPayload(add), { onSuccess: () => setAdd(emptyDraft) })
  }
  const beginEdit = (e: Entry) => {
    setEditId(e.id)
    setDraft({
      modId: e.modId,
      name: e.name,
      url: e.url ?? '',
      status: e.status,
      categoryIds: e.categories.map((c) => c.id),
    })
  }
  const saveEdit = () => {
    if (editId === null || !validate(draft)) return
    save.mutate(
      { id: editId, ...toPayload(draft) },
      { onSuccess: () => setEditId(null) }
    )
  }
  const submitCategory = () => {
    const name = newCategory.trim()
    if (!name) return
    if (editingCategoryId)
      renameCategory.mutate({ id: editingCategoryId, name })
    else addCategory.mutate({ name })
  }

  return (
    <div className='flex flex-col gap-6'>
      {/* categories */}
      <div className='flex flex-col gap-2 rounded-lg border p-4'>
        <Label>Categories</Label>
        <div className='flex flex-wrap items-center gap-2'>
          {categories.map((c) => (
            <Badge key={c.id} variant='secondary' className='gap-1'>
              {c.name}
              <button
                type='button'
                title='Rename category'
                onClick={() => {
                  setEditingCategoryId(c.id)
                  setNewCategory(c.name)
                }}
              >
                <Pencil className='size-3' />
              </button>
              <button
                type='button'
                title='Delete category'
                onClick={() => deleteCategory.mutate({ id: c.id })}
              >
                <X className='size-3' />
              </button>
            </Badge>
          ))}
          {categories.length === 0 && (
            <span className='text-fd-muted-foreground text-sm'>
              No categories yet.
            </span>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitCategory()
              }
            }}
            placeholder={
              editingCategoryId
                ? 'Rename category'
                : 'New category, e.g. Game speed'
            }
            className='w-64'
          />
          <Button variant='secondary' onClick={submitCategory}>
            {editingCategoryId ? 'Update category' : 'Add category'}
          </Button>
          {editingCategoryId !== null && (
            <Button
              variant='ghost'
              onClick={() => {
                setEditingCategoryId(null)
                setNewCategory('')
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* add form */}
      <div className='flex flex-col gap-3 rounded-lg border p-4'>
        <div className='flex flex-wrap items-end gap-3'>
          <Field label='Mod id (SMODS id)'>
            <Input
              value={add.modId}
              onChange={(e) => setAdd((d) => ({ ...d, modId: e.target.value }))}
              placeholder='e.g. Saturn'
              className='w-40'
            />
          </Field>
          <Field label='Name'>
            <Input
              value={add.name}
              onChange={(e) => setAdd((d) => ({ ...d, name: e.target.value }))}
              placeholder='Display name'
              className='w-40'
            />
          </Field>
          <Field label='Hosting URL (optional)'>
            <Input
              value={add.url}
              onChange={(e) => setAdd((d) => ({ ...d, url: e.target.value }))}
              placeholder='https://github.com/…'
              className='w-52'
            />
          </Field>
          <Field label='Status'>
            <StatusSelect
              value={add.status}
              onChange={(status) => setAdd((d) => ({ ...d, status }))}
              className='h-9'
            />
          </Field>
          <Button onClick={submitAdd} disabled={save.isPending}>
            <Plus className='mr-1 size-4' /> Add
          </Button>
        </div>
        <Field label='Categories'>
          <CategoryPicker
            categories={categories}
            selected={add.categoryIds}
            onToggle={(id) =>
              setAdd((d) => ({
                ...d,
                categoryIds: toggleId(d.categoryIds, id),
              }))
            }
          />
        </Field>
      </div>

      <div className='text-fd-muted-foreground text-sm'>
        {banned.length} banned · {approved.length} approved
      </div>

      <PolicyTable
        title='Banned'
        rows={banned}
        categories={categories}
        editId={editId}
        draft={draft}
        setDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onEdit={beginEdit}
        onSave={saveEdit}
        onCancel={() => setEditId(null)}
        onDelete={(id) => del.mutate({ id })}
        busy={save.isPending || del.isPending}
      />
      <PolicyTable
        title='Approved'
        rows={approved}
        categories={categories}
        editId={editId}
        draft={draft}
        setDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onEdit={beginEdit}
        onSave={saveEdit}
        onCancel={() => setEditId(null)}
        onDelete={(id) => del.mutate({ id })}
        busy={save.isPending || del.isPending}
      />
    </div>
  )
}

function StatusSelect({
  value,
  onChange,
  className,
}: {
  value: Status
  onChange: (status: Status) => void
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className={cn('rounded-md border bg-transparent px-2 text-sm', className)}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}

function CategoryPicker({
  categories,
  selected,
  onToggle,
}: {
  categories: Category[]
  selected: number[]
  onToggle: (id: number) => void
}) {
  if (categories.length === 0)
    return (
      <span className='text-fd-muted-foreground text-sm'>
        No categories yet.
      </span>
    )
  return (
    <div className='flex flex-wrap gap-1'>
      {categories.map((c) => {
        const on = selected.includes(c.id)
        return (
          <button
            key={c.id}
            type='button'
            onClick={() => onToggle(c.id)}
            className={cn(
              'rounded-full border px-2 py-0.5 text-xs',
              on
                ? 'border-fd-primary bg-fd-primary text-fd-primary-foreground'
                : 'text-fd-muted-foreground'
            )}
          >
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className='flex flex-col gap-1'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function PolicyTable({
  title,
  rows,
  categories,
  editId,
  draft,
  setDraft,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  busy,
}: {
  title: string
  rows: Entry[]
  categories: Category[]
  editId: number | null
  draft: Draft
  setDraft: (patch: Partial<Draft>) => void
  onEdit: (e: Entry) => void
  onSave: () => void
  onCancel: () => void
  onDelete: (id: number) => void
  busy: boolean
}) {
  return (
    <div className='flex flex-col gap-2'>
      <h2 className='font-semibold text-lg'>
        {title}{' '}
        <span className='text-fd-muted-foreground text-sm'>
          ({rows.length})
        </span>
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Id</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Link</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) =>
            editId === e.id ? (
              <EditRow
                key={e.id}
                draft={draft}
                categories={categories}
                setDraft={setDraft}
                onSave={onSave}
                onCancel={onCancel}
                busy={busy}
              />
            ) : (
              <ViewRow
                key={e.id}
                entry={e}
                onEdit={onEdit}
                onDelete={onDelete}
                busy={busy}
              />
            )
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function EditRow({
  draft,
  categories,
  setDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: Draft
  categories: Category[]
  setDraft: (patch: Partial<Draft>) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}) {
  return (
    <TableRow>
      <TableCell>
        <Input
          value={draft.name}
          onChange={(e) => setDraft({ name: e.target.value })}
          className='h-8 w-36'
        />
      </TableCell>
      <TableCell>
        <Input
          value={draft.modId}
          onChange={(e) => setDraft({ modId: e.target.value })}
          className='h-8 w-32 font-mono'
        />
      </TableCell>
      <TableCell>
        <CategoryPicker
          categories={categories}
          selected={draft.categoryIds}
          onToggle={(id) =>
            setDraft({ categoryIds: toggleId(draft.categoryIds, id) })
          }
        />
      </TableCell>
      <TableCell>
        <StatusSelect
          value={draft.status}
          onChange={(status) => setDraft({ status })}
          className='h-8'
        />
      </TableCell>
      <TableCell>
        <Input
          value={draft.url}
          onChange={(e) => setDraft({ url: e.target.value })}
          placeholder='https://…'
          className='h-8 w-44'
        />
      </TableCell>
      <TableCell className='text-right'>
        <Button
          variant='ghost'
          size='icon'
          onClick={onSave}
          disabled={busy}
          title='Save'
        >
          <Check className='size-4 text-green-600' />
        </Button>
        <Button variant='ghost' size='icon' onClick={onCancel} title='Cancel'>
          <X className='size-4' />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function ViewRow({
  entry,
  onEdit,
  onDelete,
  busy,
}: {
  entry: Entry
  onEdit: (e: Entry) => void
  onDelete: (id: number) => void
  busy: boolean
}) {
  return (
    <TableRow>
      <TableCell>{entry.name}</TableCell>
      <TableCell className='font-mono text-sm'>{entry.modId}</TableCell>
      <TableCell className='text-sm'>
        {entry.categories.length > 0 ? (
          <span className='flex flex-wrap gap-1'>
            {entry.categories.map((c) => (
              <Badge key={c.id} variant='outline'>
                {c.name}
              </Badge>
            ))}
          </span>
        ) : (
          <span className='text-fd-muted-foreground'>—</span>
        )}
      </TableCell>
      <TableCell className='text-sm'>{entry.status}</TableCell>
      <TableCell>
        {entry.url ? (
          <a
            href={entry.url}
            target='_blank'
            rel='noreferrer'
            className='inline-flex items-center gap-1 text-fd-primary text-sm hover:underline'
          >
            open <ExternalLink className='size-3' />
          </a>
        ) : (
          <span className='text-fd-muted-foreground'>—</span>
        )}
      </TableCell>
      <TableCell className='text-right'>
        <Button
          variant='ghost'
          size='icon'
          onClick={() => onEdit(entry)}
          title='Edit'
        >
          <Pencil className='size-4' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          onClick={() => onDelete(entry.id)}
          disabled={busy}
          title='Delete'
        >
          <Trash2 className='size-4 text-red-500' />
        </Button>
      </TableCell>
    </TableRow>
  )
}
