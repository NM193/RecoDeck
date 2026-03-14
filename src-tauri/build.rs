fn main() {
    // On Windows, help bindgen find libclang if LIBCLANG_PATH is not set
    #[cfg(target_os = "windows")]
    {
        if std::env::var("LIBCLANG_PATH").is_err() {
            let default = r"C:\Program Files\LLVM\bin";
            if std::path::Path::new(default).exists() {
                std::env::set_var("LIBCLANG_PATH", default);
            }
        }
    }

    tauri_build::build()
}
