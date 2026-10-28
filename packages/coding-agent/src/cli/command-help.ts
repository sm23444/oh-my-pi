import type { CommandMetadata } from "@oh-my-pi/pi-utils/cli";

export const acpHelp = {
	description: "通过 stdio 将 omp 作为 ACP（智能体客户端协议）服务器运行",
} satisfies CommandMetadata;

export const agentsHelp = { description: "管理内置任务代理" } satisfies CommandMetadata;

export const anonymizeHelp = {
	description:
		"写入会话及其子智能体的可共享副本：轮次内容已脱敏，元数据保留，路径和字面量替换为一致的模拟令牌",
} satisfies CommandMetadata;

export const authHelp = {
	description: "将存储的提供商凭据（API 密钥和 OAuth 登录信息）导出或导入为 JSON",
} satisfies CommandMetadata;

export const authBrokerHelp = {
	description: "管理 omp auth-broker(凭据保险库)",
} satisfies CommandMetadata;

export const authGatewayHelp = {
	description:
		"运行 auth-gateway：由配置的 broker 提供支持的 HTTP 正向代理，或者在 stdio 上使用您自己凭据的 JSON 行",
} satisfies CommandMetadata;

export const benchHelp = {
	description:
		"基准测试模型：在聊天、预填充、生成和提示词缓存工作负载中，或在单用户与并行负载下，对比 TTFT/prefill 与解码吞吐量及 p50/p95 (--detailed)",
} satisfies CommandMetadata;

export const browserRelayHelp = {
	description: "运行本地 CDP 中继，让浏览器前奏驱动你自己的 Chrome 标签页",
} satisfies CommandMetadata;

export const cleanseHelp = {
	description: "用加权并行子代理检测并修复项目诊断问题",
} satisfies CommandMetadata;

export const collabHelp = {
	description:
		"列出本地活动 Collab 主机的元数据（不含网址）；使用 collab link <instanceId|pid> 获取控制链接（--view 表示只读访问）",
} satisfies CommandMetadata;

export const clipHelp = {
	description: "将 /record 录像作为公开片段上传至 live.omp.sh，并打印其 URL",
} satisfies CommandMetadata;

export const commitHelp = { description: "生成提交信息并更新变更日志" } satisfies CommandMetadata;

export const completionsHelp = {
	description: "输出 shell 补全脚本(bash、zsh 或 fish)",
} satisfies CommandMetadata;

export const completeHelp = { hidden: true } satisfies CommandMetadata;

export const compressHelp = {
	description: "把文本文件改写为高密度提示寄存器，并报告丢弃内容",
} satisfies CommandMetadata;

export const configHelp = { description: "管理配置设置" } satisfies CommandMetadata;

export const dryBalanceHelp = {
	description: "在随机会话 ID 间试运行 OAuth 账户负载均衡",
} satisfies CommandMetadata;

export const galleryHelp = {
	description: "在确定性视觉画廊中预览工具、输入框与状态栏渲染器",
} satisfies CommandMetadata;

export const gcHelp = { description: "运行存储垃圾回收" } satisfies CommandMetadata;
export const ifBenchHelp = {
	description:
		"基准测试指令遵循和工作内存：一个包含字形数组操作和移动的猫叫声指令的已缓存线程",
} satisfies CommandMetadata;
export const gitHelp = {
	description: "交互式全屏 git 界面：分栏 diff 查看器、暂存侧栏与提交编辑器",
} satisfies CommandMetadata;

export const findHelp = {
	description: "语义搜索:描述一个行为,得到实现它的文件与行范围",
} satisfies CommandMetadata;

export const grepHelp = { description: "测试 grep 工具" } satisfies CommandMetadata;

export const grievancesHelp = {
	description: "查看、清理或上报工具问题(自动 QA 投诉)",
} satisfies CommandMetadata;

export const loginHelp = {
	description: "登录到模型提供商（/login 的终端对应命令）",
} satisfies CommandMetadata;

export const imagesHelp = {
	description: "检查、诊断、探测并清理图片发布后端",
} satisfies CommandMetadata;

export const installHelp = {
	description: "安装或链接扩展包(`plugin install`/`plugin link` 的别名)",
} satisfies CommandMetadata;

export const joinHelp = { description: "加入共享协作会话(同 /join)" } satisfies CommandMetadata;

export const modelsHelp = { description: "列出、搜索并刷新可用模型" } satisfies CommandMetadata;

export const pluginHelp = { description: "管理插件(安装、卸载、列出等)" } satisfies CommandMetadata;

export const playHelp = {
	description: "在终端中重播 /record 会话录像（空格键暂停，q 退出）",
} satisfies CommandMetadata;

export const predictHelp = {
	description: "输入提示词并实时比较各个单词补全引擎的幽灵文本",
} satisfies CommandMetadata;

export const psHelp = {
	description: "列出并控制守护进程托管的后台进程（logs、stop、kill、restart）",
} satisfies CommandMetadata;

export const readHelp = {
	description: "预览 read 工具对路径、URL 或内部 URI 的返回内容",
} satisfies CommandMetadata;
export const renderHelp = {
	description: "通过生产环境转录流水线绘制会话的整个线程（包含重绘时序）",
} satisfies CommandMetadata;

export const sayHelp = {
	description: "用本地 TTS 引擎合成文本并通过扬声器播放",
} satisfies CommandMetadata;

export const searchHelp = { description: "测试网页搜索提供商" } satisfies CommandMetadata;

export const sessionHelp = {
	description: "将会话移交到另一台机器：打包、解包或将本地副本标记为已移动",
} satisfies CommandMetadata;

export const shareHelp = {
	description: "通过加密链接分享已保存的会话（等同于 /share）",
} satisfies CommandMetadata;

export const setupHelp = {
	description: "运行新手引导或为可选功能安装依赖",
} satisfies CommandMetadata;

export const shellHelp = { description: "交互式 shell 控制台" } satisfies CommandMetadata;

export const skillHelp = {
	description: "在 Skillshare 注册表上安装、搜索、发布和管理技能 (skills.omp.sh)",
} satisfies CommandMetadata;

export const sshHelp = { description: "管理 SSH 主机配置" } satisfies CommandMetadata;

export const statsHelp = { description: "查看用量统计" } satisfies CommandMetadata;

export const streamHelp = {
	description: "把本地 omp 会话画面与对话直播到你的公开频道",
} satisfies CommandMetadata;

export const tinyModelsHelp = {
	description: "下载微型本地模型（会话标题、记忆、单词补全）",
} satisfies CommandMetadata;

export const tokenHelp = { description: "获取某提供商的 API 密钥或 OAuth 令牌" } satisfies CommandMetadata;

export const toksHelp = {
	description: "使用每个内置的离线分词器（Google、Gemini、Gemini 等）统计文件或文本",
} satisfies CommandMetadata;

export const ttsrHelp = {
	description: "检查并测试时间旅行流规则(TTSR)",
} satisfies CommandMetadata;

export const updateHelp = { description: "检查并安装更新" } satisfies CommandMetadata;

export const usageHelp = {
	description: "显示每个已认证账户的提供商用量限额",
} satisfies CommandMetadata;

export const worktreeHelp = {
	description: "添加、列出或清除 git 工作树（启用时优先克隆）",
} satisfies CommandMetadata;
