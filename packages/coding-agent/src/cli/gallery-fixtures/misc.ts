/** Gallery fixtures for the ask, ssh, and github tools. */
import type { GalleryFixture } from "./types";

export const miscFixtures: Record<string, GalleryFixture> = {
	ask: {
		label: "询问",
		streamingArgs: {
			questions: [
				{
					id: "db",
					question: "Which database should the new service use?",
					options: [{ label: "Postgres" }],
				},
			],
		},
		args: {
			questions: [
				{
					id: "db",
					question: "Which database should the new service use?",
					options: [
						{ label: "Postgres", description: "关系型、强一致性、支持 JSONB" },
						{ label: "SQLite", description: "嵌入式、零运维，适合单节点" },
						{ label: "MongoDB", description: "文档存储，架构灵活" },
					],
					recommended: 0,
				},
				{
					id: "features",
					question: "Which auth flows should ship in v1?",
					options: [
						{ label: "电子邮件 + 密码" },
						{ label: "OAuth（谷歌、GitHub）" },
						{ label: "魔法链接" },
						{ label: "SAML SSO", description: "企业版功能；可以延后处理" },
					],
					multi: true,
				},
			],
		},
		result: {
			content: [
				{
					type: "text",
					text: "db: Postgres\nfeatures: Email + password, OAuth (Google, GitHub)",
				},
			],
			details: {
				results: [
					{
						id: "db",
						question: "Which database should the new service use?",
						options: ["Postgres", "SQLite", "MongoDB"],
						multi: false,
						selectedOptions: ["Postgres"],
					},
					{
						id: "features",
						question: "Which auth flows should ship in v1?",
						options: ["Email + password", "OAuth (Google, GitHub)", "Magic links", "SAML SSO"],
						multi: true,
						selectedOptions: ["Email + password", "OAuth (Google, GitHub)"],
					},
				],
			},
		},
		errorResult: {
			content: [{ type: "text", text: "Prompt cancelled by user before any answer was given" }],
			isError: true,
		},
	},

	github: {
		label: "GitHub",
		streamingArgs: {
			op: "search_prs",
			query: "is:open author:@me",
		},
		args: {
			op: "search_prs",
			query: "is:open review-requested:@me sort:updated",
			repo: "oh-my-pi/pi",
		},
		result: {
			content: [
				{
					type: "text",
					text: [
						"#1842  feat(tui): virtualized scrollback for tool output     openyou · 2h ago   +312 -47",
						"#1839  fix(agent): retry stream on transient 529             dvir   · 5h ago   +18 -4",
						"#1830  refactor(edit): unify hashline + ast_edit previews    mira   · 1d ago   +540 -210",
						"#1817  docs: document gallery fixtures contract             leo    · 2d ago   +96 -0",
						"",
						"4 open pull requests requesting your review",
					].join("\n"),
				},
			],
		},
		errorResult: {
			content: [
				{
					type: "text",
					text: "gh: Could not resolve to a Repository with the name 'oh-my-pi/pi'. (HTTP 404)",
				},
			],
			isError: true,
		},
	},

	// Built-in tool with no dedicated renderer — exercises the generic fallback
	// (`#formatToolExecution`) path so its padded, state-tinted block is QA'd.
	report_tool_issue: {
		label: "报告工具问题",
		streamingArgs: { tool: "lsp" },
		args: {
			tool: "lsp",
			report: "Rename returned no edit for an exported symbol that has 12 references",
		},
		result: { content: [{ type: "text", text: "Noted, thanks!" }] },
		errorResult: {
			content: [{ type: "text", text: "Could not record the report: issue tracker unreachable" }],
			isError: true,
		},
	},

	// Stand-in for a custom/extension tool that ships no renderer — same generic
	// fallback path most MCP/extension tools take.
	custom: {
		label: "自定义工具",
		streamingArgs: { query: "weather" },
		args: { query: "weather in Tokyo", units: "metric" },
		result: { content: [{ type: "text", text: "Tokyo: 22°C, partly cloudy, humidity 64%." }] },
		errorResult: {
			content: [{ type: "text", text: "Upstream provider returned 503 Service Unavailable" }],
			isError: true,
		},
	},
};
