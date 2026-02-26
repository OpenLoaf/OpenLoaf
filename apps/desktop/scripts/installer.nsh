!macro customInstall
  StrCpy $R2 "$appExe"
  IfFileExists "$INSTDIR\\resources\\icon.ico" 0 +2
    StrCpy $R2 "$INSTDIR\\resources\\icon.ico"

  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$R2" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
  !endif

  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${ifNot} ${isNoDesktopShortcut}
      CreateShortCut "$newDesktopLink" "$appExe" "" "$R2" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
    ${endIf}
  !endif

  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    !ifdef MENU_FILENAME
      CreateDirectory "$SMPROGRAMS\\${MENU_FILENAME}"
      CreateShortCut "$SMPROGRAMS\\${MENU_FILENAME}\\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\\${UNINSTALL_FILENAME}"
      ClearErrors
    !else
      CreateShortCut "$SMPROGRAMS\\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\\${UNINSTALL_FILENAME}"
      ClearErrors
    !endif
  !endif
!macroend

!macro customInit
  ${StdUtils.GetParameter} $R0 "D" ""
  ${If} $R0 == ""
    StrCpy $R1 "$LocalAppData\\Programs\\desktop"
    ${If} $INSTDIR == $R1
      StrCpy $INSTDIR "$LocalAppData\\Programs\\OpenLoaf"
    ${EndIf}

    StrCpy $R1 "$PROGRAMFILES\\desktop"
    ${If} $INSTDIR == $R1
      StrCpy $INSTDIR "$PROGRAMFILES\\OpenLoaf"
    ${EndIf}

    StrCpy $R1 "$PROGRAMFILES64\\desktop"
    ${If} $INSTDIR == $R1
      StrCpy $INSTDIR "$PROGRAMFILES64\\OpenLoaf"
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    !ifdef MENU_FILENAME
      WinShell::UninstShortcut "$SMPROGRAMS\\${MENU_FILENAME}\\Uninstall ${PRODUCT_NAME}.lnk"
      Delete "$SMPROGRAMS\\${MENU_FILENAME}\\Uninstall ${PRODUCT_NAME}.lnk"
      RMDir "$SMPROGRAMS\\${MENU_FILENAME}"
    !else
      WinShell::UninstShortcut "$SMPROGRAMS\\Uninstall ${PRODUCT_NAME}.lnk"
      Delete "$SMPROGRAMS\\Uninstall ${PRODUCT_NAME}.lnk"
    !endif
  !endif
!macroend
