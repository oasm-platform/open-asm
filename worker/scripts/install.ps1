#Requires -Version 5.1
<#
.SYNOPSIS
    Installs the latest oasm-worker binary from GitHub releases.

.DESCRIPTION
    Downloads the latest oasm-worker binary for your platform from
    https://github.com/oasm-platform/open-asm releases, verifies it,
    and optionally starts the worker immediately.

.PARAMETER ApiKey
    (Required) API key for worker authentication.

.PARAMETER GrpcHost
    gRPC server host. Default: "localhost"

.PARAMETER GrpcPort
    gRPC server port. Default: 16276

.PARAMETER MaxConcurrency
    Maximum number of concurrent tasks. Default: 10

.PARAMETER Network
    Network ID for internal network connection. Optional.

.PARAMETER InstallDir
    Installation directory for the binary. Default: "$env:USERPROFILE\.oasm-worker"

.PARAMETER Run
    If set, start the worker immediately after installation.

.EXAMPLE
    .\install.ps1 -ApiKey "oasm_xxx"

.EXAMPLE
    .\install.ps1 -ApiKey "oasm_xxx" -Run

.EXAMPLE
    .\install.ps1 -ApiKey "oasm_xxx" -GrpcHost "my-server.com" -GrpcPort 16276 -Run
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey,

    [Parameter(Mandatory = $false)]
    [string]$GrpcHost = "localhost",

    [Parameter(Mandatory = $false)]
    [int]$GrpcPort = 16276,

    [Parameter(Mandatory = $false)]
    [int]$MaxConcurrency = 10,

    [Parameter(Mandatory = $false)]
    [string]$Network = "",

    [Parameter(Mandatory = $false)]
    [string]$InstallDir = "$env:USERPROFILE\.oasm-worker",

    [Parameter(Mandatory = $false)]
    [switch]$Run
)

$ErrorActionPreference = "Stop"
$Repository = "oasm-platform/open-asm"

# ============================================================
# Platform Detection
# ============================================================
function Get-PlatformInfo {
    $os = $null
    $arch = $null

    # PowerShell 7+ has built-in $IsWindows / $IsLinux / $IsMacOS
    # PowerShell 5.1 on Windows does NOT have these variables
    if ($PSVersionTable.PSVersion.Major -ge 6) {
        if ($IsWindows) {
            $os = "windows"
        } elseif ($IsLinux) {
            $os = "linux"
        } elseif ($IsMacOS) {
            $os = "darwin"
        }
    } else {
        # PowerShell 5.1 - Windows only
        $os = "windows"
    }

    if (-not $os) {
        throw "Unsupported platform. This script supports Windows, Linux, and macOS."
    }

    # Detect architecture
    if ($os -eq "windows") {
        $arch = if ([System.Environment]::Is64BitOperatingSystem) { "amd64" } else { $null }
    } else {
        try {
            $unameM = (uname -m).Trim()
            if ($unameM -match "^(aarch64|arm64|ARM64)$") {
                $arch = "arm64"
            } elseif ($unameM -match "^(x86_64|amd64|AMD64)$") {
                $arch = "amd64"
            }
        } catch {
            $arch = "amd64"
        }
    }

    if (-not $arch) {
        throw "Unsupported or 32-bit architecture. oasm-worker requires a 64-bit system."
    }

    $extension = if ($os -eq "windows") { ".exe" } else { "" }
    $binaryName = "oasm-worker-$os-$arch$extension"

    return @{
        OS         = $os
        Arch       = $arch
        Extension  = $extension
        BinaryName = $binaryName
    }
}

# ============================================================
# GitHub API: Get Latest Release
# ============================================================
function Get-LatestRelease {
    $apiUrl = "https://api.github.com/repos/$Repository/releases/latest"

    $headers = @{
        "Accept"     = "application/vnd.github.v3+json"
        "User-Agent" = "oasm-installer/1.0"
    }

    try {
        $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -UseBasicParsing
        return $release
    } catch {
        throw "Failed to fetch latest release from GitHub: $($_.Exception.Message)"
    }
}

function Find-BinaryAsset {
    param(
        [Parameter(Mandatory = $true)]
        $Release,
        [Parameter(Mandatory = $true)]
        [string]$BinaryName
    )

    $asset = $Release.assets | Where-Object { $_.name -eq $BinaryName }

    if (-not $asset) {
        $available = ($Release.assets | ForEach-Object { $_.name }) -join "`n  "
        throw "Binary '$BinaryName' not found in release $($Release.tag_name).`nAvailable assets:`n  $available"
    }

    return @{
        Url           = $asset.browser_download_url
        Size          = $asset.size
        DownloadCount = $asset.download_count
    }
}

# ============================================================
# Download & Verify
# ============================================================
function Install-WorkerBinary {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DownloadUrl,
        [Parameter(Mandatory = $true)]
        [string]$InstallDir,
        [Parameter(Mandatory = $true)]
        [string]$BinaryName,
        [Parameter(Mandatory = $false)]
        [long]$ExpectedSize = 0
    )

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    $destPath = Join-Path $InstallDir $BinaryName

    Write-Host "  Downloading $BinaryName..." -ForegroundColor Cyan
    try {
        $progressPreferenceBak = $ProgressPreference
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $destPath -UseBasicParsing -TimeoutSec 300
        $ProgressPreference = $progressPreferenceBak
    } catch {
        throw "Failed to download binary: $($_.Exception.Message)"
    }

    if (-not (Test-Path $destPath)) {
        throw "Download failed - file not found at $destPath"
    }

    $fileInfo = Get-Item $destPath
    if ($fileInfo.Length -eq 0) {
        Remove-Item $destPath -Force
        throw "Downloaded file is empty. The release may be corrupted."
    }

    if ($ExpectedSize -gt 0 -and $fileInfo.Length -ne $ExpectedSize) {
        Write-Host "  Warning: File size ($($fileInfo.Length)) differs from expected ($ExpectedSize)" -ForegroundColor Yellow
    }

    $sizeMB = [math]::Round($fileInfo.Length / 1MB, 2)
    Write-Host "  Downloaded: $sizeMB MB" -ForegroundColor Green

    # Set executable permission on Unix-like systems
    if ($PSVersionTable.PSVersion.Major -ge 6 -and ($IsLinux -or $IsMacOS)) {
        chmod +x $destPath 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Warning: Could not set executable permission. Run: chmod +x $destPath" -ForegroundColor Yellow
        }
    }

    return $destPath
}

