import { useEffect, useRef, useState } from 'react'
import { useHistoryToast } from '../stores/history'

const HIDE_AFTER_MS = 2000

export default function UndoToast() {
  const toast = useHistoryToast((s) => s.toast)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!toast) return
    setVisible(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [toast?.nonce])

  if (!toast || !visible) return null

  return (
    <div style={styles.toast}>
      <span style={styles.key}>↶</span>
      {toast.message}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: 'absolute',
    top: 64,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 14px',
    background: 'var(--bg-popup)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--fg)',
    fontSize: 13,
    boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  key: {
    color: 'var(--blue)',
    fontWeight: 700,
  },
}
