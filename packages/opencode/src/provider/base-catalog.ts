import { randomUUID } from "crypto"
import { mkdir, rename, unlink } from "fs/promises"
import path from "path"
import {
	type ModelsDevModel,
	type ModelsDevProvider,
	ModelsDevProviderSchema,
} from "./models-schema"
import type { Provider } from "./provider"
import { ProviderTransform } from "./transform"

export const CLIPROXY_BASE_CATALOG_CONTRACT_VERSION = 1 as const
export const OPENCODE_BASE_CATALOG_FILENAME = "opencode-base-catalog.json"

type BaseCatalogModel = {
	source: string
	api: {
		npm: string
		id?: string
	}
	displayName: string
	family?: string
	releaseDate?: string
	lastUpdated?: string
	knowledgeCutoff?: string
	attachment?: boolean
	temperature?: boolean
	toolCall?: boolean
	interleaved?:
		| boolean
		| {
				field: "reasoning_content" | "reasoning_details"
		  }
	structuredOutput?: boolean
	openWeights?: boolean
	status?: "alpha" | "beta" | "deprecated" | "active"
	options?: Record<string, unknown>
	headers?: Record<string, string>
	limits: {
		context: number
		output: number
		input?: number
	}
	reasoning: boolean
	cost?: {
		input: number
		output: number
		reasoning?: number
		cacheRead?: number
		cacheWrite?: number
		contextOver200k?: {
			input: number
			output: number
			cacheRead?: number
			cacheWrite?: number
		}
	}
	capabilities?: {
		modalities?: string[]
		variants?: string[]
	}
}

export type OpencodeCliproxyBaseCatalog = {
	$cliproxyBaseCatalogContractVersion: typeof CLIPROXY_BASE_CATALOG_CONTRACT_VERSION
	models: BaseCatalogModel[]
}

export type OpencodeCliproxyBaseCatalogArtifact = {
	generatedAt?: string
	baseCatalog: OpencodeCliproxyBaseCatalog
}

function compareDeterministicStrings(a: string, b: string) {
	if (a === b) return 0
	return a < b ? -1 : 1
}

