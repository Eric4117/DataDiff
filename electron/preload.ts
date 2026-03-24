import { contextBridge, ipcRenderer } from 'electron'
import type { Connection, CompareTarget, DiffResult, DatabaseStructure, Shortcut, Project, ProjectTable } from '../src/types'

const api = {
  connections: {
    list: (): Promise<Connection[]> => ipcRenderer.invoke('connections:list'),
    add: (conn: Omit<Connection, 'id'>): Promise<Connection> =>
      ipcRenderer.invoke('connections:add', conn),
    update: (conn: Connection): Promise<Connection> =>
      ipcRenderer.invoke('connections:update', conn),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('connections:delete', id),
    test: (conn: Omit<Connection, 'id'>): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke('connections:test', conn)
  },
  schema: {
    databases: (connId: string): Promise<string[]> =>
      ipcRenderer.invoke('schema:databases', connId),
    structure: (connId: string, database: string): Promise<DatabaseStructure> =>
      ipcRenderer.invoke('schema:structure', connId, database),
    compare: (left: CompareTarget, right: CompareTarget): Promise<DiffResult> =>
      ipcRenderer.invoke('schema:compare', left, right)
  },
  shortcuts: {
    list: (): Promise<Shortcut[]> => ipcRenderer.invoke('shortcuts:list'),
    upsertCompare: (left: CompareTarget, right: CompareTarget): Promise<Shortcut> =>
      ipcRenderer.invoke('shortcuts:upsert-compare', left, right),
    upsertStructure: (target: CompareTarget): Promise<Shortcut> =>
      ipcRenderer.invoke('shortcuts:upsert-structure', target),
    rename: (id: string, name: string): Promise<Shortcut> =>
      ipcRenderer.invoke('shortcuts:rename', id, name),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('shortcuts:delete', id)
  },
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke('projects:list'),
    create: (name: string): Promise<Project> => ipcRenderer.invoke('projects:create', name),
    rename: (id: string, name: string): Promise<Project> =>
      ipcRenderer.invoke('projects:rename', id, name),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('projects:delete', id),
    addTable: (projectId: string, table: ProjectTable): Promise<Project> =>
      ipcRenderer.invoke('projects:add-table', projectId, table),
    removeTable: (projectId: string, table: ProjectTable): Promise<Project> =>
      ipcRenderer.invoke('projects:remove-table', projectId, table)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
