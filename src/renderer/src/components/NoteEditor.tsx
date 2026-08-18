import { useRef, useMemo, useCallback, useEffect } from 'react'
import { AtomicCodeMirrorEditor } from '@atomic-editor/editor'
import { Prec } from '@codemirror/state'
import { keymap, EditorView } from '@codemirror/view'
import { ATOMIC_CODE_LANGUAGES } from '@atomic-editor/editor/code-languages'
import type { AtomicCodeMirrorEditorHandle } from '@atomic-editor/editor'
import { historyStore, useHistoryToast } from '../stores/history'
import { useSettingsStore } from '../stores/settings'
import { t, type Lang } from '../utils/i18n'

const COALESCE_MS = 800

function stepsWord(n: number, lang: Lang): string {
  if (lang === 'en') return n === 1 ? 'step' : 'steps'
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'шаг'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'шага'
  return 'шагов'
}

interface Props {
  documentId: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
}

export default function NoteEditor({ documentId, value, onChange, onSave }: Props) {
  const handleRef = useRef<AtomicCodeMirrorEditorHandle | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  const restoringRef = useRef(false)
  const lastStepAtRef = useRef(0)
  const showToast = useHistoryToast((s) => s.showToast)
  const clearToast = useHistoryToast((s) => s.clearToast)
  const lang = useSettingsStore((s) => s.lang)

  const getView = useCallback(() => {
    const contentDOM = handleRef.current?.getContentDOM()
    return contentDOM ? EditorView.findFromDOM(contentDOM) : null
  }, [])

  const replaceDoc = useCallback(
    (body: string) => {
      const view = getView()
      if (!view) return
      restoringRef.current = true
      try {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: body },
          selection: { anchor: 0 },
        })
      } finally {
        restoringRef.current = false
      }
      lastStepAtRef.current = 0
      onSaveRef.current()
    },
    [getView]
  )

  const doUndo = useCallback(() => {
    const view = getView()
    if (!view) return true
    const current = view.state.doc.toString()
    const res = historyStore.undo(documentId, current)
    if (res) {
      replaceDoc(res.body)
      showToast(t('undo.toast', lang).replace('{n}', String(res.remainingUndo)).replace('{w}', stepsWord(res.remainingUndo, lang)))
    } else {
      showToast(t('undo.toast', lang).replace('{n}', '0').replace('{w}', stepsWord(0, lang)))
    }
    return true
  }, [getView, replaceDoc, showToast, documentId, lang])

  const doRedo = useCallback(() => {
    const view = getView()
    if (!view) return true
    const current = view.state.doc.toString()
    const res = historyStore.redo(documentId, current)
    if (res) {
      replaceDoc(res.body)
      showToast(t('redo.toast', lang).replace('{n}', String(res.remainingRedo)).replace('{w}', stepsWord(res.remainingRedo, lang)))
    } else {
      showToast(t('redo.toast', lang).replace('{n}', '0').replace('{w}', stepsWord(0, lang)))
    }
    return true
  }, [getView, replaceDoc, showToast, documentId, lang])

  useEffect(() => {
    clearToast()
    handleRef.current?.focus()
  }, [documentId, clearToast])

  const handleChange = useMemo(() => (md: string) => onChangeRef.current(md), [])

  const extensions = useMemo(
    () => [
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              onSaveRef.current()
              return true
            },
          },
          { key: 'Mod-z', run: doUndo },
          { key: 'Shift-Mod-z', run: doRedo },
          { key: 'Mod-y', run: doRedo },
        ])
      ),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return
        if (restoringRef.current) return
        const now = Date.now()
        if (now - lastStepAtRef.current > COALESCE_MS) {
          historyStore.push(documentId, update.startState.doc.toString())
        }
        lastStepAtRef.current = now
      }),
    ],
    [doUndo, doRedo, documentId]
  )

  return (
    <div style={styles.wrapper}>
      <AtomicCodeMirrorEditor
        documentId={documentId}
        markdownSource={value}
        onMarkdownChange={handleChange}
        editorHandleRef={handleRef}
        codeLanguages={ATOMIC_CODE_LANGUAGES}
        extensions={extensions}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    display: 'flex',
    padding: '16px 24px',
  },
}
