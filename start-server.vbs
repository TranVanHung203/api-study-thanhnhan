Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\TrangDayHocOnlineBackEnd-master"
WshShell.Run "node app.js", 0, False
Set WshShell = Nothing
