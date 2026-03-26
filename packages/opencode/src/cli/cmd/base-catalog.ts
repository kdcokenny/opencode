import type { Argv } from "yargs"
import { resolveModelsDevPath } from "../../provider/models-path"
import { UI } from "../ui"
import { cmd } from "./cmd"

function resolveModelsPath(input?: string) {
	if (input && input.trim().length > 0) {
		return input.trim()
	}

	return resolveModelsDevPath()
}

function resolveOutputPath(input?: string) {
	if (input && input.trim().length > 0) {
		return input.trim()
	}

	if (process.env.OPENCODE_BASE_CATALOG_PATH?.trim()) {
		return process.env.OPENCODE_BASE_CATALOG_PATH.trim()
	}

	return undefined
}

export const BaseCatalogExportCommand = cmd({
	command: "export",
	describe: "export deterministic cliproxy base catalog artifact",
	builder: (yargs: Argv) => {
		return yargs
			.option("models-path", {
				describe: "path to deterministic providers/models JSON input",
				type: "string",
			})
			.option("output", {
				describe: "output path for base catalog artifact",
				type: "string",
			})
			.option("generated-at", {
				describe: "optional generatedAt string to embed in artifact",
				type: "string",
			})
	},
	handler: async (args) => {
		const { exportBaseCatalogFromModelsFile } = await import("../../provider/base-catalog")
		const result = await exportBaseCatalogFromModelsFile({
			modelsPath: resolveModelsPath(args.modelsPath),
			outputPath: resolveOutputPath(args.output),
			generatedAt: args.generatedAt,
		})

		UI.println(
			UI.Style.TEXT_SUCCESS_BOLD +
				`Base catalog exported: ${result.outputPath} (${result.modelCount} models)` +
				UI.Style.TEXT_NORMAL,
		)
	},
})

export const BaseCatalogCommand = cmd({
	command: "base-catalog",
	describe: "manage deterministic base catalog artifacts",
	builder: (yargs: Argv) => yargs.command(BaseCatalogExportCommand).demandCommand(),
	async handler() {},
})
