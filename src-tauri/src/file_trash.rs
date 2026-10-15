// src-tauri/src/file_trash.rs
//! Moving merged-away duplicate files to the Trash (Duplicates Merge spec,
//! Files). A file is only trashed when no track that stays uses it: two rows
//! can name one file through a symlinked folder, letter case on APFS, or an
//! old double-slash path.

use std::path::Path;

/// True when both paths name the same file on disk: the same canonical path,
/// or (on Unix) the same device and inode.
pub fn same_file(a: &Path, b: &Path) -> bool {
    if let (Ok(ca), Ok(cb)) = (a.canonicalize(), b.canonicalize()) {
        if ca == cb {
            return true;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if let (Ok(ma), Ok(mb)) = (std::fs::metadata(a), std::fs::metadata(b)) {
            return ma.dev() == mb.dev() && ma.ino() == mb.ino();
        }
    }
    false
}

/// True when `file` may go to the Trash: none of the `remaining` paths
/// (tracks still in the library) names the same file.
pub fn safe_to_trash(file: &Path, remaining: &[String]) -> bool {
    !remaining.iter().any(|p| same_file(file, Path::new(p)))
}

/// Moves the file to the Trash. On macOS this uses NSFileManager, which needs
/// no Finder permission prompt (Finder's "Put Back" may not be offered).
#[allow(unused_mut)]
pub fn move_to_trash(path: &Path) -> Result<(), String> {
    let mut ctx = trash::TrashContext::default();
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        ctx.set_delete_method(DeleteMethod::NsFileManager);
    }
    ctx.delete(path).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn a_path_through_a_symlinked_folder_is_the_same_file() {
        let dir = TempDir::new().unwrap();
        let real = dir.path().join("real");
        fs::create_dir(&real).unwrap();
        fs::write(real.join("a.mp3"), b"audio").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(&real, dir.path().join("alias")).unwrap();

        let via_alias = dir.path().join("alias").join("a.mp3");
        let direct = real.join("a.mp3");

        assert!(same_file(&via_alias, &direct));
        assert!(!safe_to_trash(&via_alias, &[direct.to_string_lossy().to_string()]));
    }

    #[test]
    fn a_different_file_is_safe_to_trash() {
        let dir = TempDir::new().unwrap();
        let a = dir.path().join("a.mp3");
        let b = dir.path().join("b.mp3");
        fs::write(&a, b"audio").unwrap();
        fs::write(&b, b"audio").unwrap();

        assert!(!same_file(&a, &b));
        assert!(safe_to_trash(&a, &[b.to_string_lossy().to_string()]));
    }

    #[test]
    fn a_double_slash_path_is_the_same_file() {
        let dir = TempDir::new().unwrap();
        let a = dir.path().join("a.mp3");
        fs::write(&a, b"audio").unwrap();
        let doubled = format!("{}//a.mp3", dir.path().to_string_lossy());

        assert!(same_file(Path::new(&doubled), &a));
    }
}
