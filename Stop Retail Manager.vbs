' ============================================================
'  Retail Manager - stop the app
'  Use this only if you want to fully shut the app down.
'  (Normally you can just leave it running.)
' ============================================================
Option Explicit

Dim shell, answer
Set shell = CreateObject("WScript.Shell")

answer = MsgBox("Stop Retail Manager now?" & vbCrLf & vbCrLf & _
                "Anyone using it (including on their phone) will be" & vbCrLf & _
                "disconnected until you start it again.", _
                vbQuestion + vbYesNo, "Retail Manager")

If answer = vbYes Then
    ' Stop the background Node process that runs the app.
    shell.Run "cmd /c taskkill /F /IM node.exe", 0, True
    MsgBox "Retail Manager has been stopped." & vbCrLf & _
           "Double-click the start file whenever you want it again.", 64, "Retail Manager"
End If
