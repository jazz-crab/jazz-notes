import { useEffect, useRef, useState } from 'react'
import { useColors } from '../theme'
import { useNotesStore } from '../stores/notes'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'
import { depthOf, leafName } from '../utils/folder'
import Modal from './Modal'
import ColorPicker from './ColorPicker'
import DatePicker from './DatePicker'
import type React from 'react'

interface Props {
  defaultFolder: string
  onClose: () => void
  onCreated?: (relPath: string) => void
}

export default function NoteCreateDialog({ defaultFolder, onClose, onCreated }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const folders = useNotesStore((s) => s.folders)
  const createNote = useNotesStore((s) => s.createNote)

  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState(defaultFolder)
  const [color, setColor] = useState('')
  const [due, setDue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = async (batch: boolean) => {
    const relPath = await createNote(title, undefined, folder, {
      ...(color ? { color } : {}),
      ...(due ? { due } : {}),
    })
    if (!relPath) return
    if (batch) {
      setTitle('')
      setColor('')
      setDue('')
      inputRef.current?.focus()
    } else {
      onCreated?.(relPath)
    }
  }

  return (
    <Modal title={t('new.note', lang)} onClose={onClose}>
      <div style={formStyle}>
        <input
          ref={inputRef}
          style={titleInputStyle(colors)}
          value={title}
          placeholder={t('new.note.placeholder', lang)}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit(e.ctrlKey || e.metaKey)
            }
          }}
        />

        <label style={labelStyle(colors)}>{t('note.folder', lang)}</label>
        <select
          style={selectStyle(colors)}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
        >
          <option value="">{t('root', lang)}</option>
          {[...folders].sort().map((f) => (
            <option key={f} value={f}>
              {'\u00A0'.repeat(depthOf(f) * 2)}
              {leafName(f)}
            </option>
          ))}
        </select>

        <div style={rowStyle}>
          <div style={colStyle}>
            <label style={labelStyle(colors)}>{t('note.color', lang)}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div style={colStyle}>
            <label style={labelStyle(colors)}>{t('note.date', lang)}</label>
            <DatePicker date={due} onDateChange={setDue} />
          </div>
        </div>

        <div style={hintStyle(colors)}>{t('create.batch.hint', lang)}</div>

        <div style={actionsStyle}>
          <button style={cancelBtnStyle(colors)} onClick={onClose}>
            {t('cancel', lang)}
          </button>
          <button style={confirmBtnStyle(colors)} onClick={() => void submit(false)}>
            {t('create.note', lang)}
          </button>
        </div>
      </div>
    </Modal>
  )
}

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 320,
}
const labelStyle = (c: any) => ({
  fontSize: 12,
  color: c.comment,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
})
const titleInputStyle = (c: any) => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bg,
  color: c.fg,
  fontSize: 14,
  outline: 'none' as const,
})
const selectStyle = (c: any) => ({
  width: '100%',
  padding: '8px 12px',
  background: c.bg,
  border: `1px solid ${c.border}`,
  borderRadius: 6,
  color: c.fg,
  fontSize: 13,
  cursor: 'pointer',
})
const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'flex-start',
}
const colStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const hintStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  textAlign: 'center' as const,
})
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 6,
}
const cancelBtnStyle = (c: any) => ({
  padding: '8px 20px',
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bg,
  color: c.fg,
  fontSize: 13,
  cursor: 'pointer',
})
const confirmBtnStyle = (c: any) => ({
  padding: '8px 20px',
  borderRadius: 6,
  border: 'none',
  background: c.blue,
  color: c.bg,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
})
