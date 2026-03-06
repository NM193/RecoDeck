import changelog from '../../CHANGELOG.md?raw'

/**
 * Extract bullet-point changes for a given version from CHANGELOG.md
 * (Keep a Changelog format: ## [x.y.z] sections with ### subsections)
 */
export function getChangesForVersion(version: string): string[] {
  const versionNorm = version.replace(/^v/, '')
  const escaped = versionNorm.replace(/\./g, '\\.')
  const regex = new RegExp(
    `## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`,
  )
  const match = changelog.match(regex)
  if (!match) return []

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('###'))
}
