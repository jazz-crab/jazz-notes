import { useEffect } from 'react'
import { useColors } from '../theme'
import { registerDialog } from '../stores/ui'
import type React from 'react'

interface Props {
  title?: string
  onClose: () => void
  fullscreen?: boolean
  children: React.ReactNode
}

export default function Modal({ title, onClose, children, fullscreen = false }: Props) {
  const colors = useColors()

  useEffect(() => registerDialog('modal', onClose), [onClose])

  return (
    <div
      className={fullscreen ? 'modal-overlay-full' : undefined}
      style={overlayStyle(fullscreen)}
      onClick={onClose}
    >
      <div
        className={fullscreen ? 'modal-dialog modal-dialog-full' : 'modal-dialog'}
        style={dialogStyle(colors, fullscreen)}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <div style={fullscreen ? titleStyleFull(colors) : titleStyle(colors)}>{title}</div>}
        <div style={fullscreen ? bodyStyle : undefined}>{children}</div>
      </div>
    </div>
  )
}

const overlayStyle = (fullscreen: boolean): React.CSSProperties => ({
  position: 'fixed',
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
  ...(fullscreen ? {} : { inset: 0 }),
})
const dialogStyle = (c: any, fullscreen: boolean): React.CSSProperties => ({
  background: c.bgPopup,
  border: fullscreen ? 'none' : `1px solid ${c.border}`,
  borderRadius: fullscreen ? 0 : 10,
  padding: fullscreen ? 0 : 24,
  minWidth: 260,
  maxWidth: fullscreen ? 'none' : '90vw',
  maxHeight: fullscreen ? 'none' : '80vh',
  boxShadow: fullscreen ? 'none' : '0 8px 32px rgba(0,0,0,0.4)',
  ...(fullscreen && {
    display: 'flex',
    flexDirection: 'column',
  }),
})
const titleStyle = (c: any): React.CSSProperties => ({
  fontSize: 15,
  fontWeight: 700,
  color: c.fg,
  marginBottom: 14,
  textAlign: 'center' as const,
})
const titleStyleFull = (c: any): React.CSSProperties => ({
  fontSize: 16,
  fontWeight: 700,
  color: c.fg,
  padding: '16px 24px',
  textAlign: 'center' as const,
  borderBottom: `1px solid ${c.border}`,
  flexShrink: 0,
})
const bodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  overflowX: 'hidden',
  overflowY: 'auto',
}
