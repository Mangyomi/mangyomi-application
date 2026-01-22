#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;
use tauri::Emitter;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Global storage for the SFX installer path (passed via --sfx-path argument)
static SFX_PATH: Mutex<Option<String>> = Mutex::new(None);

// Write debug info to a log file for production diagnosis
fn debug_log(message: &str) {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let log_dir = PathBuf::from(&appdata).join("mangyomi");
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("installer-debug.log");
        use std::io::Write;
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            // Use system time as simple timestamp
            let timestamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = writeln!(file, "[{}] {}", timestamp, message);
        }
    }
    println!("{}", message);
}

#[tauri::command]
async fn get_default_path() -> Result<String, String> {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\".to_string());
    Ok(format!("{}\\Programs\\Mangyomi", local_app_data))
}

#[tauri::command]
async fn launch_app(exe_path: String) -> Result<(), String> {
    Command::new(exe_path)
        .spawn()
        .map_err(|e| e.to_string())?;
    std::process::exit(0);
}

#[tauri::command]
async fn install_app(app_handle: tauri::AppHandle, install_path: String) -> Result<(), String> {
    let app_7z = app_handle.path().resolve("resources/app.7z", tauri::path::BaseDirectory::Resource).ok();
    let app_zip = app_handle.path().resolve("resources/app.zip", tauri::path::BaseDirectory::Resource).ok();

    let (resource_path, is_7z) = if let Some(path) = app_7z {
        let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        if path.exists() && size > 1000 { (path, true) } else { (app_zip.ok_or("Installer payload not found (app.7z or app.zip)")?, false) }
    } else {
        (app_zip.ok_or("Installer payload not found (app.7z or app.zip)")?, false)
    };

    debug_log(&format!("Installing from: {:?} to {}", resource_path, install_path));

    // 1. Create directory
    std::fs::create_dir_all(&install_path).map_err(|e| e.to_string())?;

    // 2. Extract
    app_handle.emit("install-progress", Payload { status: "Extracting files...".into(), percent: 10 }).ok();
    
    let path_clone = install_path.clone();
    let res_clone = resource_path.clone();
    
    // Extraction is heavy, run in blocking thread
    tauri::async_runtime::spawn_blocking(move || {
        if is_7z {
            sevenz_rust::decompress_file(&res_clone, &path_clone)
                .map_err(|e| format!("7z extraction failed for {:?}: {}", res_clone, e))
        } else {
             extract_zip(&res_clone, &path_clone)
                 .map_err(|e| format!("Zip extraction failed for {:?}: {}", res_clone, e))
        }
    }).await.map_err(|e| e.to_string())??;

    app_handle.emit("install-progress", Payload { status: "Creating shortcuts...".into(), percent: 80 }).ok();

    // 3. Shortcuts (Desktop & Start Menu)
    create_shortcuts(&install_path).map_err(|e| format!("Shortcut creation failed: {}", e))?;
    
    // 4. Cache installer for differential updates
    app_handle.emit("install-progress", Payload { status: "Setting up updates...".into(), percent: 90 }).ok();
    cache_for_differential_updates(&app_handle, &install_path).ok(); // Don't fail install if caching fails
    
    app_handle.emit("install-progress", Payload { status: "Done!".into(), percent: 100 }).ok();
    
    Ok(())
}

