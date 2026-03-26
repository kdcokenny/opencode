import { describe, expect, mock, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"

let bootstrapCalls = 0
let pluginConfigApplied = false

mock.module("../../src/cli/bootstrap", () => ({
	bootstrap: async (_directory: string, cb: () => Promise<unknown>) => {
		bootstrapCalls += 1
		pluginConfigApplied = true
		return cb()
	},
}))

mock.module("../../src/provider/provider", () => ({
	Provider: {
		list: async () => {
			const providers: Record<string, { models: Record<string, unknown> }> = {
				openai: {
					models: {
						"gpt-5": {},
					},
				},
			}

			if (pluginConfigApplied) {
				providers["cliproxy-test"] = {
					models: {
						"proxy-model": {},
					},
				}
			}

			return providers
		},
	},
}))

const { ModelsCommand } = await import("../../src/cli/cmd/models")

describe("models command", () => {
	test("includes providers added via plugin config hooks", async () => {
		bootstrapCalls = 0
		pluginConfigApplied = false

		const output: string[] = []
		const originalWrite = process.stdout.write.bind(process.stdout)
		process.stdout.write = ((chunk: string | Uint8Array) => {
			output.push(typeof chunk === "string" ? chunk : chunk.toString())
			return true
		}) as typeof process.stdout.write

		try {
			await ModelsCommand.handler({
				refresh: false,
				verbose: false,
			} as any)
		} finally {
			process.stdout.write = originalWrite as typeof process.stdout.write
		}

		expect(bootstrapCalls).toBe(1)
		expect(output.join("")).toContain("cliproxy-test/proxy-model")
	})

	test("supports deprecated --base-catalog path with low-noise forwarding", async () => {
		bootstrapCalls = 0
		pluginConfigApplied = false

		const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-models-base-catalog-"))

		try {
			const modelsPath = path.join(dir, "models.json")
			const outputPath = path.join(dir, "opencode-base-catalog.json")

			await writeFile(
				modelsPath,
				JSON.stringify({
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
				}),
			)

			await ModelsCommand.handler({
				refresh: false,
				baseCatalog: true,
				baseCatalogModelsPath: modelsPath,
				baseCatalogOutput: outputPath,
				baseCatalogGeneratedAt: "2026-03-25T00:00:00.000Z",
			} as any)

			expect(bootstrapCalls).toBe(0)

			const parsed = JSON.parse(await readFile(outputPath, "utf-8"))
			expect(parsed.generatedAt).toBe("2026-03-25T00:00:00.000Z")
			expect(parsed.baseCatalog.models[0].source).toBe("openai/gpt-5")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
