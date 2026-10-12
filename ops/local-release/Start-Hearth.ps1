[CmdletBinding()]
param([switch]$NoBrowser)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$releaseDirectory = $PSScriptRoot
$originalImage = $env:HEARTH_IMAGE
$originalPort = $env:HEARTH_PORT
$launcherExitCode = 0
$composeEnvFile = $null

function Invoke-HearthDocker {
    param([Parameter(Mandatory = $true)][string[]]$DockerArguments)
    $savedPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $dockerOutput = & $script:dockerExecutable @DockerArguments 2>&1
        $dockerExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
    }
    $dockerText = ($dockerOutput | ForEach-Object { $_.ToString() }) -join "`n"
    if ($dockerExitCode -ne 0) {
        throw "Docker command failed (exit $dockerExitCode): $dockerText"
    }
    return $dockerText.Trim()
}

function Get-HearthPlainFile {
    param([Parameter(Mandatory = $true)][string]$FileName)
    $file = Get-Item -LiteralPath (Join-Path $releaseDirectory $FileName) -Force -ErrorAction Stop
    if ($file -isnot [System.IO.FileInfo] -or ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
        throw "Release file '$FileName' must be a regular file, not a folder or link. Extract a fresh artifact."
    }
    return $file
}

function Assert-HearthImageIdentity {
    param([string]$Image, [string]$Architecture, [string]$Commit)
    $imageJson = Invoke-HearthDocker -DockerArguments @('image', 'inspect', $Image)
    try {
        if (-not $imageJson.TrimStart().StartsWith('[')) { throw 'Invalid image collection.' }
        $parsed = ConvertFrom-Json -InputObject $imageJson -ErrorAction Stop
        $images = @($parsed)
        if ($images.Count -ne 1 -or $images[0] -isnot [System.Management.Automation.PSCustomObject]) {
            throw 'Invalid image collection.'
        }
        $metadata = $images[0]
        if ($metadata.Os -isnot [string] -or $metadata.Architecture -isnot [string] -or
            $metadata.Config -isnot [System.Management.Automation.PSCustomObject] -or
            $metadata.Config.Env -isnot [System.Array]) {
            throw 'Invalid image fields.'
        }
        foreach ($entry in $metadata.Config.Env) {
            if ($entry -isnot [string]) { throw 'Invalid image environment.' }
        }
        $commits = @($metadata.Config.Env | Where-Object { $_.StartsWith('HEARTH_COMMIT=', [StringComparison]::Ordinal) })
        if ($commits.Count -ne 1) { throw 'Missing or duplicate image commit.' }
        $bakedCommit = $commits[0].Substring('HEARTH_COMMIT='.Length)
        if ($bakedCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'Invalid image commit.' }
    } catch {
        throw 'Docker returned invalid release image metadata. Extract a fresh artifact; no application was started.'
    }
    if ($metadata.Os -cne 'linux' -or $metadata.Architecture -cne $Architecture -or $bakedCommit -cne $Commit) {
        throw 'The loaded image platform or baked HEARTH_COMMIT does not match this release. It has not been started.'
    }
}

function Test-HearthChecksums {
    $required = @('image.tar.gz', 'compose.yaml', 'Start-Hearth.ps1', 'Start-Hearth.cmd', 'release.json')
    if (Test-Path -LiteralPath (Join-Path $releaseDirectory 'README.txt')) { $required += 'README.txt' }
    $expected = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    foreach ($fileName in $required) { [void]$expected.Add($fileName) }
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
    $checksumFile = Get-HearthPlainFile 'SHA256SUMS'
    foreach ($line in Get-Content -LiteralPath $checksumFile.FullName) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line -notmatch '^([0-9A-Fa-f]{64})[ \t]+\*?([A-Za-z0-9][A-Za-z0-9._-]*)$') {
            throw 'SHA256SUMS contains an invalid or unsafe file path. Extract a fresh artifact.'
        }
        $expectedHash = $Matches[1].ToLowerInvariant()
        $fileName = $Matches[2]
        if (-not $expected.Contains($fileName) -or -not $seen.Add($fileName)) {
            throw "SHA256SUMS contains an unexpected or duplicate entry '$fileName'. Extract a fresh artifact."
        }
        $file = Get-HearthPlainFile $fileName
        $actualHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -cne $expectedHash) {
            throw "Checksum verification failed for '$fileName'. Extract a fresh artifact; this release has not been loaded."
        }
    }
    foreach ($fileName in $required) {
        if (-not $seen.Contains($fileName)) {
            throw "SHA256SUMS is missing '$fileName'. Extract a complete, fresh artifact."
        }
    }
}

