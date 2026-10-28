/**
 * `omp browser-relay` implementation: serve the local CDP relay and install
 * its Chrome extension. Standalone CLI command — console output here is
 * intentional user-facing output.
 */
import * as path from "node:path";
import { VERSION } from "@oh-my-pi/pi-utils/dirs";
import { probeRelayServer } from "../tools/browser/relay/daemon";
import { defaultRelayExtensionDir, writeRelayExtension } from "../tools/browser/relay/extension-files";
import { DEFAULT_RELAY_URL } from "../tools/browser/relay/kind";
import { type RelayServer, startRelayServer } from "../tools/browser/relay/server";

export const BROWSER_RELAY_ACTIONS = ["serve", "install"] as const;
export type BrowserRelayAction = (typeof BROWSER_RELAY_ACTIONS)[number];

export interface BrowserRelayCommandArgs {
	action: BrowserRelayAction;
	port: number;
	token?: string;
	/** Install target directory; defaults to ~/.omp/browser-relay/extension. */
	dir?: string;
	/** Gather tabs the agent actively drives into an 'omp' Chrome tab group (default true). */
	group?: boolean;
	verbose?: boolean;
}

/** Default port of the relay endpoint (kept in sync with DEFAULT_RELAY_URL). */
export const DEFAULT_RELAY_PORT = Number(new URL(DEFAULT_RELAY_URL).port);

export async function runBrowserRelayCommand(args: BrowserRelayCommandArgs): Promise<void> {
	if (args.action === "install") {
		await runInstall(args.dir);
		return;
	}
	await runServe(args);
}

async function runInstall(dirOverride: string | undefined): Promise<void> {
	const dir = dirOverride ? path.resolve(dirOverride) : defaultRelayExtensionDir();
	await writeRelayExtension(dir, VERSION);
	console.log(`已将 OMP Browser Relay 扩展安装到 ${dir}`);
	console.log("");
	console.log("在 Chrome 浏览器中完成设置：");
	console.log("  1. 打开 chrome://extensions 并启用开发者模式。");
	console.log(`  2. 点击“加载已解压的扩展程序”并选择：${dir}`);
	console.log("  3. 启用该模式：  omp config set browser.relay true");
	console.log("");
	console.log("omp 会在浏览器前置脚本需要时自动启动中继；");
	console.log("仅在需要 --token 或 --no-group 时才需自行运行 `omp browser-relay`。");
	console.log("一旦连接到中继，扩展程序徽章就会显示 'on'。");
	if (!dirOverride) console.log("较新版本的 omp 会更新此文件夹中的扩展程序并自行重新加载。");
	console.log(
		"chrome://extensions > Errors 中的旧 connection-refused 条目在重新连接后可能仍然存在；请使用 Clear all。",
	);
}

async function runServe(args: BrowserRelayCommandArgs): Promise<void> {
	const log = args.verbose
		? (message: string, data?: Record<string, unknown>) => {
				console.error(`[中继] ${message}${data ? ` ${JSON.stringify(data)}` : ""}`);
			}
		: undefined;
	let relay: RelayServer;
	try {
		relay = startRelayServer({ port: args.port, token: args.token, group: args.group !== false, log });
	} catch (err) {
		// The port is machine-global while relays can be started by any project's
		// broker (or by hand): losing the bind to a live relay is success.
		if (err instanceof Error && "code" in err && err.code === "EADDRINUSE") {
			if (await probeRelayServer(`http://127.0.0.1:${args.port}`)) {
				console.log(`omp 浏览器中继已在 http://127.0.0.1:${args.port} 上运行；无需执行任何操作。`);
				return;
			}
			console.error(`端口 ${args.port} 已被非 omp 浏览器中继程序占用。`);
			process.exit(1);
		}
		throw err;
	}

	console.log(`omp 浏览器中继正在监听 http://127.0.0.1:${args.port}`);
	console.log(`  扩展端点  ws://127.0.0.1:${args.port}/ext${args.token ? "?token=***" : ""}`);
	if (args.port === DEFAULT_RELAY_PORT) {
		console.log("  启用方式         omp config set browser.relay true");
	} else {
		console.log(
			`  使用以下命令启用         omp config set browser.relay true && omp config set browser.relayUrl http://127.0.0.1:${args.port}`,
		);
	}
	console.log("正在等待 OMP 浏览器中继扩展连接（omp browser-relay install）……");

	let announced = false;
	const readiness = setInterval(() => {
		if (relay.bridge.ready && !announced) {
			announced = true;
			console.log("扩展已连接。现在可以使用 omp 浏览器前置程序控制您的标签页。");
		} else if (!relay.bridge.ready && announced) {
			announced = false;
			console.log("扩展已断开连接；正在等待其重新连接……");
		}
	}, 500);

	const shutdown = () => {
		clearInterval(readiness);
		relay.stop();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	// Serve runs until SIGINT/SIGTERM; keep the process alive.
	await new Promise<never>(() => {});
}
