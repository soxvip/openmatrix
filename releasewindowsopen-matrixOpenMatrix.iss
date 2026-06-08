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

procedure CurStepChanged(CurStep: TSetupStep);
var
  CmdLine: string;
begin
  if CurStep = ssPostInstall then
  begin
    // Create open-matrix.cmd
    CmdLine := '@echo off' + #13#10 + 'node "' + ExpandConstant('{app}') + '\bin\openclaude" %*';
    SaveStringToFile(ExpandConstant('{app}\open-matrix.cmd'), CmdLine, False);
    // Create openclaude.cmd alias
    CmdLine := '@echo off' + #13#10 + 'node "' + ExpandConstant('{app}') + '\bin\openclaude" %*';
    SaveStringToFile(ExpandConstant('{app}\openclaude.cmd'), CmdLine, False);
  end;
end;