function Get-HearthPort {
    $portText = $originalPort
    if ([string]::IsNullOrWhiteSpace($portText)) {
        $portText = '3000'
        $envPath = Join-Path $releaseDirectory '.env'
        if (Test-Path -LiteralPath $envPath) {
            $envFile = Get-HearthPlainFile '.env'
            $portEntries = @(Get-Content -LiteralPath $envFile.FullName | Where-Object { $_ -match '^\s*(?:export\s+)?HEARTH_PORT\s*=' })
            if ($portEntries.Count -gt 1) { throw 'Your .env file contains more than one HEARTH_PORT setting. Keep just one.' }
            if ($portEntries.Count -eq 1) {
                $portText = ($portEntries[0] -replace '^\s*(?:export\s+)?HEARTH_PORT\s*=\s*', '' -replace '\s+#.*$', '').Trim()
                if ($portText.Length -ge 2 -and (($portText.StartsWith('"') -and $portText.EndsWith('"')) -or ($portText.StartsWith("'") -and $portText.EndsWith("'")))) {
                    $portText = $portText.Substring(1, $portText.Length - 2)
                }
            }
        }
    }
    $parsedPort = 0
    if ($portText -notmatch '^\d{1,5}$' -or -not [int]::TryParse($portText, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
        throw 'HEARTH_PORT must be a whole number from 1 to 65535, for example HEARTH_PORT=3001 in .env.'
    }
    return $parsedPort
}

function Get-HearthArchitecture {
    param([string]$Architecture)
    switch ($Architecture.ToLowerInvariant()) {
        'amd64' { return 'amd64' }
        'x86_64' { return 'amd64' }
        'arm64' { return 'arm64' }
        'aarch64' { return 'arm64' }
        default { throw "Docker engine architecture '$Architecture' is unsupported by this release." }
    }
}

function Test-HearthPort {
    param([int]$Port)
    $listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, $Port)
    $listener.Server.ExclusiveAddressUse = $true
    $portAvailable = $false
    try { $listener.Start(); $portAvailable = $true } catch [System.Net.Sockets.SocketException] {
        # An existing Hearth container may legitimately already own this port.
    } finally { $listener.Stop() }
    if ($portAvailable) { return }
    $containers = Invoke-HearthDocker -DockerArguments @('ps', '--filter', 'label=com.docker.compose.project=hearth', '--filter', 'label=com.docker.compose.service=hearth', '--format', '{{.ID}}')
    foreach ($containerId in ($containers -split "`n")) {
        if ($containerId -match '^[0-9a-f]+$') {
            $mapping = Invoke-HearthDocker -DockerArguments @('port', $containerId, '3000/tcp')
            if (($mapping -split "`n") -ccontains "127.0.0.1:$Port") { return }
        }
    }
    throw "Port $Port is already used by another application. Set HEARTH_PORT=3001 (or another free port) in .env, then retry. No application was stopped."
}

