import { describe, expect, mock, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"

let bootstrapCalls = 0

mock.module("../../src/cli/bootstrap", () => ({
	bootstrap: async (_directory: string, cb: () => Promise<unknown>) => {
		bootstrapCalls += 1
		return cb()
	},
}))

const { BaseCatalogExportCommand } = await import("../../src/cli/cmd/base-catalog")

describe("base-catalog export command", () => {
	test("exports deterministic base catalog without bootstrapping runtime provider state", async () => {
		bootstrapCalls = 0

		const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-cli-base-catalog-export-"))

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

			await BaseCatalogExportCommand.handler({
				modelsPath,
				output: outputPath,
				generatedAt: "2026-03-25T00:00:00.000Z",
			} as any)

			expect(bootstrapCalls).toBe(0)
			const parsed = JSON.parse(await readFile(outputPath, "utf-8"))
			expect(parsed.baseCatalog.$cliproxyBaseCatalogContractVersion).toBe(1)
			expect(parsed.baseCatalog.models).toHaveLength(1)
			expect(parsed.baseCatalog.models[0].source).toBe("openai/gpt-5")
			expect(parsed.generatedAt).toBe("2026-03-25T00:00:00.000Z")
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})
})
