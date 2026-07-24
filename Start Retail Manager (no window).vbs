' ============================================================
'  Retail Manager - silent launcher (no black window)
'  Double-click this to open your shop, just like a normal app.
' ============================================================
Option Explicit

Dim fso, shell, scriptDir, backendDir, nodeCheck

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = scriptDir & "\backend"
shell.CurrentDirectory = backendDir

' --- Check Node.js is installed ---
On Error Resume Next
nodeCheck = shell.Run("cmd /c where node", 0, True) ' 0 = hidden, wait
On Error GoTo 0
If nodeCheck <> 0 Then
    MsgBox "Node.js is not installed yet." & vbCrLf & vbCrLf & _
           "1. Go to https://nodejs.org" & vbCrLf & _
           "2. Download the LTS version and install it." & vbCrLf & _
           "3. Then double-click this file again.", 48, "Retail Manager"
    WScript.Quit
End If

' --- First-time setup: install libraries if not done yet (shown, so you see progress) ---
If Not fso.FolderExists(backendDir & "\node_modules") Then
    MsgBox "Setting up Retail Manager for the first time." & vbCrLf & _
           "This happens only once and takes a minute." & vbCrLf & vbCrLf & _
           "Click OK, wait for the setup window to finish on its own," & vbCrLf & _
           "and your shop will then open in your browser.", 64, "Retail Manager"
    ' Show this one so the user sees the install progress; wait until it finishes.
    shell.Run "cmd /c npm install", 1, True
End If

' --- Start the app hidden (if it's not already running, this launches it;
'     if it IS already running, this harmlessly does nothing) ---
shell.Run "cmd /c npm start", 0, False

' --- Give the server a moment, then open your shop in the browser.
'     This runs every time, so double-clicking the launcher again always
'     reopens your shop instead of appearing to do nothing. ---
WScript.Sleep 5000
shell.Run "http://localhost:4000", 1, False
