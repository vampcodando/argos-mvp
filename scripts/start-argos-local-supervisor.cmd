@echo off
set ROOT=%~dp0..
cd /d "%ROOT%"
if not exist logs mkdir logs
node tools\argos-local-supervisor.mjs >> logs\local-supervisor.out.log 2>> logs\local-supervisor.err.log
