@echo off
REM ---------------------------------------------------------------
REM  Atualiza o site a partir da planilha e publica.
REM  Update the site from the spreadsheet and publish it.
REM
REM  Uso: edite a PokeAgenda no Excel, salve, e rode este arquivo.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo [1/3] Lendo a planilha e gerando data\skeleton.json...
python tools\export_skeleton.py %1
if errorlevel 1 goto :erro

echo.
echo [2/3] Conferindo as contas contra a aba Resumo...
python tools\check_resumo.py %1
if errorlevel 1 (
  echo.
  echo   As contas nao bateram. Veja as divergencias acima.
  echo   Nada foi publicado. Corrija e rode de novo.
  goto :erro
)

echo.
echo [3/3] Publicando...
git add data\skeleton.json data\categories.json
git diff --cached --quiet
if not errorlevel 1 (
  echo   Nada mudou nos dados. Nada a publicar.
  goto :fim
)
for /f "tokens=*" %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set HOJE=%%d
git commit -m "Atualiza dados da PokeAgenda (%HOJE%)"
if errorlevel 1 goto :erro
git push
if errorlevel 1 goto :erro

echo.
echo   Pronto! A Vercel publica sozinha em ~1 minuto.
goto :fim

:erro
echo.
echo   ALGO DEU ERRADO - veja as mensagens acima.
pause
exit /b 1

:fim
echo.
pause
