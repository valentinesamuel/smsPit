import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { api } from '../lib/api'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import type { Project } from '../types'

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWebhook, setNewWebhook] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editWebhook, setEditWebhook] = useState('')

  const load = async () => {
    const res = await api.listProjects()
    setProjects(res.projects || [])
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    await api.createProject({ name: newName, webhook_url: newWebhook || undefined })
    setNewName('')
    setNewWebhook('')
    setShowCreate(false)
    load()
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete project "${name}"?`)) return
    await api.deleteProject(name)
    load()
  }

  const startEdit = (p: Project) => {
    setEditingId(p.id)
    setEditWebhook(p.webhook_url || '')
  }

  const saveEdit = async (name: string) => {
    await api.updateProject(name, { webhook_url: editWebhook || undefined })
    setEditingId(null)
    load()
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Projects</h1>
        <Button size="sm" onClick={() => setShowCreate(p => !p)}>
          <Plus size={14} /> New Project
        </Button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
          <Input label="Project name" id="name" placeholder="my-app" value={newName} onChange={e => setNewName(e.target.value)} required />
          <Input label="Webhook URL (optional)" id="webhook" placeholder="https://\u2026" value={newWebhook} onChange={e => setNewWebhook(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button size="sm" type="submit">Create</Button>
          </div>
        </form>
      )}

      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-700">
        {projects.length === 0 ? (
          <p className="p-6 text-center text-sm text-zinc-400">No projects yet</p>
        ) : projects.map(p => (
          <div key={p.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{p.name}</p>
                {editingId === p.id ? (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      className="flex-1 text-sm border border-zinc-300 dark:border-zinc-600 rounded px-2 py-1 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200"
                      placeholder="Webhook URL"
                      value={editWebhook}
                      onChange={e => setEditWebhook(e.target.value)}
                    />
                    <button onClick={() => saveEdit(p.name)} className="text-green-600 hover:text-green-700"><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600"><X size={16} /></button>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {p.webhook_url || <span className="italic">No webhook</span>}
                  </p>
                )}
              </div>
              {editingId !== p.id && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(p)}><Pencil size={12} /></Button>
                  {p.name !== 'default' && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.name)}>
                      <Trash2 size={12} className="text-red-500" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
