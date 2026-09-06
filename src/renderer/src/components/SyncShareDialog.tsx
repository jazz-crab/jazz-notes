import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useColors } from '../theme'
import { useSettingsStore } from '../stores/settings'
import { encodeSyncConfig } from '../../../shared/syncConfig'
import { t } from '../utils/i18n'

interface Props {
  onClose: () => void
}

export default function SyncShareDialog({ onClose }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const syncRemote = useSettingsStore((s) => s.syncRemote)
  const syncUser = useSettingsStore((s) => s.syncUser)
  const syncPass = useSettingsStore((s) => s.syncPass)
  const [qr, setQr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const config = encodeSyncConfig({ url: syncRemote, user: syncUser || 'vault', token: syncPass })

  useEffect(() => {
    if (!syncRemote || !syncPass) return
    QRCode.toDataURL(config, { margin: 1, width: 220, color: { dark: '#1a1b26', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null))
  }, [config, syncRemote, syncPass])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(config)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = config
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={dialogStyle(colors)} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <span style={titleStyle(colors)}>{t('sync.share.title', lang)}</span>
          <button style={closeBtnStyle(colors)} onClick={onClose}>
            {'\u2715'}
          </button>
        </div>
        <div style={bodyStyle}>
          <div style={hintStyle(colors)}>{t('sync.share.hint', lang)}</div>
          {syncRemote && syncPass ? (
            <div style={qrWrapStyle}>
              {qr ? <img src={qr} alt="QR" style={qrStyle} /> : <div style={qrEmptyStyle(colors)} />}
            </div>
          ) : (
            <div style={qrEmptyStyle(colors)} />
          )}
          <button style={copyBtnStyle(colors)} onClick={() => void handleCopy()}>
            {copied ? `\u2713 ${t('sync.copied', lang)}` : t('sync.copy', lang)}
          </button>
          <div style={configStyle(colors)}>{config}</div>
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
  zIndex: 1100,
}
const dialogStyle = (c: any) => ({
  background: c.bgPopup,
  border: `1px solid ${c.border}`,
  borderRadius: 10,
  width: 320,
  maxWidth: '90vw' as const,
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
})
const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '14px 18px',
  borderBottom: '1px solid var(--border)',
}
const titleStyle = (c: any) => ({
  fontSize: 15,
  fontWeight: 700,
  color: c.fg,
})
const closeBtnStyle = (c: any) => ({
  fontSize: 18,
  color: c.comment,
  padding: '0 4px',
})
const bodyStyle: React.CSSProperties = {
  padding: '16px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'center',
}
const hintStyle = (c: any) => ({
  fontSize: 12,
  color: c.comment,
  textAlign: 'center' as const,
  lineHeight: 1.4,
})
const qrWrapStyle: React.CSSProperties = {
  background: '#fff',
  padding: 8,
  borderRadius: 8,
}
const qrStyle: React.CSSProperties = {
  display: 'block',
  width: 180,
  height: 180,
}
const qrEmptyStyle = (c: any) => ({
  width: 180,
  height: 180,
  background: c.bg,
  border: `1px dashed ${c.border}`,
  borderRadius: 8,
})
const copyBtnStyle = (c: any) => ({
  padding: '8px 16px',
  background: c.bg,
  border: `1px solid ${c.blue}`,
  borderRadius: 6,
  color: c.blue,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
})
const configStyle = (c: any) => ({
  fontSize: 11,
  color: c.comment,
  wordBreak: 'break-all' as const,
  textAlign: 'center' as const,
  maxWidth: '100%',
})
