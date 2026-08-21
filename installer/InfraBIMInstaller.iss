; =====================================================================
; Inno Setup Script para el Instalador Oficial de InfraBIM Plugin para Revit
; =====================================================================

#define MyAppName "InfraBIM Revit Plugin"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "InfraBIM"
#define MyAppURL "https://infrabimss.web.app"

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
WizardImageFile=InfraBIMWizardLarge.bmp
WizardSmallImageFile=InfraBIMWizardSmall.bmp
SetupIconFile=InfraBIMIcon.ico
VersionInfoCompany=InfraBIM
VersionInfoDescription=Instalador oficial de InfraBIM para Autodesk Revit
VersionInfoProductName=InfraBIM Revit Plugin
VersionInfoProductVersion={#MyAppVersion}
SetupLogging=yes
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


[Messages]
SetupAppTitle=InfraBIM
SetupWindowTitle=Instalador InfraBIM
WelcomeLabel1=Instala InfraBIM para Revit
WelcomeLabel2=Conecta Revit con familias BIM, materiales y colecciones de InfraBIM. Compatible con Revit 2024, 2025 y 2026.
FinishedHeadingLabel=InfraBIM quedo instalado
FinishedLabel=Abre Revit y entra a la pestana InfraBIM para iniciar sesion y cargar familias desde el catalogo.

[Code]
// InfraBIM branded wizard styling
procedure ApplyInfraBIMStyle();
begin
  WizardForm.Caption := 'InfraBIM Plugin';
  WizardForm.Color := $F6F4EE;
  WizardForm.Font.Name := 'Segoe UI';
  WizardForm.Font.Color := $18140E;
  WizardForm.MainPanel.Color := $F6F4EE;
  WizardForm.InnerPage.Color := $FFFFFF;
  WizardForm.PageNameLabel.Font.Color := $18140E;
  WizardForm.PageNameLabel.Font.Style := [fsBold];
  WizardForm.PageDescriptionLabel.Font.Color := $5F5550;
  WizardForm.WelcomeLabel1.Font.Color := $18140E;
  WizardForm.WelcomeLabel1.Font.Style := [fsBold];
  WizardForm.WelcomeLabel2.Font.Color := $5F5550;
  WizardForm.FinishedHeadingLabel.Font.Color := $18140E;
  WizardForm.FinishedHeadingLabel.Font.Style := [fsBold];
  WizardForm.FinishedLabel.Font.Color := $5F5550;
  WizardForm.NextButton.Font.Style := [fsBold];
  WizardForm.NextButton.Font.Color := $18140E;
  WizardForm.BackButton.Font.Color := $18140E;
  WizardForm.CancelButton.Font.Color := $18140E;
end;

procedure InitializeWizard();
begin
  ApplyInfraBIMStyle();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  ApplyInfraBIMStyle();
end;
