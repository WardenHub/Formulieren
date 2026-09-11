@echo off
setlocal

set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE_EXE%" (
  echo Node.js is niet gevonden op "%NODE_EXE%".
  exit /b 1
)

"%NODE_EXE%" "%~dp0..\node_modules\vite\bin\vite.js" %*
