import { lazy } from "@/util/lazy"
import { Flag } from "../flag/flag"
import { Installation } from "../installation"
import { Log } from "../util/log"
import { resolveModelsDevPath } from "./models-path"
import {
	type ModelsDevModel,
	ModelsDevModelSchema,
	type ModelsDevProvider,
	ModelsDevProviderSchema,
} from "./models-schema"

// Try to import bundled snapshot (generated at build time)
// Falls back to undefined in dev mode when snapshot doesn't exist

export namespace ModelsDev {
	const log = Log.create({ service: "models.dev" })
	const filepath = resolveModelsDevPath()

	export const Model = ModelsDevModelSchema
	export type Model = ModelsDevModel

	export const Provider = ModelsDevProviderSchema

	export type Provider = ModelsDevProvider

	function url() {
		return Flag.OPENCODE_MODELS_URL || "https://models.dev"
	}

	export const Data = lazy(async () => {
		const file = Bun.file(filepath)
		const result = await file.json().catch(() => {})
		if (result) return result
		// @ts-expect-error
		const snapshot = await import("./models-snapshot")
			.then((m) => m.snapshot as Record<string, unknown>)
			.catch(() => undefined)
		if (snapshot) return snapshot
		if (Flag.OPENCODE_DISABLE_MODELS_FETCH) return {}
		const json = await fetch(`${url()}/api.json`).then((x) => x.text())
		return JSON.parse(json)
	})

	export async function get() {
		const result = await Data()
		return result as Record<string, Provider>
	}

	export async function refresh() {
		const file = Bun.file(filepath)
		const result = await fetch(`${url()}/api.json`, {
			headers: {
				"User-Agent": Installation.USER_AGENT,
			},
			signal: AbortSignal.timeout(10 * 1000),
		}).catch((e) => {
			log.error("Failed to fetch models.dev", {
				error: e,
			})
		})
		if (result && result.ok) {
			await Bun.write(file, await result.text())
			ModelsDev.Data.reset()
		}
	}
}

if (!Flag.OPENCODE_DISABLE_MODELS_FETCH) {
	ModelsDev.refresh()
	setInterval(
		async () => {
			await ModelsDev.refresh()
		},
		60 * 1000 * 60,
	).unref()
}
