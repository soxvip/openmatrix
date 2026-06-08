[Setup]
AppName=OPEN MATRIX
AppVersion=0.17.1
DefaultDirName={userappdata}\OpenMatrix
DefaultGroupName=OPEN MATRIX
OutputDir=.\Output
OutputBaseFilename=OpenMatrixInstaller
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Files]
Source: "app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "envPath"; Description: "Add OPEN MATRIX to the user PATH (Recommended)"; GroupDescription: "Environment:"

[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Tasks: envPath; Check: NeedsAddPath(ExpandConstant('{app}'))

[Code]
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_CURRENT_USER, 'Environment', 'Path', OrigPath) then
  begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;

procedure WriteLaunchers(Dir: string; AppDir: string);
var
  CmdRel: string;
  CmdAbs: string;
begin
  // Launcher in {app} can use %~dp0 (relative to its own location)
  CmdRel := '@echo off' + #13#10 + 'node "%~dp0bin\open-matrix" %*' + #13#10;
  // Launcher elsewhere must point to absolute app bin path
  CmdAbs := '@echo off' + #13#10 + 'node "' + AppDir + '\bin\open-matrix" %*' + #13#10;
  if Dir = AppDir then
  begin
    SaveStringToFile(Dir + '\open-matrix.cmd', CmdRel, False);
    SaveStringToFile(Dir + '\open-matrix.bat', CmdRel, False);
    SaveStringToFile(Dir + '\openmatrix.bat', CmdRel, False);
  end
  else
  begin
    SaveStringToFile(Dir + '\open-matrix.cmd', CmdAbs, False);
    SaveStringToFile(Dir + '\open-matrix.bat', CmdAbs, False);
    SaveStringToFile(Dir + '\openmatrix.bat', CmdAbs, False);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  AppDir: string;
  WindowsAppsDir: string;
  NpmDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    AppDir := ExpandConstant('{app}');
    // Launchers in the app dir (added to PATH via [Registry])
    WriteLaunchers(AppDir, AppDir);

    // Also write to local app data WindowsApps (always in PATH on Win 10/11)
    WindowsAppsDir := ExpandConstant('{localappdata}') + '\Microsoft\WindowsApps';
    if DirExists(WindowsAppsDir) then
      WriteLaunchers(WindowsAppsDir, AppDir);

    // Also write to roaming npm (typically in user PATH)
    NpmDir := ExpandConstant('{userappdata}') + '\npm';
    if DirExists(NpmDir) then
      WriteLaunchers(NpmDir, AppDir);
  end;
end;
