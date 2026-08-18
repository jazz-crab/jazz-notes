import { useEffect, useState } from 'react'
import { useColors } from '../theme'
import { useSettingsStore } from '../stores/settings'
import { useNotesStore } from '../stores/notes'
import { t, localeOf } from '../utils/i18n'
import { parseNote, serializeNote } from '../utils/frontmatter'
import Modal from './Modal'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  relPath: string
  onClose: () => void
}

interface Version {
  hash: string
  shortHash: string
  date: string
  message: string
  content?: string | null
}

export default function HistoryDialog({ relPath, onClose }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const [versions, setVersions] = useState<Version[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<Version | null>(null)

  useEffect(() => {
    void (async () => {
      const path = useSettingsStore.getState().notesPath || (await window.jazz.getPath())
      const items = await window.jazz.gitHistory(path, relPath, 100)
      setVersions(items)
    })()
  }, [relPath])

  const loadPreview = async (hash: string) => {
    if (versions.some((v) => v.hash === hash && v.content !== undefined)) return
    const path = useSettingsStore.getState().notesPath || (await window.jazz.getPath())
    const content = await window.jazz.gitShow(path, relPath, hash)
    setVersions((vs) => vs.map((v) => (v.hash === hash ? { ...v, content } : v)))
  }

  const handleRestore = async (version: Version) => {
    setRestoring(version.hash)
    setError(null)
    const path = useSettingsStore.getState().notesPath || (await window.jazz.getPath())
    const content = await window.jazz.gitRestore(path, relPath, version.hash)
    setRestoring(null)
    if (content === null) {
      setError(t('history.load.error', lang))
      return
    }
    const data = parseNote(content)
    useNotesStore.getState().replaceNote(
      relPath,
      { relPath, title: data.meta.title, meta: data.meta, content, body: data.content }
    )
    onClose()
  }

  const fmtDate = (iso: string): string => {
    const d = new Date(iso)
    return d.toLocaleString(localeOf(lang), {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <Modal title={t('history.title', lang)} onClose={onClose}>
      {versions.length === 0 && (
        <div style={emptyStyle(colors)}>{t('history.empty', lang)}</div>
      )}
      <div style={listStyle}>
        {versions.map((v, i) => (
          <div
            key={v.hash}
            style={{
              ...itemStyle(colors),
              ...(selected === v.hash ? itemSelectedStyle(colors) : {}),
            }}
            onClick={() => {
              setSelected(v.hash)
              void loadPreview(v.hash)
            }}
          >
            <div style={itemMainStyle}>
              <div style={itemTopStyle}>
                <span style={hashStyle(colors)}>{v.shortHash}</span>
                {i === 0 && <span style={currentBadgeStyle(colors)}>{t('history.current', lang)}</span>}
                <span style={dateStyle(colors)}>{fmtDate(v.date)}</span>
              </div>
              {v.message && <div style={msgStyle(colors)}>{v.message}</div>}
              {selected === v.hash && v.content !== undefined && (
                <pre style={preStyle(colors)}>{v.content || '(empty)'}</pre>
              )}
            </div>
            {selected === v.hash && (
              <button
                style={restoreBtnStyle(colors)}
                disabled={restoring !== null}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmRestore(v)
                }}
              >
                {restoring === v.hash ? '…' : t('history.restore', lang)}
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <div style={errorStyle(colors)}>{error}</div>}
      {confirmRestore && (
        <ConfirmDialog
          message={t('history.restore.confirm', lang)}
          confirmLabel={t('history.restore', lang)}
          cancelLabel={t('cancel', lang)}
          onConfirm={() => void handleRestore(confirmRestore)}
          onCancel={() => setConfirmRestore(null)}
        />
      )}
    </Modal>
  )
}

const emptyStyle = (c: any) => ({
  color: c.comment,
  fontSize: 13,
  textAlign: 'center' as const,
  padding: '20px 0',
})
const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  maxHeight: '55vh',
  overflowY: 'auto',
  minWidth: 300,
  maxWidth: '90vw',
}
const itemStyle = (c: any) => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${c.border}`,
  background: c.bgAlt,
  cursor: 'pointer',
})
const itemSelectedStyle = (c: any) => ({
  borderColor: c.blue,
})
const itemMainStyle: React.CSSProperties = {
  minWidth: 0,
  flex: 1,
}
const itemTopStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
const hashStyle = (c: any) => ({
  fontFamily: 'var(--app-font)',
  fontSize: 12,
  color: c.cyan,
})
const currentBadgeStyle = (c: any) => ({
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  color: c.green,
  border: `1px solid ${c.green}`,
  borderRadius: 4,
  padding: '0 4px',
})
const dateStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  marginLeft: 'auto',
})
const msgStyle = (c: any) => ({
  fontSize: 12,
  color: c.fgDark,
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
})
const preStyle = (c: any) => ({
  margin: '8px 0 0',
  padding: 8,
  borderRadius: 6,
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  fontSize: 11,
  lineHeight: 1.4,
  color: c.fgDark,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  maxHeight: 180,
  overflowY: 'auto' as const,
  fontFamily: 'var(--app-font)',
})
const restoreBtnStyle = (c: any) => ({
  padding: '6px 10px',
  borderRadius: 6,
  fontSize: 12,
  color: c.bg,
  background: c.blue,
  border: 'none',
  cursor: 'pointer',
  flexShrink: 0,
})
const errorStyle = (c: any) => ({
  fontSize: 12,
  color: c.red,
  marginTop: 8,
})
