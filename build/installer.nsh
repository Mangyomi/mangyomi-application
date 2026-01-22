; Mangyomi Custom Installer Script
; This file customizes the NSIS installer appearance
; NOTE: electron-builder already includes MUI2.nsh and defines icons

; =============================================
; Custom Colors and Appearance
; =============================================

; Set custom colors for the installer (dark theme to match Mangyomi)
!define MUI_BGCOLOR "0F0F0F"
!define MUI_TEXTCOLOR "FFFFFF"

; Custom header colors
!define MUI_HEADER_TRANSPARENT_TEXT  

; Note: Icons are defined by electron-builder via package.json
; Do NOT define MUI_ICON or MUI_UNICON here

; Header image (optional - 150x57 BMP)
; !define MUI_HEADERIMAGE
; !define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\installerHeader.bmp"
; !define MUI_HEADERIMAGE_RIGHT

; Welcome/Finish page image (optional - 164x314 BMP)
; !define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\installerSidebar.bmp"

; Abort warning
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "Are you sure you want to cancel Mangyomi installation?"

; =============================================
; Custom Welcome Page Text
; =============================================

!define MUI_WELCOMEPAGE_TITLE "Welcome to Mangyomi Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of Mangyomi.$\r$\n$\r$\nMangyomi is a free and open source manga reader for desktop.$\r$\n$\r$\nClick Next to continue."

; =============================================
; Custom Finish Page
; =============================================

!define MUI_FINISHPAGE_TITLE "Mangyomi Installation Complete"
!define MUI_FINISHPAGE_TEXT "Mangyomi has been installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_LINK "Visit Mangyomi on GitHub"
!define MUI_FINISHPAGE_LINK_LOCATION "https://github.com/Mangyomi/mangyomi-app"

; =============================================
; Custom Directory Page
; =============================================

!define MUI_DIRECTORYPAGE_TEXT_TOP "Setup will install Mangyomi in the following folder. To install in a different folder, click Browse and select another folder."

; =============================================
; Branding Text
; =============================================

BrandingText "Mangyomi - Free Manga Reader"
