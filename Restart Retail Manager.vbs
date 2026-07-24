' ============================================================
'  Retail Manager - Restart (use this after installing an update)
'  Stops any copy that's still running in the background, then
'  starts the current version fresh and opens your shop.
' ============================================================
Option Explicit

Dim fso, shell, scriptDir, backendDir
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendDir = scriptDir & "\backend"
shell.CurrentDirectory = backendDir

' 1) Stop any running background server (harmless if nothing is running)
shell.Run "cmd /c taskkill /F /IM node.exe", 0, True
WScript.Sleep 1500

' 2) Start the current version, hidden
shell.Run "cmd /c npm start", 0, False

' 3) Give it a moment, then open the shop in the browser
WScript.Sleep 5000
shell.Run "http://localhost:4000", 1, False
