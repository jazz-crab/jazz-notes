import { useState } from 'react'
import { useNotesStore, type SidebarSelection } from '../stores/notes'
import { useSettingsStore } from '../stores/settings'
import { useColors } from '../theme'
import { t } from '../utils/i18n'
import { leafName, depthOf, isSelfOrChild } from '../utils/folder'
import PromptDialog from './PromptDialog'
import ConfirmDialog from './ConfirmDialog'
import ContextMenu from './ContextMenu'
import Modal from './Modal'

export default function Sidebar() {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const folders = useNotesStore((s) => s.folders)
  const sidebarSelection = useNotesStore((s) => s.sidebarSelection)
  const setSidebarSelection = useNotesStore((s) => s.setSidebarSelection)
  const createFolder = useNotesStore((s) => s.createFolder)
  const renameFolder = useNotesStore((s) => s.renameFolder)
  const moveFolder = useNotesStore((s) => s.moveFolder)
  const moveNote = useNotesStore((s) => s.moveNote)
  const deleteFolder = useNotesStore((s) => s.deleteFolder)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; folder: string } | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [movingFolder, setMovingFolder] = useState<string | null>(null)
  const [deletingFolder, setDeletingFolder] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const filterItems: Array<{ type: SidebarSelection; label: string }> = [
    { type: { type: 'all' }, label: t('all.notes', lang) },
    { type: { type: 'today' }, label: t('today', lang) },
    { type: { type: 'tomorrow' }, label: t('tomorrow', lang) },
    { type: { type: 'week' }, label: t('week', lang) },
    { type: { type: 'later' }, label: t('later', lang) },
    { type: { type: 'nodate' }, label: t('no.date', lang) },
  ]

  const isSelected = (sel: SidebarSelection): boolean => {
    if (sel.type !== sidebarSelection.type) return false
    if (sel.type === 'folder' && sidebarSelection.type === 'folder') {
      return sel.path === (sidebarSelection as any).path
    }
    return true
  }

  const handleNewFolder = (name: string) => {
    createFolder(name)
    setShowNewFolder(false)
  }

  const handleRenameFolder = (name: string) => {
    if (renamingFolder) renameFolder(renamingFolder, name)
    setRenamingFolder(null)
  }

  const sortedFolders = [...folders].sort()

  const moveTargets = movingFolder
    ? folders
        .filter((f) => !isSelfOrChild(f, movingFolder))
        .sort()
    : []

  return (
    <div style={container(colors)}>
      <div style={title(colors)}>JazzNote</div>

      <div style={section}>
        {filterItems.map((item) => (
          <div
            key={item.label}
            style={{
              ...itemStyle(colors),
              ...(isSelected(item.type) ? itemSelectedStyle(colors) : {}),
            }}
            onClick={() => setSidebarSelection(item.type)}
          >
            {item.label}
          </div>
        ))}
      </div>

      <div style={divider(colors)} />

      <div style={section}>
        <div style={sectionHeader(colors)}>
          <span>{t('folders', lang)}</span>
          <button style={addBtn(colors)} onClick={() => setShowNewFolder(true)}>+</button>
        </div>
        {sortedFolders.map((folder) => (
          <div
            key={folder}
            style={{
              ...itemStyle(colors),
              ...(isSelected({ type: 'folder', path: folder }) ? itemSelectedStyle(colors) : {}),
              ...(dragOver === folder ? dragOverStyle(colors) : {}),
            }}
            onClick={() => setSidebarSelection({ type: 'folder', path: folder })}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu({ x: e.clientX, y: e.clientY, folder })
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-jazz-note')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOver(folder)
              }
            }}
            onDragLeave={() => setDragOver((cur) => (cur === folder ? null : cur))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const relPath = e.dataTransfer.getData('application/x-jazz-note')
              if (relPath) void moveNote(relPath, folder)
            }}
          >
            <span style={{ ...folderNameStyle, paddingLeft: depthOf(folder) * 14 }}>
              {"\u2514"} {leafName(folder)}
            </span>
          </div>
        ))}
        {folders.length === 0 && (
          <div style={emptyText(colors)}>{t('no.folders', lang)}</div>
        )}
      </div>

      <div style={{ marginTop: 'auto', padding: '8px 16px' }}>
        <button style={settingsBtn(colors)} onClick={openSettings}>
          {t('settings', lang)}
        </button>
      </div>

      {showNewFolder && (
        <PromptDialog
          message={t('folder.name', lang)}
          placeholder={t('new.folder', lang)}
          confirmLabel={t('folder.create', lang)}
          onConfirm={handleNewFolder}
          onCancel={() => setShowNewFolder(false)}
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t('context.rename', lang), onClick: () => setRenamingFolder(menu.folder) },
            { label: t('context.move', lang), onClick: () => setMovingFolder(menu.folder) },
            { label: t('context.delete', lang), onClick: () => setDeletingFolder(menu.folder), danger: true },
          ]}
        />
      )}

      {renamingFolder && (
        <PromptDialog
          message={t('rename.folder', lang)}
          initialValue={leafName(renamingFolder)}
          confirmLabel={t('rename', lang)}
          onConfirm={handleRenameFolder}
          onCancel={() => setRenamingFolder(null)}
        />
      )}

      {movingFolder && (
        <Modal title={t('move.folder', lang)} onClose={() => setMovingFolder(null)}>
          <div style={moveListStyle}>
            <button
              style={moveTargetStyle(colors, false)}
              onClick={() => {
                moveFolder(movingFolder, null)
                setMovingFolder(null)
              }}
            >
              {"\u2514"} {t('move.to.root', lang)}
            </button>
            {moveTargets.map((target) => (
              <button
                key={target}
                style={moveTargetStyle(colors, false)}
                onClick={() => {
                  moveFolder(movingFolder, target)
                  setMovingFolder(null)
                }}
              >
                {"\u2514"} <span style={{ paddingLeft: depthOf(target) * 14 }}>{leafName(target)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {deletingFolder && (
        <ConfirmDialog
          message={`${t('delete.folder.confirm', lang)} "${deletingFolder}"`}
          confirmLabel={t('delete', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => { deleteFolder(deletingFolder); setDeletingFolder(null) }}
          onCancel={() => setDeletingFolder(null)}
        />
      )}
    </div>
  )
}

const section: React.CSSProperties = {
  padding: '4px 0',
}

const container = (c: any): React.CSSProperties => ({
  width: 240,
  height: '100%',
  background: c.bgSidebar,
  borderRight: `1px solid ${c.border}`,
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 0',
  overflow: 'auto',
  flexShrink: 0,
})
const title = (c: any) => ({
  fontSize: 18,
  fontWeight: 700,
  color: c.blue,
  padding: '0 16px 16px',
  letterSpacing: '-0.3px',
})
const sectionHeader = (c: any) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 16px',
  fontSize: 11,
  color: c.comment,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
})
const itemStyle = (c: any) => ({
  padding: '6px 16px',
  cursor: 'pointer',
  color: c.fgSidebar,
  fontSize: 13,
  transition: 'background 0.1s',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
})
const folderNameStyle: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
}
const itemSelectedStyle = (c: any) => ({
  background: c.bgHighlight,
  color: c.blue,
  fontWeight: 600,
})
const dragOverStyle = (c: any): React.CSSProperties => ({
  outline: `1.5px dashed ${c.blue}`,
  outlineOffset: -2,
  background: c.bgHighlight,
})
const divider = (c: any) => ({
  height: 1,
  background: c.border,
  margin: '8px 16px',
})
const addBtn = (c: any) => ({
  color: c.green,
  fontSize: 16,
  fontWeight: 700,
  padding: '0 4px',
})
const emptyText = (c: any) => ({
  padding: '4px 16px',
  color: c.comment,
  fontSize: 12,
})
const settingsBtn = (c: any) => ({
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  color: c.fgSidebar,
  fontSize: 13,
  textAlign: 'left' as const,
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
})
const moveListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxHeight: '50vh',
  overflowY: 'auto',
}
const moveTargetStyle = (c: any, _active: boolean): React.CSSProperties => ({
  textAlign: 'left' as const,
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
  color: c.fg,
  background: c.bgAlt,
  border: `1px solid ${c.border}`,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})
