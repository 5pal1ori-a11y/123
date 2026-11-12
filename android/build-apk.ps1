$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$SdkRoot = "C:\vendix\android-sdk"
$GradleVersion = "8.7"

Write-Host "==> VENDIX AutoCharge APK build"
Write-Host "    Project: $Root"
Write-Host "    SDK:     $SdkRoot"

function Ensure-Dir($path) {
  if (-not (Test-Path $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

Ensure-Dir $SdkRoot
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot

$sdkmanager = Join-Path $SdkRoot "cmdline-tools\latest\bin\sdkmanager.bat"
if (-not (Test-Path $sdkmanager)) {
  Write-Host "==> Downloading Android command-line tools..."
  $zip = Join-Path $env:TEMP "android-cmdline-tools.zip"
  curl.exe -fsSL -o $zip "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
  $extract = Join-Path $env:TEMP "android-cmdline-tools"
  if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
  Ensure-Dir $extract
  tar -xf $zip -C $extract
  Ensure-Dir (Join-Path $SdkRoot "cmdline-tools\latest")
  Copy-Item (Join-Path $extract "cmdline-tools\*") (Join-Path $SdkRoot "cmdline-tools\latest") -Recurse -Force
}

Write-Host "==> Installing SDK packages (first run may take several minutes)..."
$yes = ("y`n" * 20)
$yes | & $sdkmanager --sdk_root=$SdkRoot "platform-tools" "platforms;android-34" "build-tools;34.0.0" 2>&1 | Out-Host

$sdkDir = $SdkRoot -replace '\\', '/'
"sdk.dir=$sdkDir" | Set-Content -Path (Join-Path $Root "local.properties") -Encoding ASCII -NoNewline
Add-Content -Path (Join-Path $Root "local.properties") -Value "" -Encoding ASCII

if (-not (Test-Path (Join-Path $Root "gradlew.bat"))) {
  Write-Host "==> Generating Gradle wrapper..."
  $gradleZip = Join-Path $env:TEMP "gradle-$GradleVersion-bin.zip"
  if (-not (Test-Path $gradleZip)) {
    curl.exe -fsSL -o $gradleZip "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip"
  }
  $gradleDir = Join-Path $env:TEMP "gradle-$GradleVersion"
  if (-not (Test-Path $gradleDir)) {
    tar -xf $gradleZip -C $env:TEMP
  }
  Push-Location $Root
  & (Join-Path $gradleDir "bin\gradle.bat") wrapper --gradle-version $GradleVersion
  Pop-Location
}

Write-Host "==> Building debug APK..."
Push-Location $Root
& (Join-Path $Root "gradlew.bat") assembleDebug --no-daemon
Pop-Location

$apk = Join-Path $Root "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) {
  throw "APK not found at $apk"
}

$destinations = @(
  (Join-Path $Root "..\public\downloads\vendix-autocharge.apk"),
  "C:\vendix\public\downloads\vendix-autocharge.apk"
)

foreach ($dest in $destinations) {
  if (-not $dest) { continue }
  Ensure-Dir (Split-Path $dest -Parent)
  Copy-Item $apk $dest -Force
  Write-Host "==> Copied to $dest"
}

$size = [math]::Round((Get-Item $apk).Length / 1MB, 2)
Write-Host "==> Done ($size MB)"
