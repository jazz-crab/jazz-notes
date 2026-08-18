import { useEffect, useRef, useState } from 'react'
import { useColors } from '../theme'
import type React from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  danger?: boolean
  icon?: string
  iconColor?: string
}

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const colors = useColors()
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [hoverIcon, setHoverIcon] = useState<string | null>(null)
  const iconItems = items.filter((i) => i.icon)
  const textItems = items.filter((i) => !i.icon)

  useEffect(() => {
    const close = () => onClose()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      style={menuStyle(colors, pos)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {iconItems.length > 0 && (
        <div style={iconRowStyle}>
          {iconItems.map((item) => (
            <button
              key={item.icon}
              style={iconStyle(colors, item, hoverIcon === item.icon)}
              onMouseEnter={() => setHoverIcon(item.icon ?? '')}
              onMouseLeave={() => setHoverIcon(null)}
              onClick={() => {
                onClose()
                item.onClick()
              }}
            >
              {item.icon}
            </button>
          ))}
        </div>
      )}
      {textItems.map((item) => (
        <button
          key={item.label}
          style={itemStyle(colors, !!item.danger)}
          onClick={() => {
            onClose()
            item.onClick()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

const menuStyle = (c: any, pos: { x: number; y: number } | null): React.CSSProperties => ({
  position: 'fixed',
  left: pos?.x ?? 0,
  top: pos?.y ?? 0,
  zIndex: 3000,
  minWidth: 180,
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  borderRadius: 8,
  padding: 4,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  display: 'flex',
  flexDirection: 'column',
  visibility: pos ? 'visible' : 'hidden',
})
const itemStyle = (c: any, danger: boolean): React.CSSProperties => ({
  textAlign: 'left' as const,
  padding: '7px 12px',
  borderRadius: 6,
  fontSize: 13,
  color: danger ? c.red : c.fg,
  cursor: 'pointer',
  whiteSpace: 'nowrap' as const,
})
const iconRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  padding: 4,
  marginBottom: 2,
}
const iconStyle = (c: any, item: ContextMenuItem, hovered: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 6,
  border: `1px solid ${c.border}`,
  fontSize: 14,
  color: item.iconColor ?? c.fg,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: hovered ? 'rgba(127, 127, 127, 0.25)' : 'transparent',
})
