import { ipcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { Shortcut, CompareTarget } from '../../src/types'

interface StoreSchema {
  shortcuts: Shortcut[]
}

const store = new Store<StoreSchema>({
  name: 'shortcuts',
  defaults: { shortcuts: [] }
})

function signatureOf(s: Shortcut): string {
  if (s.type === 'compare' && s.compare) {
    const { left, right } = s.compare
    return `compare:${left.connectionId}:${left.database}:${right.connectionId}:${right.database}`
  }
  if (s.type === 'structure' && s.structure) {
    return `structure:${s.structure.connectionId}:${s.structure.database}`
  }
  return ''
}

export function registerShortcutHandlers(): void {
  ipcMain.handle('shortcuts:list', () => {
    return store.get('shortcuts', [])
  })

  ipcMain.handle('shortcuts:upsert-compare', (_event, left: CompareTarget, right: CompareTarget) => {
    const shortcuts = store.get('shortcuts', [])
    const sig = `compare:${left.connectionId}:${left.database}:${right.connectionId}:${right.database}`
    const existing = shortcuts.find((s) => signatureOf(s) === sig)
    if (existing) {
      existing.updatedAt = Date.now()
      store.set('shortcuts', shortcuts)
      return existing
    }
    const s: Shortcut = {
      id: randomUUID(),
      name: `${left.database} vs ${right.database}`,
      type: 'compare',
      compare: { left, right },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    shortcuts.unshift(s)
    store.set('shortcuts', shortcuts)
    return s
  })

  ipcMain.handle('shortcuts:upsert-structure', (_event, target: CompareTarget) => {
    const shortcuts = store.get('shortcuts', [])
    const sig = `structure:${target.connectionId}:${target.database}`
    const existing = shortcuts.find((s) => signatureOf(s) === sig)
    if (existing) {
      existing.updatedAt = Date.now()
      store.set('shortcuts', shortcuts)
      return existing
    }
    const s: Shortcut = {
      id: randomUUID(),
      name: target.database,
      type: 'structure',
      structure: target,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    shortcuts.unshift(s)
    store.set('shortcuts', shortcuts)
    return s
  })

  ipcMain.handle('shortcuts:rename', (_event, id: string, name: string) => {
    const shortcuts = store.get('shortcuts', [])
    const s = shortcuts.find((sc) => sc.id === id)
    if (!s) throw new Error('快捷操作不存在')
    s.name = name.trim() || s.name
    s.updatedAt = Date.now()
    store.set('shortcuts', shortcuts)
    return s
  })

  ipcMain.handle('shortcuts:delete', (_event, id: string) => {
    const shortcuts = store.get('shortcuts', [])
    store.set('shortcuts', shortcuts.filter((s) => s.id !== id))
    return true
  })
}
