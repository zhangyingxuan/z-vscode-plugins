# Electron Windows x64 打包流程

> 最后验证：2026-11-25

在 Windows x64 上保留 `stock-ticker-electron/` 和 `stock-ticker/` 的同级目录关系。以下命令在 PowerShell 中执行，需要 Node.js、npm、Python 3 和 Windows 自带的 .NET Framework 4.x C# 编译器。版本号从应用的 `package.json` 读取。

## 构建并生成免安装 ZIP

```powershell
cd D:/workspace/github/z-vscode-plugins/stock-ticker-electron
npm.cmd ci
if ($LASTEXITCODE) { throw '依赖安装失败' }
npm.cmd test
if ($LASTEXITCODE) { throw '测试失败' }
npm.cmd run build
if ($LASTEXITCODE) { throw '构建失败' }

@'
import json
import os
from pathlib import Path
import shutil
import struct
import tempfile
import zipfile

root = Path.cwd()
dist = root / "dist"
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
name = f"Stock-Ticker-{version}-win-x64"
runtime = root / "node_modules/electron/dist"
with (runtime / "electron.exe").open("rb") as exe:
    exe.seek(0x3C)
    exe.seek(struct.unpack("<I", exe.read(4))[0])
    if exe.read(6) != b"PE\x00\x00\x64\x86":
        raise SystemExit("Expected Windows x64 Electron")

with tempfile.TemporaryDirectory(dir=dist) as directory:
    stage = Path(directory)
    bundle = stage / name
    shutil.copytree(runtime, bundle, ignore=shutil.ignore_patterns("default_app.asar"))
    (bundle / "electron.exe").rename(bundle / "StockTicker.exe")
    app = bundle / "resources/app"
    # 保留相对路径，主进程通过它们加载页面和预加载脚本。
    files = ("package.json", "dist/main.cjs", "dist/renderer.js", "dist/renderer.css",
             "src/preload/preload.cjs", "src/renderer/index.html")
    for path in files:
        destination = app / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / path, destination)
    # React 已打入页面产物，主进程仍需外部行情依赖及其传递依赖。
    for module in ("pay-back-core", "dayjs"):
        shutil.copytree(root / "node_modules" / module, app / "node_modules" / module)
    archive = Path(shutil.make_archive(str(stage / name), "zip", stage, name))
    with zipfile.ZipFile(archive) as zipped:
        if zipped.testzip() is not None:
            raise SystemExit("ZIP CRC check failed")
    os.replace(archive, dist / archive.name)
'@ | python -
if ($LASTEXITCODE) { throw 'ZIP 打包失败' }
```

交付物为 `dist/Stock-Ticker-<版本>-win-x64.zip`。解压整个目录，运行其中的 `StockTicker.exe`。

## 将 ZIP 封装为单文件 EXE

在同一目录继续执行。启动器将 ZIP 解包到独立临时目录，等待 Electron 退出后尝试清理。

```powershell
$ErrorActionPreference = 'Stop'
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$name = "Stock-Ticker-$version-win-x64"
$dist = (Resolve-Path dist).Path
$zip = Join-Path $dist "$name.zip"
$stage = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $source = Join-Path $stage 'Launcher.cs'
    @'
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static void Main()
    {
        // 每次使用独立目录，避免并发启动互相覆盖文件。
        string folder = Path.Combine(Path.GetTempPath(), "StockTicker-" + Guid.NewGuid().ToString("N"));
        try
        {
            Directory.CreateDirectory(folder);
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload"))
            using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                archive.ExtractToDirectory(folder);

            string app = Directory.GetDirectories(folder)[0];
            using (Process child = Process.Start(new ProcessStartInfo(Path.Combine(app, "StockTicker.exe")) {
                WorkingDirectory = app, UseShellExecute = false
            }))
                child.WaitForExit();
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Stock Ticker", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.ExitCode = 1;
        }
        finally
        {
            // 子进程结束后再清理，避免删除 Electron 仍需读取的文件。
            try { Directory.Delete(folder, true); }
            catch (IOException) {}
            catch (UnauthorizedAccessException) {}
        }
    }
}
'@ | Set-Content -Encoding utf8 $source
    $exe = Join-Path $stage "$name.exe"
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$exe" "/resource:$zip,payload" /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll $source
    if ($LASTEXITCODE) { throw 'EXE 编译失败' }

    # 核对编译后的内嵌资源与源 ZIP 完全一致，再写入交付目录。
    $assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($exe))
    $payload = $assembly.GetManifestResourceStream('payload')
    try {
        if ((Get-FileHash -InputStream $payload).Hash -ne (Get-FileHash -LiteralPath $zip).Hash) {
            throw 'EXE 内嵌 ZIP 校验失败'
        }
    } finally {
        $payload.Dispose()
    }
    Copy-Item -LiteralPath $exe -Destination $dist
} finally {
    Get-ChildItem -LiteralPath $stage -File | Remove-Item
    Remove-Item -LiteralPath $stage
}
```

交付物为 `dist/Stock-Ticker-<版本>-win-x64.exe`。在 Windows 上双击交付文件，确认浮窗显示、详情能展开、关闭后启动器退出。

进程和运行时文件位置见 [Electron 行情浮窗技术架构](../03-架构设计/Electron行情浮窗技术架构.md)。