function fail(message: string): never {
	throw new Error(`[opencode] base catalog export: ${message}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectRecord(value: unknown, scope: string): Record<string, unknown> {
	if (!isRecord(value)) fail(`${scope}: must be an object`)
	return value
}

function expectNonEmptyString(value: unknown, scope: string): string {
	if (typeof value !== "string") fail(`${scope}: must be a string`)
	const trimmed = value.trim()
	if (trimmed.length === 0) fail(`${scope}: must be a non-empty string`)
	return trimmed
}

function expectNonNegativeInteger(value: unknown, scope: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || value < 0)
		fail(`${scope}: must be a non-negative integer`)
	return value
}

function expectFiniteNonNegative(value: unknown, scope: string): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
		fail(`${scope}: must be a finite non-negative number`)
	return value
}

function collectModalities(model: ModelsDevModel): string[] | undefined {
	const set = new Set<string>()

	for (const entry of model.modalities?.input ?? []) {
		set.add(entry)
	}
	for (const entry of model.modalities?.output ?? []) {
		set.add(entry)
	}

	if (set.size === 0) return undefined
	return [...set].sort(compareDeterministicStrings)
}

function toVariantModel(providerID: string, model: ModelsDevModel, npm: string): Provider.Model {
	return {
		id: model.id,
		providerID,
		api: {
			id: model.id,
			npm,
			url: model.provider?.api ?? "",
		},
		name: model.name,
		family: model.family,
		capabilities: {
			temperature: model.temperature,
			reasoning: model.reasoning,
			attachment: model.attachment,
			toolcall: model.tool_call,
			input: {
				text: model.modalities?.input.includes("text") ?? false,
				audio: model.modalities?.input.includes("audio") ?? false,
				image: model.modalities?.input.includes("image") ?? false,
				video: model.modalities?.input.includes("video") ?? false,
				pdf: model.modalities?.input.includes("pdf") ?? false,
			},
			output: {
				text: model.modalities?.output.includes("text") ?? false,
				audio: model.modalities?.output.includes("audio") ?? false,
				image: model.modalities?.output.includes("image") ?? false,
				video: model.modalities?.output.includes("video") ?? false,
				pdf: model.modalities?.output.includes("pdf") ?? false,
			},
			interleaved: model.interleaved ?? false,
		},
		cost: {
			input: model.cost?.input ?? 0,
			output: model.cost?.output ?? 0,
			cache: {
				read: model.cost?.cache_read ?? 0,
				write: model.cost?.cache_write ?? 0,
			},
			experimentalOver200K: model.cost?.context_over_200k
				? {
						input: model.cost.context_over_200k.input,
						output: model.cost.context_over_200k.output,
						cache: {
							read: model.cost.context_over_200k.cache_read ?? 0,
							write: model.cost.context_over_200k.cache_write ?? 0,
						},
					}
				: undefined,
		},
		limit: {
			context: model.limit.context,
			input: model.limit.input,
			output: model.limit.output,
		},
		status: model.status ?? "active",
		options: model.options ?? {},
		headers: model.headers ?? {},
		release_date: model.release_date,
		variants: {},
	}
}

function collectVariants(
	providerID: string,
	model: ModelsDevModel,
	npm: string,
): string[] | undefined {
	const variants = ProviderTransform.variants(toVariantModel(providerID, model, npm))
	const names = Object.keys(variants)
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
		.sort(compareDeterministicStrings)

	if (names.length === 0) return undefined
	return [...new Set(names)]
}

function resolveApi(provider: ModelsDevProvider, model: ModelsDevModel, scope: string) {
	const npm = (model.provider?.npm ?? provider.npm ?? "@ai-sdk/openai-compatible").trim()
	if (npm.length === 0) fail(`${scope}.api.npm: must be a non-empty string`)

	const apiId = (model.provider?.api ?? provider.api)?.trim()

	return {
		npm,
		...(apiId ? { id: apiId } : {}),
	}
}

function normalizeLimits(model: ModelsDevModel, scope: string) {
	const context = expectNonNegativeInteger(model.limit.context, `${scope}.limit.context`)
	const output = expectNonNegativeInteger(model.limit.output, `${scope}.limit.output`)
	const input =
		model.limit.input === undefined
			? undefined
			: expectNonNegativeInteger(model.limit.input, `${scope}.limit.input`)

	if (input !== undefined && input > context) {
		fail(`${scope}.limit: input must be <= context`)
	}

	return {
		context,
		output,
		...(input === undefined ? {} : { input }),
	}
}

function normalizeCost(model: ModelsDevModel, scope: string): BaseCatalogModel["cost"] {
	if (!model.cost) return undefined

	const input = expectFiniteNonNegative(model.cost.input, `${scope}.cost.input`)
	const output = expectFiniteNonNegative(model.cost.output, `${scope}.cost.output`)
	const cacheRead =
		model.cost.cache_read === undefined
			? undefined
			: expectFiniteNonNegative(model.cost.cache_read, `${scope}.cost.cache_read`)
	const cacheWrite =
		model.cost.cache_write === undefined
			? undefined
			: expectFiniteNonNegative(model.cost.cache_write, `${scope}.cost.cache_write`)
	const contextOver200k =
		model.cost.context_over_200k === undefined
			? undefined
			: {
					input: expectFiniteNonNegative(
						model.cost.context_over_200k.input,
						`${scope}.cost.context_over_200k.input`,
					),
					output: expectFiniteNonNegative(
						model.cost.context_over_200k.output,
						`${scope}.cost.context_over_200k.output`,
					),
					...(model.cost.context_over_200k.cache_read === undefined
						? {}
						: {
								cacheRead: expectFiniteNonNegative(
									model.cost.context_over_200k.cache_read,
									`${scope}.cost.context_over_200k.cache_read`,
								),
							}),
					...(model.cost.context_over_200k.cache_write === undefined
						? {}
						: {
								cacheWrite: expectFiniteNonNegative(
									model.cost.context_over_200k.cache_write,
									`${scope}.cost.context_over_200k.cache_write`,
								),
							}),
				}

	return {
		input,
		output,
		...(model.cost.reasoning === undefined
			? {}
			: {
					reasoning: expectFiniteNonNegative(model.cost.reasoning, `${scope}.cost.reasoning`),
				}),
		...(cacheRead === undefined ? {} : { cacheRead }),
		...(cacheWrite === undefined ? {} : { cacheWrite }),
		...(contextOver200k === undefined ? {} : { contextOver200k }),
	}
}

function parseModelsProviders(payload: unknown): Record<string, ModelsDevProvider> {
	const root = expectRecord(payload, "input")
	const providers: Record<string, ModelsDevProvider> = {}
	const seen = new Set<string>()

	for (const [entryKey, entryValue] of Object.entries(root)) {
		if (!isRecord(entryValue)) continue
		if (!("models" in entryValue || "id" in entryValue || "name" in entryValue)) continue

		const parsed = ModelsDevProviderSchema.safeParse(entryValue)
		if (!parsed.success) {
			const message = parsed.error.issues[0]?.message ?? "invalid provider entry"
			fail(`input.${entryKey}: ${message}`)
		}

		if (seen.has(parsed.data.id)) {
			fail(`duplicate provider id: ${parsed.data.id}`)
		}

		seen.add(parsed.data.id)
		providers[parsed.data.id] = parsed.data
	}

	if (Object.keys(providers).length === 0) {
		fail("input: no valid provider entries found")
	}

	return providers
}

export function buildBaseCatalogArtifactFromModelsPayload(input: {
	providersPayload: unknown
	generatedAt?: string
}): OpencodeCliproxyBaseCatalogArtifact {
	const providers = parseModelsProviders(input.providersPayload)
	const models: BaseCatalogModel[] = []
	const seenSources = new Set<string>()

	for (const providerID of Object.keys(providers).sort(compareDeterministicStrings)) {
		const provider = providers[providerID]

		for (const modelKey of Object.keys(provider.models).sort(compareDeterministicStrings)) {
			const model = provider.models[modelKey]
			const scope = `providers.${providerID}.models.${modelKey}`
			const source = `${provider.id}/${model.id}`
			if (seenSources.has(source)) {
				fail(`duplicate model source: ${source}`)
			}
			seenSources.add(source)

			const api = resolveApi(provider, model, scope)
			const limits = normalizeLimits(model, scope)
			const cost = normalizeCost(model, scope)
			const modalities = collectModalities(model)
			const variants = collectVariants(provider.id, model, api.npm)

			models.push({
				source,
				api,
				displayName: expectNonEmptyString(model.name, `${scope}.name`),
				...(model.family ? { family: expectNonEmptyString(model.family, `${scope}.family`) } : {}),
				...(model.release_date
					? { releaseDate: expectNonEmptyString(model.release_date, `${scope}.release_date`) }
					: {}),
				...(model.last_updated
					? { lastUpdated: expectNonEmptyString(model.last_updated, `${scope}.last_updated`) }
					: {}),
				...(model.knowledge
					? { knowledgeCutoff: expectNonEmptyString(model.knowledge, `${scope}.knowledge`) }
					: {}),
				attachment: model.attachment,
				temperature: model.temperature,
				toolCall: model.tool_call,
				...(model.interleaved === undefined ? {} : { interleaved: model.interleaved }),
				...(model.structured_output === undefined
					? {}
					: { structuredOutput: model.structured_output }),
				...(model.open_weights === undefined ? {} : { openWeights: model.open_weights }),
				...(model.status === undefined ? { status: "active" } : { status: model.status }),
				...(model.options ? { options: model.options } : {}),
				...(model.headers ? { headers: model.headers } : {}),
				reasoning: model.reasoning,
				limits,
				...(cost ? { cost } : {}),
				...(modalities || variants
					? {
							capabilities: {
								...(modalities ? { modalities } : {}),
								...(variants ? { variants } : {}),
							},
						}
					: {}),
			})
		}
	}

	models.sort((a, b) => compareDeterministicStrings(a.source, b.source))

	const generatedAt = input.generatedAt?.trim()
	if (input.generatedAt !== undefined && (!generatedAt || generatedAt.length === 0)) {
		fail("generatedAt: must be a non-empty string when provided")
	}

	return {
		...(generatedAt ? { generatedAt } : {}),
		baseCatalog: {
			$cliproxyBaseCatalogContractVersion: CLIPROXY_BASE_CATALOG_CONTRACT_VERSION,
			models,
		},
	}
}

export function deriveOpencodeBaseCatalogSidecarPath(modelsPath: string) {
	const normalized = expectNonEmptyString(modelsPath, "modelsPath")
	return path.join(path.dirname(normalized), OPENCODE_BASE_CATALOG_FILENAME)
}

export function serializeBaseCatalogArtifact(artifact: OpencodeCliproxyBaseCatalogArtifact) {
	return `${JSON.stringify(artifact, null, "\t")}\n`
}

export async function exportBaseCatalogFromModelsFile(input: {
	modelsPath: string
	outputPath?: string
	generatedAt?: string
}): Promise<{ outputPath: string; modelCount: number }> {
	const modelsPath = expectNonEmptyString(input.modelsPath, "modelsPath")
	const outputPath =
		input.outputPath && input.outputPath.trim().length > 0
			? input.outputPath.trim()
			: deriveOpencodeBaseCatalogSidecarPath(modelsPath)

	const text = await Bun.file(modelsPath)
		.text()
		.catch(() => {
			fail(`failed to read models payload: ${modelsPath}`)
		})

	const payload = (() => {
		try {
			return JSON.parse(text)
		} catch {
			fail(`invalid JSON in models payload: ${modelsPath}`)
		}
	})()

	const artifact = buildBaseCatalogArtifactFromModelsPayload({
		providersPayload: payload,
		generatedAt: input.generatedAt,
	})

	const tempPath = `${outputPath}.${randomUUID()}.tmp`
	await mkdir(path.dirname(outputPath), { recursive: true })

	try {
		await Bun.write(tempPath, serializeBaseCatalogArtifact(artifact))
		await rename(tempPath, outputPath)
	} catch (error) {
		await unlink(tempPath).catch(() => {})
		throw error
	}

	return {
		outputPath,
		modelCount: artifact.baseCatalog.models.length,
	}
}
