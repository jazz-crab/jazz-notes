import { useEffect, useState } from 'react'
import { useColors } from '../theme'
import { t } from '../utils/i18n'
import { useSettingsStore } from '../stores/settings'

interface Props {
  message: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function PromptDialog({
  message,
  placeholder = '',
  initialValue = '',
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const [value, setValue] = useState(initialValue)
  const [closing, setClosing] = useState(false)
  const resolvedConfirm = confirmLabel ?? t('ok', lang)
  const resolvedCancel = cancelLabel ?? t('cancel', lang)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestClose(onCancel)()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onCancel])

  const requestClose = (fn: () => void) => () => {
    if (closing) return
    setClosing(true)
    fn()
  }

  const handleConfirm = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    requestClose(() => onConfirm(trimmed))()
  }

  return (
    <div style={overlayStyle} onClick={requestClose(onCancel)}>
      <div style={dialogStyle(colors)} onClick={(e) => e.stopPropagation()}>
        <div style={messageStyle(colors)}>{message}</div>
        <input
          style={inputStyle(colors)}
          value={value}
          placeholder={placeholder}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
          }}
        />
        <div style={actionsStyle}>
          <button style={cancelBtnStyle(colors)} onClick={requestClose(onCancel)}>
            {resolvedCancel}
          </button>
          <button
            style={confirmBtnStyle(colors, !value.trim())}
            onClick={handleConfirm}
            disabled={!value.trim()}
          >
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
  padding: 24,
  minWidth: 300,
  maxWidth: '90vw' as const,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})
const messageStyle = (c: any) => ({
  fontSize: 15,
  color: c.fg,
  marginBottom: 14,
  textAlign: 'center' as const,
})
const inputStyle = (c: any) => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  background: c.bg,
  color: c.fg,
  fontSize: 14,
  outline: 'none' as const,
})
const actionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 16,
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
const confirmBtnStyle = (c: any, disabled: boolean) => ({
  padding: '8px 20px',
  borderRadius: 6,
  border: 'none',
  background: c.blue,
  color: c.bg,
  fontSize: 13,
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.5 : 1,
})
