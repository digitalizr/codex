# Run with Windows PowerShell 5.1 to exercise native executable argument passing.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ne 5 -or $env:OS -ne 'Windows_NT') {
    throw 'Run this native launcher regression test with Windows PowerShell 5.1.'
}
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('hearth-native-' + [Guid]::NewGuid().ToString('N'))
$source = Join-Path $PSScriptRoot '..\ops\local-release'
$sha = '0123456789abcdef0123456789abcdef01234567'
$savedEnvironment = @{}
foreach ($name in @('PATH', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'HEARTH_PORT', 'HEARTH_IMAGE', 'FAKE_HEARTH_LOG', 'FAKE_HEARTH_MODE')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    $bin = Join-Path $testRoot 'bin'
    New-Item -ItemType Directory -Path $bin -Force | Out-Null
    $fakeDocker = @'
using System;
using System.IO;

public static class FakeHearthDocker {
    public static int Main(string[] args) {
        File.AppendAllText(Environment.GetEnvironmentVariable("FAKE_HEARTH_LOG"), String.Join("|", args) + Environment.NewLine);
        string sha = "0123456789abcdef0123456789abcdef01234567";
        string mode = Environment.GetEnvironmentVariable("FAKE_HEARTH_MODE");
        if (args[0] == "context") Console.WriteLine("npipe:////./pipe/dockerDesktopLinuxEngine");
        else if (args[0] == "info") Console.WriteLine("linux|x86_64|Docker Desktop");
        else if (args[0] == "load") Console.WriteLine("Loaded image: hearth-local:" + sha);
        else if (args[0] == "ps") { }
        else if (args[0] == "image" && args[1] == "inspect") {
            int format = Array.IndexOf(args, "--format");
            if (format >= 0) {
                // The original template loses embedded quotes under Windows PowerShell 5.1.
                if (!args[format + 1].Contains("\"=\"")) {
                    Console.Error.WriteLine("template parsing error: unexpected = in operand");
                    return 64;
                }
                Console.WriteLine("linux|amd64|" + sha);
            } else if (mode == "malformed") Console.WriteLine("[private-fixture-marker");
            else {
                string architecture = mode == "wrong-architecture" ? "arm64" : "amd64";
                string commit = mode == "wrong-commit" ? new String('f', 40) : sha;
                string duplicate = mode == "duplicate-commit" ? ",\"HEARTH_COMMIT=" + sha + "\"" : "";
                Console.WriteLine("[{\"Os\":\"linux\",\"Architecture\":\"" + architecture + "\",\"Config\":{\"Env\":[\"HEARTH_COMMIT=" + commit + "\",\"PRIVATE_TEST_MARKER=private-fixture-marker\"" + duplicate + "]}}]");
            }
        } else if (args[0] == "compose" && args[1] == "version") Console.WriteLine("2.40.3");
        else if (args[0] == "compose" && Array.IndexOf(args, "up") >= 0) Console.WriteLine("Container hearth-hearth-1 Healthy");
        else { Console.Error.WriteLine("Unexpected Docker command in launcher smoke test."); return 3; }
        return 0;
    }
}
'@
    Add-Type -TypeDefinition $fakeDocker -OutputAssembly (Join-Path $bin 'docker.exe') -OutputType ConsoleApplication
    $env:PATH = $bin + [System.IO.Path]::PathSeparator + $env:PATH
    $env:DOCKER_HOST = $null
    $env:DOCKER_CONTEXT = $null
    $env:HEARTH_IMAGE = $null
    $powershell = Join-Path $PSHOME 'powershell.exe'
    $files = @('image.tar.gz', 'compose.yaml', 'Start-Hearth.ps1', 'Start-Hearth.cmd', 'README.txt', 'release.json')

    foreach ($mode in @('success', 'wrong-commit', 'wrong-architecture', 'malformed', 'duplicate-commit')) {
        $bundle = Join-Path $testRoot $mode
        New-Item -ItemType Directory -Path $bundle | Out-Null
        foreach ($name in @('compose.yaml', 'Start-Hearth.ps1', 'Start-Hearth.cmd', 'README.txt')) {
            Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $bundle $name)
        }
        [System.IO.File]::WriteAllText((Join-Path $bundle 'image.tar.gz'), 'Fake archive: this smoke test never uses Docker.')
        @{ version = '1.0.0'; commit = $sha; image = "hearth-local:$sha"; platform = 'linux/amd64' } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundle 'release.json') -Encoding ascii
        $checksumLines = foreach ($name in $files) {
            $hash = (Get-FileHash -LiteralPath (Join-Path $bundle $name) -Algorithm SHA256).Hash.ToLowerInvariant()
            "$hash  $name"
        }
        $checksumLines | Set-Content -LiteralPath (Join-Path $bundle 'SHA256SUMS') -Encoding ascii
        $portProbe = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback, 0)
        $portProbe.Start()
        $env:HEARTH_PORT = [string]$portProbe.LocalEndpoint.Port
        $portProbe.Stop()
        $env:FAKE_HEARTH_MODE = $mode
        $env:FAKE_HEARTH_LOG = Join-Path $bundle 'docker-calls.txt'
        $output = & $powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bundle 'Start-Hearth.ps1') -NoBrowser 2>&1
        $status = $LASTEXITCODE
        $text = ($output | ForEach-Object { $_.ToString() }) -join "`n"
        $calls = Get-Content -LiteralPath $env:FAKE_HEARTH_LOG
        $started = @($calls | Where-Object { $_ -match '^compose\|.*\|up\|' }).Count -gt 0
        if ($mode -eq 'success') {
            if ($status -ne 0 -or -not $started -or $text -notmatch 'is ready at http://localhost:') {
                throw "Native success scenario failed: $text"
            }
        } elseif ($status -eq 0 -or $started) {
            throw "Unsafe image metadata was accepted in scenario '$mode'."
        }
        if ($text.Contains('private-fixture-marker')) { throw 'Image metadata leaked into launcher output.' }
        Write-Host "PASS Windows PowerShell native launcher: $mode"
    }
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
