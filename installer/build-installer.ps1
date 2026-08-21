# =====================================================================
# Script Automatico de Compilacion y Empaquetado para InfraBIM Plugin
# =====================================================================

Write-Host "Iniciando compilacion de InfraBIM Revit Plugin..." -ForegroundColor Cyan
$ErrorActionPreference = "Stop"

$projectDir = Join-Path $PSScriptRoot "..\revit-plugin"
$installerDir = $PSScriptRoot

# 1. Compilar proyecto C#
Push-Location $projectDir
dotnet build -c Release
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error en la compilacion de C# .NET" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "Compilacion C# completada con exito." -ForegroundColor Green

# 2. Crear paquete ZIP portable listo para distribuir e instalar
$distDir = Join-Path $installerDir "Output"
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
}

$zipPath = Join-Path $distDir "InfraBIM_Revit_Plugin_v1.0.0.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force -ErrorAction Stop
}

$requiredFiles = @(
    "$projectDir\bin\Release\net8.0-windows\InfraBIMPlugin.dll",
    "$projectDir\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Wpf.dll",
    "$projectDir\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Core.dll",
    "$projectDir\InfraBIMPlugin.addin",
    "$projectDir\README.md"
)

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in $requiredFiles) {
        if (Test-Path $file) {
            $entryName = Split-Path $file -Leaf
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $file,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
}
finally {
    $zip.Dispose()
}

Write-Host "Paquete ZIP creado exitosamente en installer/Output/InfraBIM_Revit_Plugin_v1.0.0.zip" -ForegroundColor Green

# 3. Verificar Inno Setup Compiler (ISCC.exe) para ejecutable .exe opcional
$possibleIsccPaths = @(
    "C:\Program Files (x86)\Inno Setup 7\ISCC.exe",
    "C:\Program Files\Inno Setup 7\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe",
    "C:\Program Files\Inno Setup 5\ISCC.exe"
)

$isccPath = $possibleIsccPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $isccPath) {
    $whereIscc = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Path
    if ($whereIscc) { $isccPath = $whereIscc }
}

if ($isccPath) {
    Write-Host "Generando ejecutable de instalacion InfraBIM_Plugin_Setup.exe con Inno Setup ($isccPath)..." -ForegroundColor Cyan
    & $isccPath "$installerDir\InfraBIMInstaller.iss"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error generando el instalador .exe con Inno Setup" -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "Instalador .exe creado exitosamente en installer/Output/" -ForegroundColor Green

    $installerExePath = Join-Path $distDir "InfraBIM_Plugin_Setup_v1.0.0.exe"
    $installerZipPath = Join-Path $distDir "InfraBIM_Plugin_Installer_v1.0.0.zip"

    if (Test-Path $installerExePath) {
        Compress-Archive -LiteralPath $installerExePath -DestinationPath $installerZipPath -Force
        Write-Host "Instalador empaquetado creado en installer/Output/InfraBIM_Plugin_Installer_v1.0.0.zip" -ForegroundColor Green
    }
} else {
    Write-Host "Inno Setup Compiler no se encuentra en las rutas por defecto de Program Files." -ForegroundColor Yellow
}
