# OMP 简体中文 CLI 自动化

此 fork 的目标：跟随 `can1357/oh-my-pi` 的官方稳定版，自动复用中文译文、补译新增或改写的界面文案，并发布 Windows x64 CLI。安装后在 PowerShell 输入 `omp` 使用，没有图形界面。

- `main`：保留自动化脚本和翻译记忆库；这里的上游业务源码不自动合并，避免工作流与上游产生同步冲突。
- `zh-CN`：首个正式发布成功后创建；每次发布替换为对应官方稳定版源码并应用中文。`.github` 和本地化工具保留 fork 自己的版本。
- GitHub Releases：`zh-vX.Y.Z-rN.M` 为已通过 Windows CLI 校验的中文版本；修订号让源码标签与安装包始终对应。测试包只放 Actions Artifacts，不作为正式版本发布。

## 首次配置

在本仓库 **Settings → Secrets and variables → Actions → Secrets** 新建：

| Secret | 内容 |
| --- | --- |
| `TRANSLATION_API_KEY` | 你自己的 Gemini 或中转服务 API Key |

模型默认 `gemini-3.1-pro-preview`，Google 官方接口默认无需其他配置。如果使用 OpenAI 兼容中转服务，在 **Variables** 新建：

| Variable | 示例 |
| --- | --- |
| `TRANSLATION_PROVIDER` | `openai` |
| `TRANSLATION_BASE_URL` | `https://你的接口域名/v1`，填写基础地址，不含 `/chat/completions` |
| `TRANSLATION_MODEL` | `gemini-3.1-pro-preview`，可选 |

Google 原生兼容中转则使用 `TRANSLATION_PROVIDER=google` 和其原生接口基础地址，例如 `https://你的接口域名/v1beta`。密钥只填 Secret，不写进文件或 Variable。

然后进入 **Actions → OMP 中文自动更新 → Run workflow**：

- 正常运行：不勾 `audit_only`，自动翻译并在完成后发布。
- 先检查：勾 `audit_only`，不调用付费 API，生成缺口报告，并在 Windows 上构建和测试部分汉化包。
- 修订翻译或调整扫描器后：勾 `force`，即使上游版本未变化也重跑。
- 小批量接口验证：不勾 `audit_only`，将 `max_entries` 填为 `5`；`0` 使用默认上限。合格译文先保存，未通过变量顺序等校验的条目单独限次重试；格式持续不合格的批次会拆小重试。

工作流每小时第 17 分钟检查官方最新稳定版，GitHub 调度可能延迟。每轮最多补译 1000 条，每批 10 条、最多同时处理 3 批；可在 `localization/zh-CN/config.json` 调整 `batchSize` 和 `concurrency`（1～8）。翻译目录与失败报告依次写入，批次完成后立即保存；某批发生接口错误时停止安排新批次，并等待已发出的请求保存结果后再报错。成功批次保存在 Actions Cache，自动化脚本或官方版本更新后仍会恢复已有进度，按稳定 ID 复用原文未变的条目；失败时报告和目录保存在 Artifact，旧发布不受影响。正式发布成功后，翻译目录和上游版本记录提交回 `main`。

单条文案重试后仍不合格时，记录到 `zh-translations` Artifact 中的 `deferred.json`（包含条目 ID、文件、原文和原因），并继续翻译其他文案。部分成功只表示进度已保存；只要仍有待翻译项，就不会正式发布。整轮没有获得任何合格译文时会明确报错；鉴权、网络或服务错误仍会中断当前运行。下轮继续补译剩余项。

接口返回 408、429、5xx 或发生网络错误时，每批最多尝试 3 次，默认等待 10 秒、20 秒，并优先使用响应头中的重试等待时间。服务端要求等待超过 60 秒时结束本轮，保留进度供之后重试；不会将接口错误标记为译文校验失败。

## Windows 安装与更新

等首个中文正式 Release 发布后，在 PowerShell 下载并运行本仓库安装脚本：

