import { EOL } from "os"
import type { Argv } from "yargs"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { cmd } from "./cmd"

export const ModelsCommand = cmd({
	command: "models [provider]",
	describe: "list all available models",
	builder: (yargs: Argv) => {
		return yargs
			.positional("provider", {
				describe: "provider ID to filter models by",
				type: "string",
				array: false,
			})
			.option("verbose", {
				describe: "use more verbose model output (includes metadata like costs)",
				type: "boolean",
			})
			.option("refresh", {
				describe: "refresh the models cache from models.dev",
				type: "boolean",
			})
			.option("base-catalog", {
				describe: "deprecated: use `opencode base-catalog export`",
				type: "boolean",
				hidden: true,
			})
			.option("base-catalog-output", {
				describe: "deprecated output override for base-catalog export",
				type: "string",
				hidden: true,
			})
			.option("base-catalog-generated-at", {
				describe: "deprecated generatedAt override for base-catalog export",
				type: "string",
				hidden: true,
			})
			.option("base-catalog-models-path", {
				describe: "deprecated models input path for base-catalog export",
				type: "string",
				hidden: true,
			})
	},
	handler: async (args) => {
		if (args.refresh) {
			const { ModelsDev } = await import("../../provider/models")
			await ModelsDev.refresh()
			UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
		}

		if (args.baseCatalog) {
			UI.println(
				UI.Style.TEXT_WARNING +
					"`opencode models --base-catalog` is deprecated. Use `opencode base-catalog export` instead." +
					UI.Style.TEXT_NORMAL,
			)

			const { BaseCatalogExportCommand } = await import("./base-catalog")
			await BaseCatalogExportCommand.handler({
				modelsPath: args.baseCatalogModelsPath,
				output: args.baseCatalogOutput,
				generatedAt: args.baseCatalogGeneratedAt,
			} as any)
			return
		}

		await bootstrap(process.cwd(), async () => {
			const { Provider } = await import("../../provider/provider")
			const providers = await Provider.list()

			function printModels(providerID: string, verbose?: boolean) {
				const provider = providers[providerID]
				const sortedModels = Object.entries(provider.models).sort(([a], [b]) => a.localeCompare(b))
				for (const [modelID, model] of sortedModels) {
					process.stdout.write(`${providerID}/${modelID}`)
					process.stdout.write(EOL)
					if (verbose) {
						process.stdout.write(JSON.stringify(model, null, 2))
						process.stdout.write(EOL)
					}
				}
			}

			if (args.provider) {
				const provider = providers[args.provider]
				if (!provider) {
					UI.error(`Provider not found: ${args.provider}`)
					return
				}

				printModels(args.provider, args.verbose)
				return
			}

			const providerIDs = Object.keys(providers).sort((a, b) => {
				const aIsOpencode = a.startsWith("opencode")
				const bIsOpencode = b.startsWith("opencode")
				if (aIsOpencode && !bIsOpencode) return -1
				if (!aIsOpencode && bIsOpencode) return 1
				return a.localeCompare(b)
			})

			for (const providerID of providerIDs) {
				printModels(providerID, args.verbose)
			}
		})
	},
})
