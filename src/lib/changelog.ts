import changelog from '../../CHANGELOG.md?raw'

/**
 * Categorized changes for a specific version.
 */
export interface VersionChanges {
  added: string[]
  changed: string[]
  fixed: string[]
}

/**
 * Extract bullet items from a named subsection (e.g. "Added") within a version block.
 */
function extractSection(block: string, heading: string): string[] {
  const regex = new RegExp(
    `### ${heading}\\n([\\s\\S]*?)(?=\\n### |$)`,
  )
  const match = block.match(regex)
  if (!match) return []

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0)
}

/**
 * Extract categorized changes for a given version from CHANGELOG.md.
 * (Keep a Changelog format: ## [x.y.z] sections with ### subsections)
 */
export function getChangesForVersion(version: string): VersionChanges {
  const versionNorm = version.replace(/^v/, '')
  const escaped = versionNorm.replace(/\./g, '\\.')
  const regex = new RegExp(
    `## \\[${escaped}\\][^\\n]*\\n([\\s\\S]*?)(?=\\n## \\[|$)`,
  )
  const match = changelog.match(regex)
  if (!match) return { added: [], changed: [], fixed: [] }

  const block = match[1]
  return {
    added: extractSection(block, 'Added'),
    changed: extractSection(block, 'Changed'),
    fixed: extractSection(block, 'Fixed'),
  }
}
