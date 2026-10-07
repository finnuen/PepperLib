@echo off
setlocal EnableDelayedExpansion
title PepperLib.exe v1.2 - Zero-Friction Native C++20 / WinRT / SQLite FTS5 Builder

echo ============================================================================
echo  PepperLib.exe v1.2 - Turnkey Standalone Windows Build Pipeline
echo ============================================================================

cd /d "%~dp0"

:: ----------------------------------------------------------------------------
:: STEP 1: Verify or Auto-Fetch SQLite3 Amalgamation (sqlite3.c & sqlite3.h)
:: ----------------------------------------------------------------------------
if exist "sqlite3.c" if exist "sqlite3.h" (
    echo [1/5] Found local sqlite3.c and sqlite3.h amalgamation files.
    goto :locate_msvc
)

echo [1/5] sqlite3.c / sqlite3.h not found in current folder.
echo       Auto-downloading official SQLite 3.49.1 amalgamation from sqlite.org...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ProgressPreference = 'SilentlyContinue'; " ^
    "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
    "$url = 'https://www.sqlite.org/2025/sqlite-amalgamation-3490100.zip'; " ^
    "Invoke-WebRequest -Uri $url -OutFile 'sqlite_amalg.zip'; " ^
    "Expand-Archive -Path 'sqlite_amalg.zip' -DestinationPath 'sqlite_tmp' -Force; " ^
    "Copy-Item 'sqlite_tmp\sqlite-amalgamation-*\sqlite3.c' -Destination '.\sqlite3.c' -Force; " ^
    "Copy-Item 'sqlite_tmp\sqlite-amalgamation-*\sqlite3.h' -Destination '.\sqlite3.h' -Force; " ^
    "Remove-Item 'sqlite_amalg.zip' -Force; " ^
    "Remove-Item 'sqlite_tmp' -Recurse -Force"

if not exist "sqlite3.c" (
    echo [ERROR] Could not automatically download sqlite3.c.
    echo         Please place sqlite3.c and sqlite3.h in this folder and re-run build.bat.
    pause
    exit /b 1
)
echo       Successfully extracted sqlite3.c and sqlite3.h.

:: ----------------------------------------------------------------------------
:: STEP 2: Locate Visual Studio x64 Native Compiler via vswhere.exe
:: ----------------------------------------------------------------------------
:locate_msvc
echo [2/5] Locating Visual Studio C++ x64 build environment...

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VCVARS_PATH="

if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
        if exist "%%i\VC\Auxiliary\Build\vcvars64.bat" (
            set "VCVARS_PATH=%%i\VC\Auxiliary\Build\vcvars64.bat"
        )
    )
)

:: Fallback search across standard Visual Studio 2022 / 2019 paths
if "%VCVARS_PATH%"=="" (
    for %%Y in (2022 2019) do (
        for %%E in (Enterprise Professional Community BuildTools) do (
            if exist "%ProgramFiles%\Microsoft Visual Studio\%%Y\%%E\VC\Auxiliary\Build\vcvars64.bat" (
                set "VCVARS_PATH=%ProgramFiles%\Microsoft Visual Studio\%%Y\%%E\VC\Auxiliary\Build\vcvars64.bat"
            )
            if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\%%Y\%%E\VC\Auxiliary\Build\vcvars64.bat" (
                set "VCVARS_PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\%%Y\%%E\VC\Auxiliary\Build\vcvars64.bat"
            )
        )
    )
)

if "%VCVARS_PATH%"=="" (
    echo [WARN] Visual Studio C++ x64 compiler tools were not found on this PC.
    echo        Attempting automatic installation of MSVC C++ Build Tools via winget...
    winget install Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
    if exist "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" (
        set "VCVARS_PATH=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
    )
)

if "%VCVARS_PATH%"=="" (
    echo [ERROR] Visual Studio C++ x64 compiler tools were not found.
    echo         Ensure "Desktop development with C++" + Windows 10/11 SDK are installed.
    pause
    exit /b 1
)

echo       Found MSVC environment: "%VCVARS_PATH%"
call "%VCVARS_PATH%" >nul 2>&1

