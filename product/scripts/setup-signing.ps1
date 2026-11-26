# Run locally in Windows PowerShell. No credentials are written to the repository.
param([string]$KeyDirectory = (Join-Path $HOME 'qidongapp-signing'))
$ErrorActionPreference = 'Stop'
$Repo = 'rainy256/qidongapp'
$Alias = 'qidongapp'
$Names = @('ANDROID_KEYSTORE_BASE64','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD')
$Gh = (Get-Command gh -ErrorAction Stop).Source
$Keytool = (Get-Command keytool -ErrorAction Stop).Source

function Get-SigningSecretNames {
    $raw = & $Gh secret list --repo $Repo --app actions --json name
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list repository Secrets.' }
    return @($raw | ConvertFrom-Json | ForEach-Object { $_.name })
}
function Set-SigningSecret([string]$Name,[string]$Value) {
    # Redirect exact value to stdin; never pass it as a command-line argument.
    $p = New-Object System.Diagnostics.Process
    $p.StartInfo.FileName = $Gh
    $p.StartInfo.Arguments = "secret set $Name --repo $Repo --app actions"
    $p.StartInfo.UseShellExecute = $false
    $p.StartInfo.RedirectStandardInput = $true
    try {
        if (-not $p.Start()) { throw "Could not start gh for $Name" }
        $p.StandardInput.Write($Value)
        $p.StandardInput.Close()
        $p.WaitForExit()
        if ($p.ExitCode -ne 0) { throw "Failed to configure $Name" }
    } finally { $p.Dispose() }
}
function Read-PrivatePassword([string]$Prompt) {
    $s = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $s.Dispose() }
}
& $Gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
    & $Gh auth login --hostname github.com --web --git-protocol https
    if ($LASTEXITCODE -ne 0) { throw 'GitHub login failed.' }
}
$permission = & $Gh repo view $Repo --json viewerPermission --jq '.viewerPermission'
if ($LASTEXITCODE -ne 0 -or $permission -ne 'ADMIN') { throw 'Repository admin permission is required.' }
$existing = @(Get-SigningSecretNames | Where-Object { $_ -in $Names })
if ($existing.Count -gt 0) {
    throw ("Existing signing Secrets detected; no changes made: " + ($existing -join ', ') + ". Do not rotate an existing release key.")
}
if ((Read-Host "Configure first-time release signing for $Repo? Type YES") -cne 'YES') { return }
New-Item -ItemType Directory -Path $KeyDirectory -Force | Out-Null
$KeyFile = Join-Path $KeyDirectory 'qidongapp-release.jks'
$Password = $null
$Confirm = $null
$Encoded = $null
try {
    $Password = Read-PrivatePassword 'Enter a strong signing password (16+ printable ASCII characters, no spaces)'
    if ($Password -notmatch '^[!-~]{16,128}$') { throw 'Password must be 16-128 printable ASCII characters without spaces.' }
    $Confirm = Read-PrivatePassword 'Repeat the password'
    if ($Password -cne $Confirm) { throw 'Passwords do not match.' }
    $Confirm = $null
    $env:QIDONG_LOCAL_KEY_PASSWORD = $Password
    if (-not (Test-Path -LiteralPath $KeyFile)) {
        & $Keytool -genkeypair -keystore $KeyFile -storetype JKS -keyalg RSA -keysize 2048 -validity 36500 -alias $Alias -dname 'CN=Qidong, O=Qidong, C=CN' -storepass:env QIDONG_LOCAL_KEY_PASSWORD -keypass:env QIDONG_LOCAL_KEY_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw 'Key generation failed.' }
    } else {
        Write-Host "Reusing existing local key: $KeyFile"
        if ((Read-Host 'Confirm this key is yours and uses the same key and store password. Type YES') -cne 'YES') { return }
    }
    & $Keytool -list -v -keystore $KeyFile -storetype JKS -alias $Alias -storepass:env QIDONG_LOCAL_KEY_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Keystore validation failed.' }
    Remove-Item Env:QIDONG_LOCAL_KEY_PASSWORD -ErrorAction SilentlyContinue
    $Encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($KeyFile))
    # Recheck to avoid overwriting an existing signing configuration.
    $existing = @(Get-SigningSecretNames | Where-Object { $_ -in $Names })
    if ($existing.Count -gt 0) { throw 'Signing Secrets appeared during setup. No overwrite attempted.' }
    Set-SigningSecret 'ANDROID_KEYSTORE_BASE64' $Encoded
    Set-SigningSecret 'ANDROID_KEYSTORE_PASSWORD' $Password
    Set-SigningSecret 'ANDROID_KEY_ALIAS' $Alias
    Set-SigningSecret 'ANDROID_KEY_PASSWORD' $Password
    $after = @(Get-SigningSecretNames)
    if (@($Names | Where-Object { $_ -notin $after }).Count -gt 0) { throw 'Some signing Secrets are missing.' }
    Write-Host 'All four signing Secret names verified. Actual signing still requires a release workflow run.'
    Write-Host "BACK UP this keystore offline: $KeyFile"
    Write-Host 'Save the password separately in your password manager. Never commit the keystore.'
} finally {
    Remove-Item Env:QIDONG_LOCAL_KEY_PASSWORD -ErrorAction SilentlyContinue
    $Password = $null; $Confirm = $null; $Encoded = $null
}
