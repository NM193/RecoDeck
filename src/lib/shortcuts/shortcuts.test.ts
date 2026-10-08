import { describe, expect, it } from 'vitest'
import { isTextField, modKeyLabel, ownsSpace, shortcutFor, type KeyPress } from './shortcuts'

const press = (key: string, over: Partial<KeyPress> = {}): KeyPress => ({
  key,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  ...over,
})
const free = { typing: false, overlayOpen: false, dragging: false, controlHasSpace: false }

describe('which key does what', () => {
  it('reads the spec table, ⌘ as Ctrl too', () => {
    expect(shortcutFor(press(' '), free)).toBe('play-pause')
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), free)).toBe('next')
    expect(shortcutFor(press('ArrowLeft', { ctrlKey: true }), free)).toBe('previous')
    expect(shortcutFor(press('k', { metaKey: true }), free)).toBe('search')
    expect(shortcutFor(press('f', { ctrlKey: true }), free)).toBe('find')
    expect(shortcutFor(press('/', { metaKey: true }), free)).toBe('sheet')
  })

  it('takes ⌘/ with Shift, as layouts where "/" is Shift+7 type it', () => {
    expect(shortcutFor(press('/', { metaKey: true, shiftKey: true }), free)).toBe('sheet')
    expect(shortcutFor(press('ArrowRight', { metaKey: true, shiftKey: true }), free)).toBeNull()
  })

  it('leaves other keys alone', () => {
    expect(shortcutFor(press('ArrowRight'), free)).toBeNull()
    expect(shortcutFor(press('k'), free)).toBeNull()
    expect(shortcutFor(press(' ', { shiftKey: true }), free)).toBeNull()
    expect(shortcutFor(press('k', { metaKey: true, altKey: true }), free)).toBeNull()
  })

  it('ignores a held key', () => {
    expect(shortcutFor(press(' ', { repeat: true }), free)).toBeNull()
  })

  it('gives way while typing, with a menu, popover or modal open, or while dragging', () => {
    expect(shortcutFor(press(' '), { ...free, typing: true })).toBeNull()
    expect(shortcutFor(press('k', { metaKey: true }), { ...free, typing: true })).toBeNull()
    expect(shortcutFor(press(' '), { ...free, overlayOpen: true })).toBeNull()
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), { ...free, overlayOpen: true })).toBeNull()
    expect(shortcutFor(press(' '), { ...free, dragging: true })).toBeNull()
  })

  it('leaves Space to a control that shows the keyboard ring, not its ⌘ keys', () => {
    expect(shortcutFor(press(' '), { ...free, controlHasSpace: true })).toBeNull()
    expect(shortcutFor(press('ArrowRight', { metaKey: true }), { ...free, controlHasSpace: true })).toBe('next')
  })
})

describe('what focus holds', () => {
  it('knows a text field', () => {
    const text = document.createElement('input')
    const box = document.createElement('input')
    box.type = 'checkbox'
    const area = document.createElement('textarea')
    const div = document.createElement('div')
    expect(isTextField(text)).toBe(true)
    expect(isTextField(area)).toBe(true)
    expect(isTextField(box)).toBe(false)
    expect(isTextField(div)).toBe(false)
    expect(isTextField(null)).toBe(false)
  })

  it('never lets a plain element keep Space, nor a button focus did not reach by Tab', () => {
    expect(ownsSpace(document.createElement('div'), true)).toBe(false)
    expect(ownsSpace(document.body, true)).toBe(false)
    expect(ownsSpace(null, true)).toBe(false)
    expect(ownsSpace(document.createElement('button'), false)).toBe(false)
  })

  it('writes ⌘ as Ctrl on Windows', () => {
    expect(modKeyLabel('MacIntel')).toBe('⌘')
    expect(modKeyLabel('Win32')).toBe('Ctrl')
  })
})
