import { useEffect, useState } from 'react'
import { useColors } from '../theme'
import { t } from '../utils/i18n'
import { useSettingsStore } from '../stores/settings'
import { registerDialog } from '../stores/ui'

interface Props {
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({ message, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const [closing, setClosing] = useState(false)
  const resolvedConfirm = confirmLabel ?? t('ok', lang)
  const resolvedCancel = cancelLabel ?? t('cancel', lang)

  useEffect(() => {
    const unsub = registerDialog('confirm', requestClose(onCancel))
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const t = e.target as Element | null
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
      e.stopPropagation()
      requestClose(onConfirm)()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      unsub()
      window.removeEventListener('keydown', handleKey)
    }
  }, [onCancel, onConfirm])

  const requestClose = (fn: () => void) => () => {
    if (closing) return
    setClosing(true)
    fn()
  }

  return (
    <div
      style={overlayStyle}
      onClick={requestClose(onCancel)}
    >
      <div style={dialogStyle(colors)} onClick={(e) => e.stopPropagation()}>
        <div style={messageStyle(colors)}>{message}</div>
        <div style={actionsStyle}>
          <button style={cancelBtnStyle(colors)} onClick={requestClose(onCancel)}>
            {resolvedCancel}
          </button>
          <button style={confirmBtnStyle(colors)} onClick={requestClose(onConfirm)}>
            {resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
}
const dialogStyle = (c: any) => ({
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  padding: 20,
  minWidth: 280,
  maxWidth: '90vw' as const,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})
const messageStyle = (c: any) => ({
  fontSize: 15,
  color: c.fg,
  marginBottom: 20,
  textAlign: 'center' as const,
})
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
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
