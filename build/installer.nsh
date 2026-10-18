; Novi's additions to the Windows installer that electron-builder generates (NSIS).
; electron-builder includes this file automatically (nsis.include in electron-builder.yml) and inserts
; the macros below at fixed points of its own installer script.

; customInit runs at the very start of the installer, before it asks for permission, closes Novi or
; touches any file.
;
; Why it exists: for an in-app update, Novi starts this installer and then quits normally (finishing
; recordings, stopping engines, signing out). It passes its own process id as --novi-wait-pid=<pid>.
; Without waiting, the installer would find Novi still closing and kill it after about a second,
; cutting that shutdown short. So the installer waits here until that process has ended, for at most
; 2 minutes. If Novi still hasn't closed by then, the installer continues and its normal
; "app is running" step closes it.
;
; A manual install (no --novi-wait-pid) and the elevated second copy of the installer that an
; all-users install starts (Novi has exited by then, so OpenProcess fails) skip the wait.
!macro customInit
  Push $R0
  Push $R1
  Push $R2
  ; "--novi-wait-pid=1234" -> "1234"; "" when the flag is absent.
  ${StdUtils.GetParameter} $R0 "novi-wait-pid" ""
  ; Keep only the leading number, so anything unexpected becomes 0 (no wait).
  IntOp $R0 $R0 + 0
  ${If} $R0 > 0
    ; SYNCHRONIZE (0x00100000) is the only access right needed to wait for a process to end.
    System::Call 'kernel32::OpenProcess(i 0x00100000, i 0, i $R0) p .R1'
    ${If} $R1 <> 0
      System::Call 'kernel32::WaitForSingleObject(p $R1, i 120000) i .R2'
      System::Call 'kernel32::CloseHandle(p $R1)'
    ${EndIf}
  ${EndIf}
  Pop $R2
  Pop $R1
  Pop $R0
!macroend
