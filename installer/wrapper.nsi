; Mangyomi NSIS Wrapper
; Extracts and runs the Tauri installer without UAC prompt

!include "MUI2.nsh"
!include "FileFunc.nsh"

; =====================
; Configuration
; =====================
Name "Mangyomi Setup"
OutFile "..\release\Mangyomi-Installer.exe"
InstallDir "$TEMP\Mangyomi-Setup-$HWNDPARENT"
RequestExecutionLevel user
ShowInstDetails nevershow
SilentInstall silent

; Icon and Branding
Icon "icon.ico"
!define MUI_ICON "icon.ico"
BrandingText " "

; Version Information
VIProductVersion "2.5.17.0"
VIAddVersionKey "ProductName" "Mangyomi"
VIAddVersionKey "CompanyName" "Mangyomi"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Mangyomi"
VIAddVersionKey "FileDescription" "Mangyomi Setup"
VIAddVersionKey "FileVersion" "2.5.17"
VIAddVersionKey "ProductVersion" "2.5.17"

; =====================
; Installer Section
; =====================
Section "Install"
    ; Create temp directory
    SetOutPath $INSTDIR
    
    ; Extract the Tauri installer binary
    File "src-tauri\target\release\mangyomi-installer.exe"
    
    ; Extract resources folder
    SetOutPath "$INSTDIR\resources"
    File "resources\app.7z"
    File /nonfatal "resources\installer.blockmap"
    
    ; Run the Tauri installer and wait for it to finish
    SetOutPath $INSTDIR
    
    ; Check for silent mode passed to this wrapper
    ${GetParameters} $0
    StrCmp $0 "" 0 +3
        ; Normal mode - just run installer
        ExecWait '"$INSTDIR\mangyomi-installer.exe"'
        Goto cleanup
    
    ; Pass through any arguments (like --silent --install-path)
    ExecWait '"$INSTDIR\mangyomi-installer.exe" $0'
    
cleanup:
    ; Cleanup temp directory
    SetOutPath $TEMP
    RMDir /r $INSTDIR
SectionEnd

; =====================
; Uninstaller (not used, but required by NSIS)
; =====================
Section "Uninstall"
    ; No-op - uninstall handled by the app itself
SectionEnd
