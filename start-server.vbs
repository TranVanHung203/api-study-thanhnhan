Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\api-study-thanhnhan-tranvanhung_demo2"
WshShell.Run "node app.js", 0, False
Set WshShell = Nothing
