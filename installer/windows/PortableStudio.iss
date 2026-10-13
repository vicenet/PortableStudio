; PortableStudio Windows installer (Inno Setup 6).
; Build:  iscc /DAppVersion=0.3.0 /DSourceDir=<staged extension folder> installer\windows\PortableStudio.iss
; Installs for the current user into Adobe's CEP extensions folder (no admin rights needed).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #error "Pass /DSourceDir=<path to the staged extension folder>"
#endif

[Setup]
AppId={{F9226141-0A81-486F-8A3E-6659834E158E}
AppName=PortableStudio
AppVersion={#AppVersion}
AppVerName=PortableStudio {#AppVersion}
AppPublisher=PortableStudio
AppPublisherURL=https://github.com/vicenet/PortableStudio
AppSupportURL=https://github.com/vicenet/PortableStudio/issues
AppUpdatesURL=https://github.com/vicenet/PortableStudio/releases
DefaultDirName={userappdata}\Adobe\CEP\extensions\PortableStudio
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=no
PrivilegesRequired=lowest
LicenseFile=..\..\LICENSE
SetupIconFile=PortableStudio.ico
UninstallDisplayIcon={app}\installer-icon.ico
UninstallDisplayName=PortableStudio (Adobe Illustrator & Photoshop extension)
OutputDir=..\..\dist
OutputBaseFilename=PortableStudio-{#AppVersion}-setup
Compression=lzma2/ultra
SolidCompression=yes
WizardStyle=modern
VersionInfoVersion={#AppVersion}
VersionInfoDescription=PortableStudio installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "PortableStudio.ico"; DestDir: "{app}"; DestName: "installer-icon.ico"; Flags: ignoreversion

[InstallDelete]
; Remove files from older versions before copying the new ones.
Type: filesandordirs; Name: "{app}\*"

[Registry]
; Lets Adobe load the extension (also Adobe's workaround for blank signed panels). CEP 9-12.
Root: HKCU; Subkey: "Software\Adobe\CSXS.9"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: string; ValueName: "PlayerDebugMode"; ValueData: "1"

[Messages]
FinishedLabel=PortableStudio is installed.%n%nRestart Illustrator or Photoshop, then open Window > Extensions > PortableStudio (in Photoshop: Window > Extensions (Legacy) > PortableStudio).

[Code]
const
  FILE_ATTRIBUTE_REPARSE_POINT = $400;

// A developer setup links this folder to a source checkout. Installing over it would overwrite the
// source files, so stop instead.
function IsLinkedFolder(const Path: String): Boolean;
var
  Rec: TFindRec;
begin
  Result := False;
  if FindFirst(Path, Rec) then
  begin
    Result := (Rec.Attributes and FILE_ATTRIBUTE_REPARSE_POINT) <> 0;
    FindClose(Rec);
  end;
end;

function InitializeSetup(): Boolean;
var
  Target: String;
begin
  Result := True;
  Target := ExpandConstant('{userappdata}\Adobe\CEP\extensions\PortableStudio');
  if IsLinkedFolder(Target) then
  begin
    MsgBox('A development copy of PortableStudio is linked at:' + #13#10 + Target + #13#10#13#10 +
      'Remove that link first, then run this installer again.', mbError, MB_OK);
    Result := False;
  end;
end;
