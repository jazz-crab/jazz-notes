import { describe, it, expect } from 'vitest'
import { parseNote, serializeNote } from './frontmatter'

describe('parseNote', () => {
  it('parses a full frontmatter block', () => {
    const raw = [
      '---',
      'title: "My note"',
      'id: "00001"',
      'priority: 3',
      'due: "2026-08-06T14:30"',
      'color: "blue"',
      'tags: [work, urgent]',
      '---',
      '',
      '# My note',
      'Body text',
    ].join('\n')

    const note = parseNote(raw)
    expect(note.meta.title).toBe('My note')
    expect(note.meta.id).toBe('00001')
    expect(note.meta.priority).toBe(3)
    expect(note.meta.due).toBe('2026-08-06T14:30')
    expect(note.meta.color).toBe('blue')
    expect(note.meta.tags).toEqual(['work', 'urgent'])
    expect(note.content).toBe('# My note\nBody text')
  })

  it('treats input without frontmatter as plain body', () => {
    const raw = '# Hello\nplain text'
    const note = parseNote(raw)
    expect(note.meta.title).toBe('Hello')
    expect(note.content).toBe(raw)
  })

  it('does not break on a --- separator inside the body', () => {
    const raw = [
      '---',
      'title: "Separator"',
      '---',
      '',
      'First paragraph',
      '',
      '---',
      '',
      'Still part of the body',
    ].join('\n')
    const note = parseNote(raw)
    expect(note.meta.title).toBe('Separator')
    expect(note.content).toContain('Still part of the body')
  })

  it('unquotes values with escaped quotes', () => {
    const raw = '---\ntitle: "Say \\"hi\\" to the world"\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.title).toBe('Say "hi" to the world')
  })

  it('accepts unquoted scalar values', () => {
    const raw = '---\ntitle: Plain title\nid: 00007\npriority: 1\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.title).toBe('Plain title')
    expect(note.meta.id).toBe('00007')
    expect(note.meta.priority).toBe(1)
  })

  it('ignores an invalid priority', () => {
    const raw = '---\npriority: 99\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.priority).toBeUndefined()
  })

  it('parses done: true', () => {
    const raw = '---\ndone: true\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.done).toBe(true)
  })

  it('parses done: false', () => {
    const raw = '---\ndone: false\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.done).toBe(false)
  })

  it('leaves done undefined for invalid values', () => {
    const raw = '---\ndone: yes\n---\n\nBody'
    const note = parseNote(raw)
    expect(note.meta.done).toBeUndefined()
  })

  it('derives the title from the first heading when frontmatter has none', () => {
    const note = parseNote('---\nid: "5"\n---\n\n## Not a heading\n# Real title')
    expect(note.meta.title).toBe('Not a heading')
  })

  it('falls back to Untitled for empty content', () => {
    expect(parseNote('').meta.title).toBe('Untitled')
  })

  it('derives title from body when there is no frontmatter', () => {
    const note = parseNote('# Only heading')
    expect(note.meta.title).toBe('Only heading')
  })

  it('does not treat an unclosed frontmatter as frontmatter', () => {
    const raw = '---\ntitle: "Unclosed"\nBody with --- inside'
    const note = parseNote(raw)
    expect(note.meta.id).toBeUndefined()
    expect(note.meta.title).toBe('---')
    expect(note.content).toBe(raw)
  })
})

describe('serializeNote', () => {
  it('writes the title and updated timestamp', () => {
    const raw = serializeNote({ title: 'My note' }, '# My note\nbody')
    const note = parseNote(raw)
    expect(note.meta.title).toBe('My note')
    expect(note.meta.updated).toBeTruthy()
    expect(note.content).toBe('# My note\nbody')
  })

  it('escapes quotes and backslashes in the title', () => {
    const raw = serializeNote({ title: 'a"b\\c' }, '')
    expect(raw).toContain('title: "a\\"b\\\\c"')
    expect(parseNote(raw).meta.title).toBe('a"b\\c')
  })

  it('omits optional keys that are not set', () => {
    const raw = serializeNote({ title: 'T' }, 'body')
    expect(raw).not.toContain('priority:')
    expect(raw).not.toContain('due:')
    expect(raw).not.toContain('color:')
    expect(raw).not.toContain('id:')
  })

  it('round-trips all metadata', () => {
    const meta = {
      title: 'Full',
      id: '00042',
      priority: 2 as const,
      due: '2026-08-06T14:30',
      color: 'red',
      created: '2026-08-05T00:00:00.000Z',
      tags: ['a', 'b'],
    }
    const parsed = parseNote(serializeNote(meta, '# Full\ncontent'))
    expect(parsed.meta).toMatchObject(meta)
    expect(parsed.content).toBe('# Full\ncontent')
  })

  it('writes tags as a comma-separated list', () => {
    const raw = serializeNote({ title: 'T', tags: ['one', 'two'] }, '')
    expect(raw).toContain('tags: [one, two]')
  })

  it('writes done: true when done is set', () => {
    const raw = serializeNote({ title: 'T', done: true }, '')
    expect(raw).toContain('done: true')
  })

  it('omits done when not set or false', () => {
    const withoutDone = serializeNote({ title: 'T' }, '')
    const withFalse = serializeNote({ title: 'T', done: false }, '')
    expect(withoutDone).not.toContain('done:')
    expect(withFalse).not.toContain('done:')
  })
})
