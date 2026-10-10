// The lint rule that keeps system tooltips out (Micro-interactions spec,
// Tooltips → Migration): title is refused on HTML elements and on Button.
import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

const eslint = new ESLint({ cwd: process.cwd() })
async function titleErrors(
  code: string,
  filePath = 'src/components/Probe.tsx',
) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax')
    .length
}

describe('no title on HTML elements', () => {
  it('refuses title on an HTML element and on Button', async () => {
    expect(
      await titleErrors('export const A = () => <button title="Next" />\n'),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <span title={name}>{name}</span>\n',
      ),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <Button title="Costs 1 quota unit">Test</Button>\n',
      ),
    ).toBe(1)
    expect(
      await titleErrors(
        'export const A = () => <motion.button title="Open" />\n',
      ),
    ).toBe(1)
  })

  it('accepts data-tip, and title as a prop of other components', async () => {
    expect(
      await titleErrors(
        'export const A = () => <button data-tip="Next" aria-label="Next" />\n',
      ),
    ).toBe(0)
    expect(
      await titleErrors('export const A = () => <Modal title="Export" />\n'),
    ).toBe(0)
  })

  it('leaves the unused Player.tsx alone', async () => {
    expect(
      await titleErrors(
        'export const A = () => <button title="Next" />\n',
        'src/components/Player.tsx',
      ),
    ).toBe(0)
  }, 20000)
}, 30000)
