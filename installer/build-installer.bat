@echo off
echo Building Mangyomi main app...
cd ..
call npm run electron:build

echo Packaging main app...
cd release
if exist app.7z del app.7z
7z a -mx9 app.7z win-unpacked\*

echo Copying to installer resources...
copy app.7z ..\installer\resources\app.7z

echo Building installer...
cd ..\installer
call npm run build:installer

echo Done! Installer is at installer\release\Mangyomi-Setup.exe
