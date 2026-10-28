/**
 * Settings declared by this domain (see `config/registry.ts`). Declaration order is the
 * settings-panel order; `config/all-settings.ts` registers every domain.
 */
import { combine, register } from "../config/registry";
import { BUILTIN_BLOB_DESTINATIONS, type BlobDestinationId, type BlobDestinationMetadata } from "./destinations";

const DEFAULT_IMAGES_URLS_BACKENDS: BlobDestinationId[] = ["provider-files", "tailscale", "cloudflared", "litterbox"];
const EMPTY_IMAGES_URLS_OPTIONS: Partial<Record<BlobDestinationId, Record<string, unknown>>> = {};
const EMPTY_IMAGES_URLS_CREDENTIALS: Partial<Record<BlobDestinationId, Record<string, string>>> = {};

const BUILTIN_BLOB_DESTINATION_METADATA: readonly BlobDestinationMetadata<BlobDestinationId>[] =
	Object.values(BUILTIN_BLOB_DESTINATIONS);

const BLOB_BACKEND_CHOICES = BUILTIN_BLOB_DESTINATION_METADATA.filter(
	destination =>
		destination.id === "provider-files" ||
		(destination.directImage && destination.status !== "incompatible" && destination.status !== "defunct"),
).map(destination => ({
	value: destination.id,
	label: destination.label,
	description: destination.reason ?? destination.family,
}));

export const cfgImagesUrlsEnabled = register({
	id: "images.urls.enabled",
	type: "boolean",
	default: false,
	ui: {
		tab: "model",
		group: "Vision",
		label: "通过网址提供图片",
		description:
			"通过配置的后端链发布发出的图片，并向通过 URL 获取图片的供应商提供短网址，代替内嵌 base64。所有后端均失败或供应商获取失败时，自动回退为内嵌方式",
	},
});

export const cfgImagesUrlsBackends = register({
	id: "images.urls.backends",
	type: "array",
	default: DEFAULT_IMAGES_URLS_BACKENDS,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL 后端",
		description: "发布图片供模型访问时按序尝试的目标",
		options: BLOB_BACKEND_CHOICES,
		ordered: true,
	},
});

export const cfgImagesUrlsOptions = register({
	id: "images.urls.options",
	type: "record",
	default: EMPTY_IMAGES_URLS_OPTIONS,
});

export const cfgImagesUrlsCredentials = register({
	id: "images.urls.credentials",
	type: "record",
	default: EMPTY_IMAGES_URLS_CREDENTIALS,
	credential: true,
});

export const cfgImagesUrlsCommand = register({
	id: "images.urls.command",
	type: "string",
	default: undefined,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片上传命令",
		description:
			"命令后端的 Argv 模板；{file} 是图片路径，{mime}/{ext} 可选。使用 stdout 中打印的最后一个 URL（e.g. pasta -b -f {file}）",
	},
});

export const cfgImagesUrlsPublicBaseUrl = register({
	id: "images.urls.publicBaseUrl",
	type: "string",
	default: undefined,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL 公网基址",
		description: "作为 blob 服务器前端的可外部访问的基础 URL（ssh 必需，直连可选）",
	},
});

export const cfgImagesUrlsTtlHours = register({
	id: "images.urls.ttlHours",
	type: "number",
	default: 72,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL 有效期（小时）",
		description:
			"本地托管图片网址的有效时长，从会话最近一次发送图片时起计算；恢复会话会在原链接上重新开始计时。设为 0 时，只要代理仍在运行，链接就保持有效",
	},
});

export const cfgImagesUrlsBindHost = register({
	id: "images.urls.bindHost",
	type: "string",
	default: "127.0.0.1",
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL 绑定主机",
		description: "blob 服务器绑定主机；隧道用 loopback，直接对外用 0.0.0.0",
	},
});

export const cfgImagesUrlsSshTarget = register({
	id: "images.urls.sshTarget",
	type: "string",
	default: undefined,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL SSH 目标",
		description: "ssh 反向转发目标（user@host）",
	},
});

export const cfgImagesUrlsSshRemotePort = register({
	id: "images.urls.sshRemotePort",
	type: "number",
	default: 8787,
	ui: {
		tab: "model",
		group: "Vision",
		label: "图片 URL SSH 远程端口",
		description: "ssh 反向转发在远端监听、由你的 Web 服务器代理的端口",
	},
});

/** Every `images.urls.*` setting; the live image URL service rebuilds when any changes. */
export const cfgImagesUrls = combine({
	enabled: cfgImagesUrlsEnabled,
	backends: cfgImagesUrlsBackends,
	options: cfgImagesUrlsOptions,
	credentials: cfgImagesUrlsCredentials,
	command: cfgImagesUrlsCommand,
	publicBaseUrl: cfgImagesUrlsPublicBaseUrl,
	ttlHours: cfgImagesUrlsTtlHours,
	bindHost: cfgImagesUrlsBindHost,
	sshTarget: cfgImagesUrlsSshTarget,
	sshRemotePort: cfgImagesUrlsSshRemotePort,
});
