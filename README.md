# 小说阅读思维导图

在 Codex 中读取具体版本的 PDF / EPUB，分章分析后生成带原文出处的阅读图谱。默认简体中文、全书分析、允许剧透，浏览器中可查看全书总览、人物交叉关系、叙述/发生双时间线和主题意象。

## 直接使用

本机依赖和三个项目技能已配置。下一回合可在本项目中输入：

```text
使用 $literary-mindmaps 分析 books/我的图书.epub。
请读完整本，区分事实、解释、梦境和传闻，生成带章节出处的中文交互导图，允许剧透。
```

先把原书放进 `books/`，或在消息中提供本地文件路径。没有原书时不会根据书名补写剧情。项目默认模型为 **GPT-6.1 Sol / High**；复杂叙事可在模型选择器切换 **GPT-6 Astra / High**。项目配置不改变已有聊天的显式模型选择；未受信任的项目也可能不加载项目配置。[OpenAI 官方配置说明](https://learn.chatgpt.com/docs/config-file/config-reference)

若技能未出现在选择器，重新打开该项目或重启 Codex。技能位于项目 `.agents/skills`，仅影响当前项目。[OpenAI 官方技能说明](https://learn.chatgpt.com/docs/build-skills)

## 看一个完整示例

```powershell
npm.cmd run demo
Start-Process (Resolve-Path 'output/demo/maps/index.html').Path
```

示例《灯塔来信》为本项目原创验收短篇，含插叙、梦境、人物别名和开放结局。其分析为明确编写并核对的示例数据，不代表已完成真实图书分析或模型对比。

`index.html` 内嵌导图代码和数据，无需联网或服务器。也可以 `npm.cmd run preview`，打开命令显示的本地地址。预览只监听 `127.0.0.1`、只提供示例导图目录，Ctrl+C 停止。预览其他书：`node tools/preview.mjs "output/我的图书/maps"`。

## 三个技能各做什么

| 技能 | 作用 |
| --- | --- |
| `literary-mindmaps` | 本项目定制：分章阅读、人物与事件整合、出处核验及四种交互视图 |
| `markitdown` | K-Dense 的文档转换技能，配合微软 MarkItDown 读取 EPUB / PDF |
| `mindmap` | galiacheng 的结构凝练技能；HTML 由本项目调用官方 Markmap CLI 生成，无需 Bash |

已有的 `pdf` 技能可辅助检查 PDF 页面版面。本项目没有复制或更改全局技能。第三方来源和本机安装内容哈希记录在 `skills/third-party.json`。`mindmap` 的 panel 模式不在默认流程中启用。

## 解析、分析、核验、渲染

```powershell
.venv/Scripts/python.exe .agents/skills/literary-mindmaps/scripts/bookmaps.py extract "books/我的图书.epub" --out "output/我的图书/source"
.venv/Scripts/python.exe .agents/skills/literary-mindmaps/scripts/bookmaps.py init "output/我的图书/source/book.json" --out "output/我的图书/analysis.json"
# 此时由 Codex 读完各章，并按 Skill 填写 analysis.json。
.venv/Scripts/python.exe .agents/skills/literary-mindmaps/scripts/bookmaps.py validate "output/我的图书/source/book.json" "output/我的图书/analysis.json"
node tools/render.mjs --book "output/我的图书/source/book.json" --analysis "output/我的图书/analysis.json" --out "output/我的图书/maps"
```

解析产物包括完整的 `book.json`、逐章/逐页 Markdown 和 MarkItDown 的 `conversion.md`。EPUB 按 OPF spine 排序并保留全部分节；PDF 保留每个物理页，分析时再依据目录和页内标题分章。前言、目录、附录仅初步分类，须对照原书核对。扫描 PDF 需要先 OCR；本工具不会悄悄略过不可读页，也不会虚构 EPUB 页码。

分析格式见 [格式说明](skills/literary-mindmaps/references/analysis-format.md)。初始化文件为待填写状态，不能直接当作完成结果。输出目录和分析文件默认拒绝覆盖；明确要替换生成物时加 `--force`。原书不会被修改。

核验器输出 `{"ok":false,"errors":[{"field":"characters.0.evidence.0.quote","code":"quote_mismatch","message":"…具体原因及修正要求…"}]}` 并以状态码 2 退出。渲染器沿用这些字段错误。错误信息不回显提交值。

最终目录包含 `index.html`、独立总览/主题 HTML、五份 Markdown、`analysis.json` 和 `verification.json`。HTML 只内嵌被引用的原文段落，原书与完整提取文本留在本机。分享 HTML 前应知道它包含分析、文件名和这些证据段落。

## 安装与验证

需要 Windows PowerShell 7、Node.js 22+ 和 uv。新机器或修改自定义 Skill 后运行：

```powershell
pwsh -File tools/setup.ps1
# 仅同步自定义技能，不安装依赖：
pwsh -File tools/setup.ps1 -SkipDependencies
npm.cmd test
npm.cmd run demo
npm.cmd run test:browser
```

Python 依赖用 `uv.lock` 锁定，Node 依赖用 `package-lock.json` 锁定。浏览器检查使用项目内 Playwright CLI 和本机 Edge，结果与截图写入 `output/playwright/`。

解析、出处核验、渲染无需调用额外模型 API；**文学分析由当前 Codex 模型完成，会使用该会话的模型服务**。核验器只证明格式、版本指纹、覆盖声明、引用位置与短引文匹配，不证明已实际读完，也不证明人物身份与文学解释成立。真实图书仍需原文语义抽查。

## Git 管理与图书地址

Git 管理代码、技能、配置和说明文档。图书源文件始终保留在本机 `books/`；该目录下所有文件均被忽略，包括纯文本、图片和压缩包。提取全文、OCR 和导图等 `output/` 生成物也不提交。PDF、EPUB、MOBI、AZW 等常见电子书格式即使放在其他目录也会被忽略。

后续的图书线上地址统一整理到 [图书来源索引](docs/book-sources.md)。只记录书名、版本、公开来源地址和本地相对文件名，不上传原书或把全文复制进文档。临时签名下载链接、令牌和私密参数不写入仓库；使用时另行提供，索引只保留公开来源页。

仓库配置 `.githooks/pre-commit`，在提交前检查整个暂存区，拒绝 `books/`、`output/` 和常见电子书格式文件，包括被 `git add -f` 强制暂存的文件。它不能识别任意改名的纯文本原书，仍须按项目约定将所有源文件放在 `books/`，不得绕过钩子。

```powershell
git status --short
npm.cmd run check:git
git diff --cached --stat
git commit -m "说明本次修改"
```

新克隆环境运行 `pwsh -File tools/setup.ps1`，会将当前仓库的 `core.hooksPath` 设置为 `.githooks`。无需修改全局 Git 配置。初始仓库仅建立本地版本记录；关联远程仓库和推送按后续明确指令执行。