try {
    Write-Host 'Checking this Hearth release...' -ForegroundColor Cyan
    Test-HearthChecksums
    $releaseFile = Get-HearthPlainFile 'release.json'
    $release = Get-Content -LiteralPath $releaseFile.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
    $properties = @($release.PSObject.Properties.Name)
    if ($properties.Count -ne 4 -or @('version', 'commit', 'image', 'platform' | Where-Object { $_ -notin $properties }).Count -gt 0) {
        throw 'release.json must contain exactly version, commit, image, and platform.'
    }
    foreach ($property in @('version', 'commit', 'image', 'platform')) {
        if ($release.$property -isnot [string]) { throw "release.json '$property' must be a string." }
    }
    if ($release.commit -cnotmatch '^[0-9a-f]{40}$') { throw 'release.json commit must be a lowercase, full 40-character Git commit.' }
    if ($release.version -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$') { throw 'release.json version must be a plain release label.' }
    if ($release.image -cne "hearth-local:$($release.commit)") { throw 'release.json image does not match its exact commit tag.' }
    if ($release.platform -cnotin @('linux/amd64', 'linux/arm64')) { throw 'release.json platform must be linux/amd64 or linux/arm64.' }
    $port = Get-HearthPort
    $dockerCommand = Get-Command docker -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $dockerCommand) { throw 'Docker was not found. Install Docker Desktop for Windows, start it, then run this launcher again.' }
    $script:dockerExecutable = $dockerCommand.Source
    if (-not [string]::IsNullOrWhiteSpace($env:DOCKER_CONTEXT)) {
        $engineEndpoint = Invoke-HearthDocker -DockerArguments @('context', 'inspect', $env:DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}')
    } elseif (-not [string]::IsNullOrWhiteSpace($env:DOCKER_HOST)) {
        $engineEndpoint = $env:DOCKER_HOST
    } else {
        $engineEndpoint = Invoke-HearthDocker -DockerArguments @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
    }
    if ($engineEndpoint -notmatch '^npipe:////\./pipe/[A-Za-z0-9._-]+$') {
        throw 'Select your local Docker Desktop context and clear any remote DOCKER_HOST setting, then retry. This launcher only starts Hearth on this Windows laptop.'
    }
    try { $engine = Invoke-HearthDocker -DockerArguments @('info', '--format', '{{.OSType}}|{{.Architecture}}|{{.OperatingSystem}}') } catch {
        throw 'Docker Desktop is not responding. Open Docker Desktop, wait until its engine is running, and retry.'
    }
    $engineParts = $engine -split '\|'
    if ($engineParts.Count -ne 3) { throw 'Could not read Docker engine details. Restart Docker Desktop and retry.' }
    if ($engineParts[0] -cne 'linux') { throw 'Docker is using Windows containers. Switch Docker Desktop to Linux containers, then retry.' }
    if ($engineParts[2] -notmatch '(?i)docker desktop') { throw 'This Windows launcher requires the local Docker Desktop engine. Select the Docker Desktop context and retry.' }
    $architecture = Get-HearthArchitecture $engineParts[1]
    if ($release.platform -cne "linux/$architecture") {
        throw "This artifact is $($release.platform), but Docker Desktop uses linux/$architecture. Prepare a matching local release in GitHub, then download that artifact."
    }
    $composeVersion = Invoke-HearthDocker -DockerArguments @('compose', 'version', '--short')
    if ($composeVersion -notmatch '^v?(\d+)\.(\d+)' -or [int]$Matches[1] -lt 2 -or ([int]$Matches[1] -eq 2 -and [int]$Matches[2] -lt 20)) {
        throw 'Docker Compose 2.20 or newer is required. Update Docker Desktop and retry.'
    }
    Test-HearthPort $port
    Write-Host "Loading Hearth $($release.version) ($($release.commit))..." -ForegroundColor Cyan
    $loadOutput = Invoke-HearthDocker -DockerArguments @('load', '--input', (Join-Path $releaseDirectory 'image.tar.gz'))
    if (($loadOutput -split "`n") -cnotcontains "Loaded image: $($release.image)") { throw 'The image archive did not load the exact release tag. Extract a fresh artifact and retry.' }
    Assert-HearthImageIdentity -Image $release.image -Architecture $architecture -Commit $release.commit
    $env:HEARTH_IMAGE = $release.image
    $env:HEARTH_PORT = [string]$port
    Write-Host 'Starting Hearth with your existing pantry database...' -ForegroundColor Cyan
    $composeEnvFile = New-TemporaryFile
    $composeOutput = Invoke-HearthDocker -DockerArguments @('compose', '--env-file', $composeEnvFile.FullName, '--project-directory', $releaseDirectory, '--project-name', 'hearth', '--file', (Join-Path $releaseDirectory 'compose.yaml'), 'up', '--detach', '--no-build', '--wait', '--wait-timeout', '90', 'hearth')
    if ($composeOutput) { Write-Host $composeOutput }
    $address = "http://localhost:$port"
    Write-Host ''
    Write-Host "Hearth $($release.version) is ready at $address" -ForegroundColor Green
    Write-Host "Commit: $($release.commit)"
    if (-not $NoBrowser) {
        try { Start-Process $address } catch { Write-Host "Hearth is running. Open $address in your browser." -ForegroundColor Yellow }
    }
} catch {
    $launcherExitCode = 1
    Write-Host ''
    Write-Host "Hearth could not start: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'No database files or Docker volumes were deleted by this launcher.'
} finally {
    if ($null -ne $composeEnvFile) { Remove-Item -LiteralPath $composeEnvFile.FullName -Force -ErrorAction SilentlyContinue }
    $env:HEARTH_IMAGE = $originalImage
    $env:HEARTH_PORT = $originalPort
}
exit $launcherExitCode
