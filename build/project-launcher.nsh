!macro customInstall
  WriteRegDWORD SHELL_CONTEXT "Software\5E\ProjectLauncher" "Version" 1
  WriteRegStr SHELL_CONTEXT "Software\5E\ProjectLauncher" "Executable" "$appExe"
!macroend

!macro customUnInstall
  ReadRegStr $0 SHELL_CONTEXT "Software\5E\ProjectLauncher" "Executable"
  ${If} $0 == "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    DeleteRegKey SHELL_CONTEXT "Software\5E\ProjectLauncher"
  ${EndIf}
!macroend
