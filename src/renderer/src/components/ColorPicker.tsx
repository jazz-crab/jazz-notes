import type React from 'react'
import { useColors, useNoteColors } from '../theme'
import { useSettingsStore } from '../stores/settings'
import { t } from '../utils/i18n'

interface Props {
  value: string
  onChange: (v: string) => void
}

export default function ColorPicker({ value, onChange }: Props) {
  const colors = useColors()
  const lang = useSettingsStore((s) => s.lang)
  const noteColorMap = useNoteColors()

  return (
    <div style={containerStyle}>
      <button
        style={{
          ...dotStyle,
          background: 'transparent',
          border: `2px solid ${!value ? colors.blue : colors.border}`,
        }}
        onClick={() => onChange('')}
        title={t('no.color', lang)}
      />
      {Object.entries(noteColorMap).map(([name, color]) => (
        <button
          key={name}
          style={{
            ...dotStyle,
            background: color,
            border: `2px solid ${value === name ? colors.fg : 'transparent'}`,
          }}
          onClick={() => onChange(name)}
          title={name}
        />
      ))}
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
  padding: '6px 0',
}
const dotStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: '50%',
}
