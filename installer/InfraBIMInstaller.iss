; =====================================================================
; Inno Setup Script para el Instalador Oficial de InfraBIM Plugin para Revit
; =====================================================================

#define MyAppName "InfraBIM Revit Plugin"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "InfraBIM"
#define MyAppURL "https://infrabim.com"

[Setup]
AppId={{D1A2B3C4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\InfraBIM\RevitPlugin
DisableDirPage=yes
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=InfraBIM_Plugin_Setup_v1.0.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Archivos binarios del Plugin C#
Source: "..\revit-plugin\bin\Release\net8.0-windows\InfraBIMPlugin.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Wpf.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Core.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\"; Flags: ignoreversion
Source: "..\revit-plugin\InfraBIMPlugin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2026\"; Flags: ignoreversion

; Copia automatica para Revit 2025
Source: "..\revit-plugin\bin\Release\net8.0-windows\InfraBIMPlugin.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Wpf.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Core.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\"; Flags: ignoreversion
Source: "..\revit-plugin\InfraBIMPlugin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2025\"; Flags: ignoreversion

; Copia automatica para Revit 2024
Source: "..\revit-plugin\bin\Release\net8.0-windows\InfraBIMPlugin.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Wpf.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\"; Flags: ignoreversion
Source: "..\revit-plugin\bin\Release\net8.0-windows\Microsoft.Web.WebView2.Core.dll"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\"; Flags: ignoreversion
Source: "..\revit-plugin\InfraBIMPlugin.addin"; DestDir: "{userappdata}\Autodesk\Revit\Addins\2024\"; Flags: ignoreversion

[UninstallDelete]
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2026\InfraBIMPlugin.*"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2025\InfraBIMPlugin.*"
Type: files; Name: "{userappdata}\Autodesk\Revit\Addins\2024\InfraBIMPlugin.*"
