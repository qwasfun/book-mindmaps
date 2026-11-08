param([switch]$SkipDependencies)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceSkill = Join-Path $projectRoot 'skills/literary-mindmaps'
[void][IO.Directory]::CreateDirectory((Join-Path $projectRoot 'books'))
$targetSkill = [IO.Path]::GetFullPath((Join-Path $projectRoot '.agents/skills/literary-mindmaps'))
if (-not $targetSkill.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw '技能目标路径超出项目目录。'
}
# Copy only this project's authored skill; do not touch user-level skills.
foreach ($sourceFile in [IO.Directory]::EnumerateFiles($sourceSkill, '*', [IO.SearchOption]::AllDirectories)) {
    $relativeFile = [IO.Path]::GetRelativePath($sourceSkill, $sourceFile)
    if ($relativeFile.Split([IO.Path]::DirectorySeparatorChar) -contains '__pycache__') { continue }
    $targetFile = Join-Path $targetSkill $relativeFile
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($targetFile))
    [IO.File]::Copy($sourceFile, $targetFile, $true)
}
if (Test-Path -LiteralPath (Join-Path $projectRoot '.git')) {
    & git -C $projectRoot config --local core.hooksPath .githooks
    if ($LASTEXITCODE -ne 0) { throw 'Git 提交检查：无法配置当前仓库钩子；请检查 .git 的写入权限。' }
}
if (-not $SkipDependencies) {
    Push-Location -LiteralPath $projectRoot
    try {
        & uv sync --frozen --group dev --quiet
        if ($LASTEXITCODE -ne 0) { throw 'Python 依赖安装失败，请检查 uv 和网络连接。' }
        & npm.cmd ci --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Node 依赖安装失败，请检查 Node.js 22+ 和网络连接。' }
    } finally { Pop-Location }
}
Write-Output '文学阅读导图 Skill 已安装到当前项目，下个回合可使用 $literary-mindmaps。'