```powershell
$installer = Join-Path $env:TEMP 'install-omp-zh.ps1'
Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/sm23444/oh-my-pi/main/localization/zh-CN/install.ps1' -OutFile $installer
powershell -NoProfile -ExecutionPolicy Bypass -File $installer
```

安装脚本校验下载包的 SHA256，复用已有 Bun；缺少时下载官方 Bun 1.4.4 并校验 SHA256。安装到 `%LOCALAPPDATA%\omp-zh`，将启动器写到 `%USERPROFILE%\.local\bin\omp.cmd` 并加入用户 PATH。已有同位置启动器会备份，新版启动验证成功后才切换。

重新打开 PowerShell：

```powershell
omp
omp --version
omp update --check
omp update
```

`omp update` 获取本仓库最新已验证的中文 Release。`omp update --plugins` 仍交给官方 CLI 处理插件。配置继续使用 `%USERPROFILE%\.omp\agent`。旧版目录保留供回退，不会自动删除。

如果 `Get-Command omp -All` 显示其他目录中的 `omp.exe` 在前，需要调整 PATH 优先级。CLI 在终端运行；内部使用的 Bun 是运行时，不是图形界面程序。

## 翻译范围与维护

扫描器使用 Babel 语法树，识别设置注册表、命令帮助、斜杠菜单、快捷键说明、思考选择器、聊天卡片、工具结果、状态栏、欢迎界面和终端显示调用。模板中的显示分支会单独翻译，条件、查找键、配置枚举、导入路径、协议字段、系统提示词和可执行输入示例保留原值。占位符、变量、命令、配置键、URL、快捷键和功能标记会保护并校验；表达式求值顺序保持不变，写入前重新解析源码。

设置分组、选项和动态状态另外在显示位置转换：界面显示中文，保存值、选择器参数、分组顺序和颜色标记仍使用官方原值。原文及保护内容一致、译法没有冲突的已有译文可复用。单次翻译请求默认最多等待 180 秒；持续超时的批次会拆小重试，单条仍失败则记录原因并继续保存其他结果。

目标是补全 OMP 自带 CLI 的用户可见文案。**扫描范围内无待译项和实际界面验收都通过后才发布；扫描完成本身不代表整个产品已经 100% 汉化。** 模型回答、用户内容、外部命令输出及第三方插件文案由其各自来源决定。官方增加新的界面结构时，仍需扩展识别规则与验收。

`localization/zh-CN/catalog.json` 是可人工修订的翻译目录。修改对应 `translation` 并保留所有 `__OMP_TOKEN_N__` 标记；可将 `origin` 标为 `human`。未改动的英文按稳定 ID 复用，行号变化不会触发重译；原文改写会产生新 ID，旧译文留存，不覆盖人工修订。缓存与提交的译文冲突时，已提交的译文优先。

初始种子译文来自 `tt1bt/oh-my-pi-zh`，固定提交见 `seed-source.json`，MIT 许可证见 `SEED-LICENSE`。这里只导入字符串/模板译文，未直接应用源码补丁、系统提示词或完整代码片段。翻译 HTTP 客户端、语法树扫描器和本工作流为此 fork 新增。

## 本地验证

需要 Bun ≥1.4.4：

```powershell
bun install --cwd localization/zh-CN --frozen-lockfile --ignore-scripts
cd localization/zh-CN
bun check
bun test .
bun pipeline.ts scan --source ../.. --report ./reports
```

`bun check` 检查自动化 TypeScript 和工作流 YAML 语法，契约测试使用模拟 API，不产生模型费用。Windows 构建会安装对应官方 npm 包、应用翻译，并验证版本、中文帮助、worker 启动及安装后的 `omp` 参数转发。正式发布还会加载打包后的实际命令注册表、自动补全组件和欢迎界面，检查菜单说明、动态模型与计划状态、技能数量及启动提示的中文渲染。这里生成的是带依赖的 CLI 运行包，不是官方签名的独立二进制发行版。
