@echo off
rem Met un projet a jour avec la derniere version de la bibliotheque Win95 (la lib doit d abord etre poussee sur GitHub).
rem Usage : maj-lib.bat [dossier-du-sous-module] [version]
rem   dossier-du-sous-module : defaut = detecte dans .gitmodules, sinon vendor/win95-lib
rem   version                : tag ou branche a utiliser (ex. v1.3.0) ; defaut = origin/main
rem A copier a la racine du projet (node vendor/win95-lib/tools/init-project.mjs le fait) : le projet est le dossier de ce fichier.
rem Le projet reste maitre : rien n est pousse ; le script enregistre seulement le nouveau pointeur dans un commit local.
cd /d "%~dp0"
setlocal EnableDelayedExpansion

set "LIB=%~1"
set "REF=%~2"
if "%REF%"=="" set "REF=origin/main"
if "%LIB%"=="" if exist .gitmodules for /f "tokens=2 delims= " %%p in ('git config -f .gitmodules --get-regexp "submodule\..*win95.*\.path"') do if "!LIB!"=="" set "LIB=%%p"
if "%LIB%"=="" set "LIB=vendor/win95-lib"

echo Projet     : %CD%
echo Bibliotheque : %LIB% (%REF%)
echo.
call :version AVANT

git submodule update --init "%LIB%" || goto erreur
git -C "%LIB%" fetch origin --tags || goto erreur
git -C "%LIB%" checkout %REF% || goto erreur
call :version APRES

git add "%LIB%"
git diff --cached --quiet -- "%LIB%" && (echo. & echo Deja a jour. & goto fin)
git commit -m "Mise a jour de la bibliotheque Win95 (%APRES%)" -- "%LIB%" || goto erreur
echo.
echo Bibliotheque mise a jour (%AVANT% -^> %APRES%) et enregistree.
echo Pense a lire %LIB%/CHANGELOG.md puis a faire "git push".
goto fin

:version
set "V=inconnue"
if exist "%LIB%\package.json" for /f "tokens=2 delims=:, " %%v in ('findstr /c:"\"version\"" "%LIB%\package.json"') do set "V=%%~v"
set "%1=%V%"
exit /b 0

:erreur
echo.
echo ERREUR : la mise a jour a echoue (le projet est-il un depot git avec le sous-module de la bibliotheque ?).
:fin
echo.
pause
