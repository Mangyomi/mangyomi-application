param (
    [string]$SevenZipPath = ""
)

$ErrorActionPreference = "Stop"

# Paths (relative to installer/ directory)
$ReleaseDir = "src-tauri\target\release"
$OutputDir = "..\release"
$InstallerExe = "$ReleaseDir\mangyomi-installer.exe"
$ResourcesDir = "$ReleaseDir\resources"

# Ensure output dir
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

# 1. Verify Assets
Write-Host "Verifying assets..." -ForegroundColor Cyan
if (!(Test-Path $InstallerExe)) {
    Write-Error "Installer binary not found at $InstallerExe. Run 'npm run tauri build' first."
}

# ALWAYS copy fresh payload - critical to avoid stale cached resources!
Write-Host "Copying fresh payload to resources..." -ForegroundColor Yellow
if (!(Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Force -Path $ResourcesDir | Out-Null
}

# Remove any existing payload to ensure fresh copy
if (Test-Path "$ResourcesDir\app.7z") {
    Remove-Item "$ResourcesDir\app.7z" -Force
    Write-Host "Removed old app.7z from resources" -ForegroundColor Gray
}
if (Test-Path "$ResourcesDir\app.zip") {
    Remove-Item "$ResourcesDir\app.zip" -Force
    Write-Host "Removed old app.zip from resources" -ForegroundColor Gray
}

# Copy fresh payload
if (Test-Path "resources\app.7z") {
    Copy-Item "resources\app.7z" "$ResourcesDir\app.7z" -Force
    Write-Host "Copied app.7z from installer/resources" -ForegroundColor Green
}
elseif (Test-Path "..\release\app.7z") {
    Copy-Item "..\release\app.7z" "$ResourcesDir\app.7z" -Force
    Write-Host "Copied app.7z from release/" -ForegroundColor Green
}
elseif (Test-Path "resources\app.zip") {
    Copy-Item "resources\app.zip" "$ResourcesDir\app.zip" -Force
    Write-Host "Copied app.zip from installer/resources" -ForegroundColor Green
}
else {
    Write-Error "Payload (app.zip or app.7z) not found!"
}

# 2. Locate 7-Zip
Write-Host "Locating 7-Zip..." -ForegroundColor Cyan
$7z = $null
if ($SevenZipPath -and (Test-Path $SevenZipPath)) {
    $7z = $SevenZipPath
}
elseif (Get-Command "7z" -ErrorAction SilentlyContinue) {
    $7z = (Get-Command "7z").Source
}
else {
    $CommonPaths = @(
        "$env:ProgramFiles\7-Zip\7z.exe",
        "${env:ProgramFiles(x86)}\7-Zip\7z.exe",
        "C:\Program Files\7-Zip\7z.exe"
    )
    foreach ($path in $CommonPaths) {
        if (Test-Path $path) {
            $7z = $path
            break
        }
    }
}

if (!$7z) {
    Write-Error @"
7-Zip not found! Install from https://www.7-zip.org/
Or provide path: .\package-sfx.ps1 -SevenZipPath "C:\Path\To\7z.exe"
"@
}
Write-Host "Using 7-Zip: $7z" -ForegroundColor Green

# 3. Create SFX Config - run installer directly
# Note: Installer self-caching doesn't work reliably (can't get SFX path)
# The Electron download caching handles subsequent updates after first install
$SfxConfigPath = "$ReleaseDir\sfx_config.txt"
$SfxConfig = @"
;!@Install@!UTF-8!
Title="Mangyomi Setup"
RunProgram="mangyomi-installer.exe"
GUIMode="0"
;!@InstallEnd@!
"@
$SfxConfig | Set-Content -Path $SfxConfigPath -Encoding UTF8
Write-Host "Created SFX config" -ForegroundColor Green

# 4. Create Payload Archive
Write-Host "Creating payload archive..." -ForegroundColor Cyan
$PayloadPath = "$ReleaseDir\payload.7z"
Push-Location $ReleaseDir
try {
    & $7z a -t7z -mx=0 "payload.7z" "mangyomi-installer.exe" "resources" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "7z archive creation failed" }
}
finally {
    Pop-Location
}
Write-Host "Payload archive created" -ForegroundColor Green

