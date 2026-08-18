import { useEffect } from 'react'
import { useColors } from '../theme'
import type React from 'react'

interface Props {
  title?: string
  onClose: () => void
  children: React.ReactNode
}

export default function Modal({ title, onClose, children }: Props) {
  const colors = useColors()

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey, true)
    return () => window.removeEventListener('keydown', handleKey, true)
  }, [onClose])

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle(colors)} onClick={(e) => e.stopPropagation()}>
        {title && <div style={titleStyle(colors)}>{title}</div>}
        {children}
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
const dialogStyle = (c: any): React.CSSProperties => ({
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  padding: 24,
  minWidth: 260,
  maxWidth: '90vw' as const,
  maxHeight: '80vh',
  overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})
const titleStyle = (c: any): React.CSSProperties => ({
  fontSize: 15,
  fontWeight: 700,
  color: c.fg,
  marginBottom: 14,
  textAlign: 'center' as const,
})
