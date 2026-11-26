$ErrorActionPreference = 'Stop'

$bridge = Join-Path ([Environment]::GetFolderPath('Desktop')) 'EasyPosHub\print-bridge.js'
$source = [System.IO.File]::ReadAllText($bridge)
$before = 'const payload = Buffer.concat(chunks);'
$after = 'chunks.push(Buffer.from([0x1b, 0x42, 0x02, 0x02])); ' + $before

if ($source.Contains($after)) {
    Write-Host 'Kasa ve Mutfak icin bip zaten ekli.'
    return
}

if ([regex]::Matches($source, [regex]::Escape($before)).Count -ne 1 -or
    $source -notmatch '0x1d, 0x56, 0x42, 0x00\)\)\); const payload = Buffer\.concat\(chunks\);') {
    throw 'Paylasilan fis biciminin kesme satiri bulunamadi. Dosyada degisiklik yapilmadi.'
}

$backup = $bridge + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Copy-Item -LiteralPath $bridge -Destination $backup
[System.IO.File]::WriteAllText($bridge, $source.Replace($before, $after), [System.Text.UTF8Encoding]::new($false))
Write-Host 'Kasa ve Mutfak icin iki kisa bip eklendi. Yedek olusturuldu.'
Write-Host 'Koprunun yeni dosyayi kullanmasi icin Windows oturumunu kapatip yeniden acin.'
