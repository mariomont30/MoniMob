$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$tempPath = Join-Path $projectRoot '.tmp'
$expoHome = Join-Path $projectRoot '.expo-home'
$npmCache = Join-Path $projectRoot '.npm-cache'

New-Item -ItemType Directory -Path $tempPath, $expoHome, $npmCache -Force | Out-Null
$env:TEMP = $tempPath
$env:TMP = $tempPath
$env:__UNSAFE_EXPO_HOME_DIRECTORY = $expoHome
$env:npm_config_cache = $npmCache

Set-Location (Join-Path $projectRoot 'mobile-expo')
npx.cmd expo-doctor@latest
