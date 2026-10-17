// Where a path sits relative to the library folders (Missing Files spec,
// Add to library).

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

/** True when `path` is a library folder or inside one. "/Music2" is not inside "/Music". */
export function isInsideFolders(path: string, folders: string[]): boolean {
  const p = trimSlash(path)
  return folders.some((f) => {
    const folder = trimSlash(f)
    return p === folder || p.startsWith(`${folder}/`)
  })
}

/** A library folder strictly inside `path` (adding `path` would take in the
 *  whole library and everything around it, e.g. the home folder), if any. */
export function libraryFolderInside(
  path: string,
  folders: string[],
): string | undefined {
  const p = trimSlash(path)
  const prefix = p === '/' ? '/' : `${p}/`
  return folders.find((f) => {
    const folder = trimSlash(f)
    return folder !== p && folder.startsWith(prefix)
  })
}

/** The folder a file is in. */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : '/'
}

/** The last part of a path. */
export function baseName(path: string): string {
  const parts = trimSlash(path).split('/')
  return parts[parts.length - 1] || path
}