:: ----------------------------------------------------------------------------
:: STEP 3: Generate PepperLib Icon (.ico) & Resource (.res) for File Explorer
:: ----------------------------------------------------------------------------
echo [3/5] Generating PepperLib icon (red background + white image and magnifying glass)...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Add-Type -AssemblyName System.Drawing; " ^
    "$bmp = New-Object System.Drawing.Bitmap(64, 64); " ^
    "$g = [System.Drawing.Graphics]::FromImage($bmp); " ^
    "$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias; " ^
    "$g.Clear([System.Drawing.Color]::Transparent); " ^
    "$redBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 38, 38)); " ^
    "$g.FillRectangle($redBrush, 2, 2, 60, 60); " ^
    "$whitePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 3.8); " ^
    "$whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; " ^
    "$whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round; " ^
    "$g.DrawRectangle($whitePen, 10, 11, 32, 28); " ^
    "$g.DrawEllipse($whitePen, 16, 16, 5, 5); " ^
    "$g.DrawLine($whitePen, 13, 34, 23, 24); " ^
    "$g.DrawLine($whitePen, 23, 24, 31, 31); " ^
    "$g.FillEllipse($redBrush, 28, 26, 26, 26); " ^
    "$g.DrawEllipse($whitePen, 30, 28, 21, 21); " ^
    "$g.DrawLine($whitePen, 48, 46, 56, 54); " ^
    "$g.Dispose(); " ^
    "$ms = New-Object System.IO.MemoryStream; " ^
    "$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); " ^
    "$pngBytes = $ms.ToArray(); " ^
    "$fs = [System.IO.File]::Create('pepperlib.ico'); " ^
    "$bw = New-Object System.IO.BinaryWriter($fs); " ^
    "$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1); " ^
    "$bw.Write([byte]64); $bw.Write([byte]64); $bw.Write([byte]0); $bw.Write([byte]0); " ^
    "$bw.Write([uint16]1); $bw.Write([uint16]32); " ^
    "$bw.Write([uint32]$pngBytes.Length); $bw.Write([uint32]22); " ^
    "$bw.Write($pngBytes); $bw.Close(); $fs.Close(); $bmp.Dispose();" >nul 2>&1

set "RES_FILE="
if exist "pepperlib.ico" (
    (
        echo IDI_ICON1 ICON "pepperlib.ico"
        echo 1 VERSIONINFO
        echo FILEVERSION 1,2,0,0
        echo PRODUCTVERSION 1,2,0,0
        echo BEGIN
        echo   BLOCK "StringFileInfo"
        echo   BEGIN
        echo     BLOCK "040904B0"
        echo     BEGIN
        echo       VALUE "FileDescription", "PepperLib"
        echo       VALUE "FileVersion", "1.2"
        echo       VALUE "ProductName", "PepperLib"
        echo       VALUE "ProductVersion", "1.2"
        echo     END
        echo   END
        echo   BLOCK "VarFileInfo"
        echo   BEGIN
        echo     VALUE "Translation", 0x409, 1200
        echo   END
        echo END
    ) > "pepperlib.rc"
    rc.exe /nologo "pepperlib.rc" >nul 2>&1
    if exist "pepperlib.res" set "RES_FILE=pepperlib.res"
)

:: ----------------------------------------------------------------------------
:: STEP 4: Compile SQLite3 Amalgamation with FTS5 Enabled (/MT Static CRT)
:: ----------------------------------------------------------------------------
echo [4/5] Compiling sqlite3.c with SQLITE_ENABLE_FTS5 (/O2 /MT)...

if not exist "sqlite3.obj" (
    cl.exe /nologo /c /O2 /MT /W0 ^
        /DSQLITE_ENABLE_FTS5 ^
        /DSQLITE_THREADSAFE=1 ^
        /DSQLITE_DEFAULT_WAL_SYNCHRONOUS=1 ^
        /DSQLITE_OMIT_LOAD_EXTENSION ^
        sqlite3.c /Fosqlite3.obj
    if errorlevel 1 (
        echo [ERROR] Failed to compile sqlite3.c
        pause
        exit /b 1
    )
) else (
    echo       Reusing cached sqlite3.obj for faster incremental build.
)

:: ----------------------------------------------------------------------------
:: STEP 5: Compile main.cpp (C++20 / WinRT) & Link Standalone PepperLib.exe
:: ----------------------------------------------------------------------------
echo [5/5] Compiling main.cpp and linking standalone PepperLib.exe...

cl.exe /nologo /std:c++20 /O2 /MT /EHsc /utf-8 /W3 ^
    /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /DNOMINMAX ^
    main.cpp sqlite3.obj %RES_FILE% ^
    /Fe:PepperLib.exe ^
    /link /SUBSYSTEM:WINDOWS ^
    user32.lib gdi32.lib comctl32.lib ole32.lib shell32.lib shlwapi.lib windowscodecs.lib dwmapi.lib windowsapp.lib

if errorlevel 1 (
    echo.
    echo [ERROR] Compilation failed. Review compiler diagnostics above.
    pause
    exit /b 1
)

:: Clean intermediate build artifacts (keep sqlite3.obj for fast rebuilds)
if exist "main.obj" del /q "main.obj"
if exist "pepperlib.rc" del /q "pepperlib.rc"
if exist "pepperlib.res" del /q "pepperlib.res"

echo.
echo ============================================================================
echo  BUILD SUCCEEDED: %CD%\PepperLib.exe (Version 1.2)
echo  Version        : 1.2
echo  Settings/Cache : %%APPDATA%%\PepperLib
echo  Linking Mode   : Static CRT (/MT) - Zero VC++ Redistributable Dependencies
echo  OCR and Docs   : Windows.Media.Ocr + Windows.Data.Pdf + Native Text Reader
echo ============================================================================
echo.
echo Launching PepperLib.exe...
start "" "%CD%\PepperLib.exe"
exit /b 0
