param (
    [string]$NsisPath = ""
)

$ErrorActionPreference = "Stop"

# Paths (relative to installer/ directory)
$ReleaseDir = "src-tauri\target\release"
$OutputDir = "..\release"
$InstallerExe = "$ReleaseDir\mangyomi-installer.exe"
$ResourcesDir = "resources"

Write-Host "=== Mangyomi NSIS Wrapper Packager ===" -ForegroundColor Cyan

# Ensure output dir
if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

# 1. Verify Assets
Write-Host "Verifying assets..." -ForegroundColor Cyan
if (!(Test-Path $InstallerExe)) {
    Write-Error "Installer binary not found at $InstallerExe. Run 'npm run tauri build' first."
}

if (!(Test-Path "$ResourcesDir\app.7z")) {
    Write-Error "Payload (app.7z) not found in resources folder!"
}

Write-Host "  Found: $InstallerExe" -ForegroundColor Green
Write-Host "  Found: $ResourcesDir\app.7z" -ForegroundColor Green

# 2. Locate NSIS
Write-Host "Locating NSIS..." -ForegroundColor Cyan
$makensis = $null

if ($NsisPath -and (Test-Path $NsisPath)) {
    $makensis = $NsisPath
}
elseif (Get-Command "makensis" -ErrorAction SilentlyContinue) {
    $makensis = (Get-Command "makensis").Source
}
else {
    $CommonPaths = @(
        "$env:ProgramFiles\NSIS\makensis.exe",
        "${env:ProgramFiles(x86)}\NSIS\makensis.exe",
        "C:\Program Files\NSIS\makensis.exe",
        "C:\Program Files (x86)\NSIS\makensis.exe"
    )
    foreach ($path in $CommonPaths) {
        if (Test-Path $path) {
            $makensis = $path
            break
        }
    }
}

if (!$makensis) {
    Write-Error @"
NSIS not found! Install from https://nsis.sourceforge.io/
Or provide path: .\package-nsis.ps1 -NsisPath "C:\Path\To\makensis.exe"
"@
}
Write-Host "Using NSIS: $makensis" -ForegroundColor Green

# 3. Compile NSIS script
Write-Host "Compiling NSIS wrapper..." -ForegroundColor Cyan
$NsiScript = "wrapper.nsi"

if (!(Test-Path $NsiScript)) {
    Write-Error "NSIS script not found: $NsiScript"
}

# Run makensis
& $makensis /V2 $NsiScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "NSIS compilation failed with exit code $LASTEXITCODE"
}

$FinalExe = Join-Path (Resolve-Path $OutputDir) "Mangyomi-Installer.exe"
if (Test-Path $FinalExe) {
    $Size = [math]::Round((Get-Item $FinalExe).Length / 1MB, 2)
    Write-Host "NSIS compilation complete: $FinalExe ($Size MB)" -ForegroundColor Green
    
    # Note: Icon and version info are set by NSIS at compile time via wrapper.nsi
    # rcedit step removed as it was corrupting the installer file
    
    $Size = [math]::Round((Get-Item $FinalExe).Length / 1MB, 2)
    Write-Host "SUCCESS! Final: $FinalExe ($Size MB)" -ForegroundColor Green
    
    # Generate blockmap for differential updates
    Write-Host "Generating blockmap..." -ForegroundColor Cyan
    $BlockmapExe = "$FinalExe.blockmap"
    try {
        # Use the x64 app-builder explicitly (arm64 won't work on x64 Windows)
        $appBuilder = "..\\node_modules\\app-builder-bin\\win\\x64\\app-builder.exe"
        if (Test-Path $appBuilder) {
            & $appBuilder blockmap --input $FinalExe --output $BlockmapExe
            if (Test-Path $BlockmapExe) {
                $BlockmapSize = [math]::Round((Get-Item $BlockmapExe).Length / 1KB, 2)
                Write-Host "Blockmap created: $BlockmapExe ($BlockmapSize KB)" -ForegroundColor Green
            }
        }
        else {
            Write-Host "app-builder not found at $appBuilder, skipping blockmap generation" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Blockmap generation failed: $_" -ForegroundColor Yellow
    }
}
else {
    Write-Error "Failed to create installer at $FinalExe"
}

Write-Host "=== Done! ===" -ForegroundColor Cyan
