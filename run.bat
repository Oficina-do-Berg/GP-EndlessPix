@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 http://127.0.0.1:8000/healthz; if ($r.Content -like '*max_upload_mb*') { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo.
  echo O GP-EndlessPix ja esta rodando.
  echo Abrindo http://127.0.0.1:8000 no navegador...
  start "" "http://127.0.0.1:8000"
  ping -n 3 127.0.0.1 >nul
  exit /b 0
)

set "PYTHON="
where python >nul 2>nul
if not errorlevel 1 set "PYTHON=python"
if not defined PYTHON (
  where py >nul 2>nul
  if not errorlevel 1 set "PYTHON=py -3"
)
if not defined PYTHON (
  echo Python nao encontrado. Instale o Python 3.11 ou mais novo.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Criando ambiente virtual...
  %PYTHON% -m venv .venv
  if errorlevel 1 goto :erro
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto :erro
)

if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo.
  echo O arquivo .env foi criado.
  echo Edite APP_PASSWORD e salve antes de usar.
  echo.
  notepad ".env"
)

findstr /C:"APP_PASSWORD=troque-esta-senha" ".env" >nul
if not errorlevel 1 (
  echo.
  echo Troque APP_PASSWORD no arquivo .env antes de iniciar.
  pause
  exit /b 1
)

echo.
echo Iniciando GP-EndlessPix em http://127.0.0.1:8000
echo Para parar, pressione Ctrl+C.
echo.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:8000'"
".venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
if errorlevel 1 (
  echo.
  echo O servidor parou com erro. A mensagem esta acima.
  pause
)
goto :eof

:erro
echo.
echo Falha ao preparar o ambiente.
pause
exit /b 1
