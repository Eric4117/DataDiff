import { ipcMain } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'crypto'
import type { Project, ProjectTable } from '../../src/types'

interface StoreSchema {
  projects: Project[]
}

const store = new Store<StoreSchema>({
  name: 'projects',
  defaults: { projects: [] }
})

function isSameTable(a: ProjectTable, b: ProjectTable): boolean {
  return a.connectionId === b.connectionId && a.database === b.database && a.tableName === b.tableName
}

export function registerProjectHandlers(): void {
  ipcMain.handle('projects:list', () => {
    return store.get('projects', [])
  })

  ipcMain.handle('projects:create', (_event, name: string) => {
    const projects = store.get('projects', [])
    const now = Date.now()
    const project: Project = {
      id: randomUUID(),
      name,
      tables: [],
      createdAt: now,
      updatedAt: now
    }
    projects.push(project)
    store.set('projects', projects)
    return project
  })

  ipcMain.handle('projects:rename', (_event, id: string, name: string) => {
    const projects = store.get('projects', [])
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('项目不存在')
    projects[idx].name = name
    projects[idx].updatedAt = Date.now()
    store.set('projects', projects)
    return projects[idx]
  })

  ipcMain.handle('projects:delete', (_event, id: string) => {
    const projects = store.get('projects', [])
    store.set('projects', projects.filter((p) => p.id !== id))
    return true
  })

  ipcMain.handle('projects:add-table', (_event, projectId: string, table: ProjectTable) => {
    const projects = store.get('projects', [])
    const idx = projects.findIndex((p) => p.id === projectId)
    if (idx === -1) throw new Error('项目不存在')
    const already = projects[idx].tables.some((t) => isSameTable(t, table))
    if (!already) {
      projects[idx].tables.push(table)
      projects[idx].updatedAt = Date.now()
      store.set('projects', projects)
    }
    return projects[idx]
  })

  ipcMain.handle('projects:remove-table', (_event, projectId: string, table: ProjectTable) => {
    const projects = store.get('projects', [])
    const idx = projects.findIndex((p) => p.id === projectId)
    if (idx === -1) throw new Error('项目不存在')
    projects[idx].tables = projects[idx].tables.filter((t) => !isSameTable(t, table))
    projects[idx].updatedAt = Date.now()
    store.set('projects', projects)
    return projects[idx]
  })
}
