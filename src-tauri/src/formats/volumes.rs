// src-tauri/src/formats/volumes.rs
// Which disk a file is on, as the DJ programs name it: the one part of the
// export that asks the system. Traktor files every track under a volume name.

use std::path::Path;

/// What macOS calls the boot disk when /Volumes cannot tell.
const DEFAULT_BOOT_VOLUME: &str = "Macintosh HD";

/// The boot volume's name ("Macintosh HD"): the entry in /Volumes that links
/// to "/". Traktor files everything under /Users on it too.
pub fn boot_volume_name() -> String {
    boot_volume_in(Path::new("/Volumes")).unwrap_or_else(|| DEFAULT_BOOT_VOLUME.to_string())
}

/// The entry of `volumes` that is a link to "/", if any.
fn boot_volume_in(volumes: &Path) -> Option<String> {
    std::fs::read_dir(volumes).ok()?.flatten().find_map(|entry| {
        let target = std::fs::read_link(entry.path()).ok()?;
        (target == Path::new("/")).then(|| entry.file_name().to_string_lossy().to_string())
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn the_boot_volume_is_the_link_to_the_root() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("USB")).unwrap();
        symlink("/tmp", dir.path().join("Elsewhere")).unwrap();
        symlink("/", dir.path().join("Studio HD")).unwrap();
        assert_eq!(boot_volume_in(dir.path()), Some("Studio HD".to_string()));
    }

    #[test]
    fn without_such_a_link_there_is_no_answer() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("USB")).unwrap();
        assert_eq!(boot_volume_in(dir.path()), None);
        assert_eq!(boot_volume_in(&dir.path().join("missing")), None);
    }
}