# 5. Locate SFX Module
Write-Host "Building Portable Installer..." -ForegroundColor Cyan
$SfxModule = $null
$SfxSearchPaths = @(
    ".\7zS.sfx",  # Local file (CI copies it here)
    (Join-Path (Split-Path $7z) "7zS.sfx"),
    (Join-Path (Split-Path $7z) "7zSD.sfx"),
    "C:\7z-extra\7zS.sfx",
    "C:\7z-extra\x64\7zS.sfx",
    "C:\7z-extra\7zSD.sfx",
    "C:\7z-extra\x64\7zSD.sfx",
    "C:\Program Files\7-Zip\7zS.sfx",
    "C:\Program Files\7-Zip\7zSD.sfx"
)

foreach ($path in $SfxSearchPaths) {
    if (Test-Path $path) {
        $SfxModule = $path
        Write-Host "Found SFX module: $SfxModule" -ForegroundColor Green
        break
    }
}

if (!$SfxModule) {
    Write-Host "Searched paths:" -ForegroundColor Yellow
    $SfxSearchPaths | ForEach-Object { Write-Host "  - $_" }
    Write-Error "7zS.sfx module not found in any location!"
}

# 6. Concatenate SFX (using PowerShell for reliability)
Write-Host "Concatenating SFX..." -ForegroundColor Cyan
$FinalExe = Join-Path (Resolve-Path $OutputDir) "Mangyomi-Installer.exe"

# Resolve all paths to absolute
$SfxModuleAbs = Resolve-Path $SfxModule
$SfxConfigAbs = Resolve-Path $SfxConfigPath
$PayloadAbs = Resolve-Path $PayloadPath

Write-Host "  SFX Module: $SfxModuleAbs ($((Get-Item $SfxModuleAbs).Length) bytes)"
Write-Host "  Config: $SfxConfigAbs ($((Get-Item $SfxConfigAbs).Length) bytes)"
Write-Host "  Payload: $PayloadAbs ($((Get-Item $PayloadAbs).Length) bytes)"

# Binary concatenation using PowerShell
$output = [System.IO.File]::Create($FinalExe)
try {
    foreach ($file in @($SfxModuleAbs.Path, $SfxConfigAbs.Path, $PayloadAbs.Path)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $output.Write($bytes, 0, $bytes.Length)
        Write-Host "  Added: $file ($($bytes.Length) bytes)" -ForegroundColor Gray
    }
}
finally {
    $output.Close()
}

if (Test-Path $FinalExe) {
    $Size = [math]::Round((Get-Item $FinalExe).Length / 1MB, 2)
    Write-Host "SUCCESS! Created: $FinalExe ($Size MB)" -ForegroundColor Green
    
    # Generate blockmap for differential updates
    Write-Host "Generating blockmap..." -ForegroundColor Cyan
    $BlockmapExe = Join-Path $OutputDir "Mangyomi-Installer.exe.blockmap"
    try {
        # Try to use app-builder from node_modules
        $appBuilder = Get-ChildItem -Path "node_modules" -Recurse -Filter "app-builder.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($appBuilder) {
            & $appBuilder.FullName blockmap --input $FinalExe --output $BlockmapExe
            if (Test-Path $BlockmapExe) {
                $BlockmapSize = [math]::Round((Get-Item $BlockmapExe).Length / 1KB, 2)
                Write-Host "Blockmap created: $BlockmapExe ($BlockmapSize KB)" -ForegroundColor Green
            }
        }
        else {
            Write-Host "app-builder not found, skipping blockmap generation" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Blockmap generation failed: $_" -ForegroundColor Yellow
    }
}
else {
    Write-Error "Failed to create portable installer"
}

# 6. Cleanup
Remove-Item $SfxConfigPath -Force -ErrorAction SilentlyContinue
Remove-Item $PayloadPath -Force -ErrorAction SilentlyContinue
