; PSEO Tracker office setup: one file that joins a PC to the agency's private
; network (Tailscale) and installs the app, by running scripts/staff-pc/setup-staff-pc.ps1.
; Built by scripts/office-setup/build.mjs (npm run office-setup) with the Tailscale
; auth key inside: keep the built file private and never upload it to GitHub.
; Run with /check to report what it finds without installing anything.

Unicode true
!include FileFunc.nsh
!include LogicLib.nsh

!macro REQUIRE NAME
  !ifndef ${NAME}
    !error "${NAME} is not set: build this with scripts/office-setup/build.mjs (npm run office-setup)."
  !endif
!macroend
!insertmacro REQUIRE STAGE
!insertmacro REQUIRE OUTFILE
!insertmacro REQUIRE ICON
!insertmacro REQUIRE VERSION

Name "PSEO Tracker Office Setup"
OutFile "${OUTFILE}"
Icon "${ICON}"
RequestExecutionLevel user ; the Tailscale part asks for permission itself; the app installs for this Windows user
SilentInstall silent ; no wizard pages: the setup window shows the progress
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "PSEO Tracker Office Setup"
VIAddVersionKey "FileDescription" "Connects this PC to the agency network and installs PSEO Tracker"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Permanent SEO"

Section
  ; $PLUGINSDIR is a private temp folder that NSIS deletes when this exits,
  ; so the key doesn't stay on the PC.
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /r "${STAGE}\*.*"

  StrCpy $R2 ""
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/check" $R1
  ${IfNot} ${Errors}
    StrCpy $R2 " -CheckOnly"
  ${EndIf}

  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup-staff-pc.ps1" -NoPause$R2' $0
  SetErrorLevel $0
  SetOutPath "$TEMP" ; step out of $PLUGINSDIR so it can be deleted
SectionEnd