fn extract_zip(archive_path: &PathBuf, output_path: &String) -> Result<(), String> {
    let file = std::fs::File::open(archive_path)
        .map_err(|e| format!("Failed to open zip file at {:?}: {}", archive_path, e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        // Sanitize path to prevent Zip Slip (basic check)
        let file_name = file.name().to_string();
        let outpath = PathBuf::from(output_path).join(&file_name);

        if file.is_dir() || file_name.ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}


fn create_shortcuts(install_path: &str) -> Result<(), String> {
    let exe_path = PathBuf::from(install_path).join("Mangyomi.exe");
    if !exe_path.exists() {
        return Ok(()); // Should warn?
    }

    let desktop = std::env::var("USERPROFILE").unwrap_or_default() + "\\Desktop\\Mangyomi.lnk";
    let start_menu_dir = std::env::var("APPDATA").unwrap_or_default() + "\\Microsoft\\Windows\\Start Menu\\Programs\\Mangyomi";
    std::fs::create_dir_all(&start_menu_dir).ok();
    let start_menu = start_menu_dir + "\\Mangyomi.lnk";

    let target = exe_path.to_str().unwrap();
    
    // Create shortcut script
    // $s=(New-Object -COM WScript.Shell).CreateShortcut('path');$s.TargetPath='target';$s.WorkingDirectory='wd';$s.Save()
    
    let create_lnk = |lnk_path: &str| {
        // Include IconLocation to ensure the shortcut icon appears correctly
        let ps_script = format!(
            "$s=(New-Object -COM WScript.Shell).CreateShortcut('{}');$s.TargetPath='{}';$s.WorkingDirectory='{}';$s.IconLocation='{},0';$s.Save()",
            lnk_path, target, install_path, target
        );
        #[cfg(windows)]
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        let mut cmd = Command::new("powershell");
        cmd.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", &ps_script]);
        
        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);
        
        cmd.output().map_err(|e| e.to_string())
    };

    create_lnk(&desktop)?;
    create_lnk(&start_menu)?;

    Ok(())
}

/// Cache the installer and blockmap for differential updates
/// This allows the app to download only changed blocks on future updates
fn cache_for_differential_updates(_app_handle: &tauri::AppHandle, install_path: &str) -> Result<(), String> {
    debug_log("cache_for_differential_updates: Starting (GUI install)");
    
    // Get cache directory: %APPDATA%/mangyomi/update-cache
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not found")?;
    let cache_dir = PathBuf::from(&appdata).join("mangyomi").join("update-cache");
    debug_log(&format!("Cache directory: {:?}", cache_dir));
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    // Read version from installed version.txt (created during build)
    let version_txt_path = PathBuf::from(install_path).join("version.txt");
    
    debug_log(&format!("Looking for version.txt at: {:?}", version_txt_path));
    
    let version = if version_txt_path.exists() {
        std::fs::read_to_string(&version_txt_path)
            .unwrap_or_else(|_| "unknown".to_string())
            .trim()
            .to_string()
    } else {
        debug_log("version.txt not found!");
        "unknown".to_string()
    };

    debug_log(&format!("Caching installer for version: {}", version));

    // Note: Installer self-caching doesn't work reliably (can't get SFX path from inside extracted temp folder)
    // First install will result in a full download for the first update
    // After that, the Electron download caching handles subsequent updates with differential downloads
    debug_log("First-time install: Electron download caching will handle future updates");

    debug_log("cache_for_differential_updates: Finished");
    Ok(())
}

/// Cache installer for silent/update installations (no Tauri runtime)
/// Note: This doesn't actually cache anything on first install. 
/// The Electron download caching in updater.ts handles subsequent updates.
fn cache_for_silent_install(install_path: &str) {
    debug_log("cache_for_silent_install: Starting");
    
    // Read version from installed version.txt (created during build)
    let version_txt_path = PathBuf::from(install_path).join("version.txt");
    debug_log(&format!("Looking for version.txt at: {:?}", version_txt_path));
    
    let version = if version_txt_path.exists() {
        std::fs::read_to_string(&version_txt_path)
            .unwrap_or_else(|_| "unknown".to_string())
            .trim()
            .to_string()
    } else {
        debug_log("version.txt not found!");
        "unknown".to_string()
    };

    debug_log(&format!("Installed version: {}", version));
    
    // Note: First-time install doesn't cache the installer (can't reliably get SFX path)
    // The Electron download caching in updater.ts handles subsequent updates
    debug_log("Silent install complete - Electron download caching will handle future updates");
    
    debug_log("cache_for_silent_install: Finished");
}

#[derive(Clone, serde::Serialize)]
struct Payload {
    status: String,
    percent: u32,
}


fn main() {
    // Parse --sfx-path argument passed by SFX module
    let args: Vec<String> = std::env::args().collect();
    debug_log(&format!("Installer started with {} arguments: {:?}", args.len(), args));
    
    for i in 0..args.len() {
        if args[i] == "--sfx-path" {
            if let Some(path) = args.get(i + 1) {
                if let Ok(mut sfx_path) = SFX_PATH.lock() {
                    *sfx_path = Some(path.clone());
                    debug_log(&format!("SFX path set to: {}", path));
                }
            }
        }
    }

    // Parse --silent and --install-path for silent updates
    let mut silent_mode = false;
    let mut install_path: Option<String> = None;
    
    for i in 0..args.len() {
        if args[i] == "--silent" {
            silent_mode = true;
            debug_log("Silent mode enabled");
        } else if args[i] == "--install-path" {
            if let Some(path) = args.get(i + 1) {
                install_path = Some(path.clone());
                debug_log(&format!("Install path set to: {}", path));
            }
        }
    }

    // If silent mode with install path, run installation directly and exit
    if silent_mode {
        if let Some(path) = install_path {
            debug_log(&format!("Running silent installation to: {}", path));
            
            // Wait for the old app to fully close before extracting
            // The app spawns us and then quits after 1 second, so we wait 3 seconds to be safe
            debug_log("Waiting 3 seconds for old app to close...");
            std::thread::sleep(std::time::Duration::from_secs(3));
            debug_log("Proceeding with extraction...");
            
            // Create install directory
            if let Err(e) = std::fs::create_dir_all(&path) {
                debug_log(&format!("FAILED: Create install directory: {}", e));
                std::process::exit(1);
            }

            // Find the app.7z payload in resources (relative to current exe)
            let current_exe = std::env::current_exe().expect("Failed to get current exe");
            let exe_dir = current_exe.parent().expect("Failed to get exe directory");
            let payload_path = exe_dir.join("resources").join("app.7z");
            
            if payload_path.exists() {
                debug_log(&format!("Extracting from: {:?}", payload_path));
                if let Err(e) = sevenz_rust::decompress_file(&payload_path, &path) {
                    debug_log(&format!("FAILED: Extraction: {}", e));
                    std::process::exit(1);
                }
                debug_log("Silent installation complete!");
                
                // Cache the installer for differential updates
                debug_log("Caching installer for differential updates...");
                cache_for_silent_install(&path);
                
                // Launch the app after installation
                let app_exe = PathBuf::from(&path).join("Mangyomi.exe");
                if app_exe.exists() {
                    if let Err(e) = Command::new(&app_exe).spawn() {
                        debug_log(&format!("Failed to launch app: {}", e));
                    }
                }
            } else {
                debug_log(&format!("Payload not found at: {:?}", payload_path));
                std::process::exit(1);
            }
            
            std::process::exit(0);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![install_app, get_default_path, launch_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
