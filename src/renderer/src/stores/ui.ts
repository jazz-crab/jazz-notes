type CloseFn = () => void

interface Entry {
  id: string
  onClose: CloseFn
}

const stack: Entry[] = []

export function registerDialog(id: string, onClose: CloseFn): () => void {
  const entry: Entry = { id, onClose }
  stack.push(entry)
  return () => {
    const i = stack.indexOf(entry)
    if (i >= 0) stack.splice(i, 1)
  }
}

export function dialogCount(): number {
  return stack.length
}

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as Element | null
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t instanceof HTMLElement && !!t.closest('.cm-editor'))
  )
}

function handleDialogKey(e: KeyboardEvent) {
  if (stack.length === 0) return
  const handled =
    e.key === 'Escape' || (!isTypingTarget(e) && (e.key === 'q' || e.key === 'й'))
  if (!handled) return
  e.preventDefault()
  e.stopImmediatePropagation()
  stack.pop()?.onClose()
}

window.addEventListener('keydown', handleDialogKey, true)