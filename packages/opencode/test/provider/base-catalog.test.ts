import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import {
	buildBaseCatalogArtifactFromModelsPayload,
	exportBaseCatalogFromModelsFile,
	OPENCODE_BASE_CATALOG_FILENAME,
} from "../../src/provider/base-catalog"

describe("provider base catalog export", () => {
	test("builds deterministic cliproxy artifact from provider payload", () => {
		const artifact = buildBaseCatalogArtifactFromModelsPayload({
			generatedAt: "2026-03-25T00:00:00.000Z",
			providersPayload: {
				meta: {
					note: "ignored",
				},
				custom: {
					id: "custom",
					name: "Custom",
					env: [],
					api: "https://proxy.example/v1",
					models: {
						"model-a": {
							id: "model-a",
							name: "Model A",
							release_date: "2026-01-01",
							attachment: false,
							reasoning: false,
							temperature: true,
							tool_call: true,
							limit: { context: 16384, output: 2048 },
							options: {},
						},
					},
				},
				anthropic: {
					id: "anthropic",
					name: "Anthropic",
					env: [],
					npm: "@ai-sdk/anthropic",
					models: {
						"claude-sonnet-4-5": {
							id: "claude-sonnet-4-5",
							name: "Claude Sonnet 4.5",
							family: "claude",
							release_date: "2026-01-01",
							last_updated: "2026-01-02",
							knowledge: "2025-12-31",
							attachment: true,
							reasoning: true,
							temperature: true,
							tool_call: true,
							structured_output: true,
							open_weights: false,
							limit: { context: 200000, output: 64000 },
							options: { defaultReasoningEffort: "high" },
							headers: { "x-model-header": "1" },
							modalities: {
								input: ["image", "text"],
								output: ["text"],
							},
							cost: {
								input: 3,
								output: 15,
								reasoning: 1.5,
								cache_read: 0.3,
								cache_write: 3.75,
								context_over_200k: {
									input: 4,
									output: 16,
									cache_read: 0.4,
								},
							},
						},
					},
				},
			},
		})

		expect(artifact.generatedAt).toBe("2026-03-25T00:00:00.000Z")
		expect(artifact.baseCatalog.$cliproxyBaseCatalogContractVersion).toBe(1)
		expect(artifact.baseCatalog.models.map((entry) => entry.source)).toEqual([
			"anthropic/claude-sonnet-4-5",
			"custom/model-a",
		])

		const anthropicModel = artifact.baseCatalog.models[0]
		expect(anthropicModel.family).toBe("claude")
		expect(anthropicModel.releaseDate).toBe("2026-01-01")
		expect(anthropicModel.lastUpdated).toBe("2026-01-02")
		expect(anthropicModel.knowledgeCutoff).toBe("2025-12-31")
		expect(anthropicModel.attachment).toBe(true)
		expect(anthropicModel.temperature).toBe(true)
		expect(anthropicModel.toolCall).toBe(true)
		expect(anthropicModel.structuredOutput).toBe(true)
		expect(anthropicModel.openWeights).toBe(false)
		expect(anthropicModel.status).toBe("active")
		expect(anthropicModel.options).toEqual({ defaultReasoningEffort: "high" })
		expect(anthropicModel.headers).toEqual({ "x-model-header": "1" })
		expect(anthropicModel.cost).toEqual({
			input: 3,
			output: 15,
			reasoning: 1.5,
			cacheRead: 0.3,
			cacheWrite: 3.75,
			contextOver200k: {
				input: 4,
				output: 16,
				cacheRead: 0.4,
			},
		})
		expect(anthropicModel.capabilities).toEqual({
			modalities: ["image", "text"],
			variants: ["high", "max"],
		})

		const customModel = artifact.baseCatalog.models[1]
		expect(customModel.api).toEqual({
			npm: "@ai-sdk/openai-compatible",
			id: "https://proxy.example/v1",
		})
	})

	test("writes sidecar output beside models path by default", async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-base-catalog-"))

		try {
			const modelsPath = path.join(dir, "models.json")
			await writeFile(
				modelsPath,
				JSON.stringify(
					{
						openai: {
							id: "openai",
							name: "OpenAI",
							env: [],
							npm: "@ai-sdk/openai",
							models: {
								"gpt-5": {
									id: "gpt-5",
									name: "GPT-5",
									release_date: "2026-01-01",
									attachment: true,
									reasoning: true,
									temperature: true,
									tool_call: true,
									limit: { context: 400000, output: 128000 },
									options: {},
								},
							},
						},
					},
					null,
					"\t",
				),
			)

			const result = await exportBaseCatalogFromModelsFile({
				modelsPath,
			})

			expect(result.outputPath).toBe(path.join(dir, OPENCODE_BASE_CATALOG_FILENAME))
			expect(result.modelCount).toBe(1)

			const parsed = JSON.parse(await readFile(result.outputPath, "utf-8"))
			expect(parsed.generatedAt).toBeUndefined()
			expect(parsed.baseCatalog.$cliproxyBaseCatalogContractVersion).toBe(1)
			expect(parsed.baseCatalog.models[0].source).toBe("openai/gpt-5")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test("fails loudly when models payload has no provider entries", () => {
		expect(() =>
			buildBaseCatalogArtifactFromModelsPayload({
				providersPayload: {
					meta: {
						note: "only metadata",
					},
				},
			}),
		).toThrow("[opencode] base catalog export: input: no valid provider entries found")
	})
})
