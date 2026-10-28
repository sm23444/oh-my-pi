import { Args, type CommandMetadata, Flags } from "@oh-my-pi/pi-utils/cli";
import { APP_NAME } from "@oh-my-pi/pi-utils/dirs";
import { formatKeyHint } from "@oh-my-pi/pi-tui/key-hint-format";
import { CLI_THINKING_LEVELS } from "@oh-my-pi/pi-tui/thinking";
import { SERVICE_TIER_OPENAI_VALUES } from "../config/service-tier";

export const launchHelp = {
	description: "AI 编程助手",
	hidden: true,
	args: {
		messages: Args.string({
			description: "要发送的消息(@ 前缀引用文件)",
			required: false,
			multiple: true,
		}),
	},
	flags: {
		model: Flags.string({
			description: "使用的模型(模糊匹配:\"opus\"、\"gpt-5.2\" 或 \"openai/gpt-5.2\")",
		}),
		smol: Flags.string({ description: "Smol/fast 模型，用于轻量级任务（或 PI_SMOL_MODEL 环境变量）" }),
		slow: Flags.string({ description: "Slow/reasoning 模型，用于深入分析（或 PI_SLOW_MODEL 环境变量）" }),
		plan: Flags.string({ description: "架构规划用的规划模型(或 PI_PLAN_MODEL 环境变量)" }),
		goal: Flags.string({
			description:
				"以目标模式全新启动（仅限交互模式；绕过 autoResume；不使用位置提示、启动计划模式或显式恢复）",
		}),
		prewalk: Flags.boolean({
			description:
				"在计划待办列表存在后的首次 edit/write 时，从活动模型切换到 fast/cheap 模型（默认关闭；请参阅 prewalk.enabled）",
		}),
		"no-prewalk": Flags.boolean({
			description: "禁用 prewalk，包括 prewalk.auto，即使已设置 prewalk.enabled",
		}),
		"prewalk-into": Flags.string({ description: "prewalk 的目标模型(默认 \"smol\" 角色)" }),
		"plan-yolo": Flags.boolean({
			description:
				"启动时强制只读规划模式,模型首次 resolve 调用时自动批准计划,再切换到 --plan-yolo-into 执行",
		}),
		"plan-yolo-into": Flags.string({ description: "plan-yolo 执行的目标模型(默认 \"smol\" 角色)" }),
		provider: Flags.string({ description: "使用的提供商(旧参数;优先用 --model)" }),
		"api-key": Flags.string({ description: "API 密钥(默认取环境变量)" }),
		"system-prompt": Flags.string({ description: "系统提示词(默认:编程助手提示词)" }),
		"system-prompt-template": Flags.string({
			description: "Handlebars 系统提示模板(与 --system-prompt 互斥)",
		}),
		"append-system-prompt": Flags.string({ description: "在系统提示词后追加文本或文件内容" }),
		"allow-home": Flags.boolean({ description: "允许在 ~ 目录启动而不自动切换到临时目录" }),
		profile: Flags.string({ description: "使用独立 profile 隔离认证、会话、设置与缓存" }),
		alias: Flags.string({ description: "为所选 profile 创建 shell 快捷命令后退出" }),
		cwd: Flags.string({ description: "启动目录(覆盖默认工作目录)" }),
		mode: Flags.string({
			description: "输出模式:text(默认)、json、rpc 或 rpc-ui",
			options: ["text", "json", "rpc", "acp", "rpc-ui"],
		}),
		config: Flags.string({
			description: "为本次运行加载额外的 config.yml-style 覆盖配置（可重复）",
			multiple: true,
		}),
		"add-dir": Flags.string({
			description: "额外添加工作区目录(可重复)",
			multiple: true,
		}),
		print: Flags.boolean({ char: "p", description: "非交互模式:处理完提示后退出" }),
		continue: Flags.boolean({ char: "c", description: "继续上一个会话" }),
		resume: Flags.string({ char: "r", description: "恢复会话(按 ID 前缀、路径;省略时弹出选择器)" }),
		restore: Flags.string({
			description:
				"按照 --resume 的方式恢复会话，然后继续其上一个进程未完成的工作（被中断的轮次及当时正在运行的子代理）",
		}),
		"from-claude": Flags.boolean({ description: "将 Claude Code 会话导入 OMP" }),
		"from-codex": Flags.boolean({ description: "将 Codex 会话导入 OMP" }),
		"session-dir": Flags.string({ description: "会话存储与查找目录" }),
		"no-session": Flags.boolean({ description: "不保存会话(临时)" }),
		models: Flags.string({ description: `用于 ${formatKeyHint("ctrl+p")} 循环切换的逗号分隔模型模式` }),
		"no-tools": Flags.boolean({ description: "禁用所有内置工具" }),
		"no-lsp": Flags.boolean({ description: "禁用 LSP 工具、格式化和诊断" }),
		"no-pty": Flags.boolean({ description: "禁用基于 PTY 的交互式 bash 执行" }),
		tools: Flags.string({ description: "要启用的工具列表(逗号分隔,默认全部)" }),
		thinking: Flags.string({
			description: `设置思考级别: ${CLI_THINKING_LEVELS.join(", ")}`,
			options: [...CLI_THINKING_LEVELS],
		}),
		"service-tier": Flags.string({
			description: "本次会话的 OpenAI 服务层级(none 表示省略 service_tier)",
			options: [...SERVICE_TIER_OPENAI_VALUES],
		}),
		"hide-thinking": Flags.boolean({
			description: "在 TUI 输出中隐藏思考块(仅影响显示,不关闭模型思考)",
		}),
		advisor: Flags.boolean({
			description: "启用顾问运行时(被动审查每一轮并注入建议)",
		}),
		"wait-async": Flags.boolean({
			description:
				"打印模式：退出前等待本次运行的后台作业，并用每个结果唤醒会话（async.printWake）；除非设置了 --max-time，否则没有时间限制",
		}),
		"external-thinking": Flags.boolean({
			description:
				"使用私有暂存区，同时禁用受支持的 GPT、Claude 和 Gemini 推理（风险自负：提供商已将此类请求形态标记为滥用）",
		}),
		hook: Flags.string({ description: "加载一个 hook/extension 文件（可多次使用）", multiple: true }),
		extension: Flags.string({
			char: "e",
			description: "加载扩展文件(可多次使用)",
			multiple: true,
		}),
		"no-extensions": Flags.boolean({
			description: "禁用扩展发现（显式 -e 路径仍然有效）",
		}),
		"no-skills": Flags.boolean({ description: "禁用技能发现与加载" }),
		skills: Flags.string({ description: "用于筛选技能的逗号分隔 glob 模式（e.g., git-*,docker）" }),
		"no-rules": Flags.boolean({ description: "禁用规则发现与加载" }),
		"no-context-files": Flags.boolean({ description: "禁用上下文文件（AGENTS.md、CLAUDE.md、...）" }),
		export: Flags.string({ description: "将会话文件导出为 HTML 后退出" }),
		"no-title": Flags.boolean({ description: "禁用标题自动生成" }),
		"no-ui": Flags.boolean({
			description: "使用 --mode rpc 或 rpc-ui：以无界面方式运行扩展（rpc-ui 工具 UI 仍保持启用）",
		}),
		"print-thoughts": Flags.boolean({ description: "在打印模式的文本输出中包含思考块" }),
		"max-time": Flags.string({ description: "在此持续时间后停止会话（e.g，600、10m、1h）" }),
		"warn-cost": Flags.string({
			description: "当会话支出（含子代理）达到这么多 USD 时警告一次",
		}),
		"max-cost": Flags.string({
			description:
				"一旦会话支出达到这么多 USD，就停止向模型发送请求；已在途的请求可在此之后完成（打印模式退出 3）",
		}),
		"auto-approve": Flags.boolean({
			aliases: ["yolo"],
			description: "自动批准所有工具调用(跳过审批提示)",
		}),
		"approval-mode": Flags.string({
			options: ["always-ask", "always-ask-cached", "write", "yolo"],
			description: "为此会话覆盖 tools.approvalMode（always-ask|always-ask-cached|write|yolo）",
		}),
	},
	examples: [
		`# Interactive mode\n  ${APP_NAME}`,
		`# Interactive mode with initial prompt\n  ${APP_NAME} "List all .ts files in src/"`,
		`# Start working on a goal immediately\n  ${APP_NAME} --goal "Investigate the importer"`,
		`# Include files in initial message\n  ${APP_NAME} @prompt.md @image.png "What color is the sky?"`,
		`# Non-interactive mode (process and exit)\n  ${APP_NAME} -p "List all .ts files in src/"`,
		`# Continue previous session\n  ${APP_NAME} --continue "What did we discuss?"`,
		`# Pick a session back up after a crash, subagents included\n  ${APP_NAME} --restore ~/.omp/agent/sessions/--path--/session.jsonl`,
		`# Create a shell shortcut for a work profile\n  ${APP_NAME} --profile work --alias omp-work`,
		`# Use different model (fuzzy matching)\n  ${APP_NAME} --model opus "Help me refactor this code"`,
		`# Limit model cycling to specific models\n  ${APP_NAME} --models claude-sonnet,claude-haiku,gpt-4o`,
		`# Export a session file to HTML\n  ${APP_NAME} --export ~/.omp/agent/sessions/--path--/session.jsonl`,
	],
} satisfies CommandMetadata;