# ============================================================
# Run Worker
# ============================================================
function Start-Worker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BinaryPath,
        [Parameter(Mandatory = $true)]
        [hashtable]$Config
    )

    $args = @(
        "--api-key", $Config.ApiKey
        "--max-concurrency", $Config.MaxConcurrency.ToString()
        "--grpc-host", $Config.GrpcHost
        "--grpc-port", $Config.GrpcPort.ToString()
    )

    if ($Config.Network -and $Config.Network -ne "") {
        $args += "--network"
        $args += $Config.Network
    }

    Write-Host ""
    Write-Host "  Starting oasm-worker..." -ForegroundColor Cyan
    Write-Host "  Endpoint   : $($Config.GrpcHost):$($Config.GrpcPort)" -ForegroundColor Gray
    Write-Host "  Concurrency: $($Config.MaxConcurrency)" -ForegroundColor Gray
    if ($Config.Network -ne "") {
        Write-Host "  Network    : $($Config.Network)" -ForegroundColor Gray
    }
    Write-Host ""

    & $BinaryPath @args
}

# ============================================================
# Build Re-run Command
# ============================================================
function Get-RerunCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BinaryPath,
        [Parameter(Mandatory = $true)]
        [string]$ApiKey,
        [string]$GrpcHost = "localhost",
        [int]$GrpcPort = 16276,
        [int]$MaxConcurrency = 10,
        [string]$Network = ""
    )

    $cmd = "`"$BinaryPath`" --api-key `"$ApiKey`" --grpc-host `"$GrpcHost`" --grpc-port $GrpcPort --max-concurrency $MaxConcurrency"

    if ($Network -and $Network -ne "") {
        $cmd += " --network `"$Network`""
    }

    return $cmd
}

# ============================================================
# Main
# ============================================================
try {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  OASM Worker Installer" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Detect platform
    Write-Host "[1/5] Detecting platform..." -ForegroundColor White
    $platform = Get-PlatformInfo
    Write-Host "  OS  : $($platform.OS)" -ForegroundColor Gray
    Write-Host "  Arch: $($platform.Arch)" -ForegroundColor Gray
    Write-Host "  Bin : $($platform.BinaryName)" -ForegroundColor Gray
    Write-Host ""

    # 2. Query GitHub for latest release
    Write-Host "[2/5] Fetching latest release from GitHub..." -ForegroundColor White
    $release = Get-LatestRelease
    $version = $release.tag_name
    Write-Host "  Version : $version" -ForegroundColor Gray
    Write-Host "  Published: $($release.published_at)" -ForegroundColor Gray
    Write-Host ""

    # 3. Find matching binary asset
    Write-Host "[3/5] Finding matching binary..." -ForegroundColor White
    $asset = Find-BinaryAsset -Release $release -BinaryName $platform.BinaryName
    Write-Host "  URL  : $($asset.Url)" -ForegroundColor Gray
    Write-Host "  Size : $([math]::Round($asset.Size / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host ""

    # 4. Download and verify
    Write-Host "[4/5] Installing binary..." -ForegroundColor White
    $binaryPath = Install-WorkerBinary `
        -DownloadUrl $asset.Url `
        -InstallDir $InstallDir `
        -BinaryName $platform.BinaryName `
        -ExpectedSize $asset.Size
    Write-Host "  Path: $binaryPath" -ForegroundColor Green
    Write-Host ""

    # 5. Print summary
    Write-Host "[5/5] Done!" -ForegroundColor White
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Installation complete!" -ForegroundColor Green
    Write-Host "  Version : $version" -ForegroundColor Green
    Write-Host "  Binary  : $binaryPath" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""

    # Print re-run command
    $rerunCmd = Get-RerunCommand `
        -BinaryPath $binaryPath `
        -ApiKey $ApiKey `
        -GrpcHost $GrpcHost `
        -GrpcPort $GrpcPort `
        -MaxConcurrency $MaxConcurrency `
        -Network $Network

    Write-Host "To re-run the worker later:" -ForegroundColor Yellow
    Write-Host "  $rerunCmd" -ForegroundColor White
    Write-Host ""

    # Run if requested
    if ($Run) {
        $config = @{
            ApiKey         = $ApiKey
            GrpcHost       = $GrpcHost
            GrpcPort       = $GrpcPort
            MaxConcurrency = $MaxConcurrency
            Network        = $Network
        }
        Start-Worker -BinaryPath $binaryPath -Config $config
    } else {
        Write-Host "Run with -Run flag to start the worker immediately." -ForegroundColor DarkGray
        Write-Host "Example:" -ForegroundColor DarkGray
        Write-Host "  `"$binaryPath`" --api-key `"$ApiKey`"" -ForegroundColor DarkGray
        Write-Host ""
    }

} catch {
    Write-Host ""
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "If the problem persists, download the binary manually from:" -ForegroundColor Yellow
    Write-Host "  https://github.com/$Repository/releases/latest" -ForegroundColor White
    Write-Host ""
    exit 1
}
