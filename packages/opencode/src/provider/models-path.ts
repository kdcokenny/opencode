import path from "path"
import { Flag } from "../flag/flag"
import { Global } from "../global"

const fallbackModelsPath = path.join(Global.Path.cache, "models.json")

export function resolveModelsDevPath() {
	return Flag.OPENCODE_MODELS_PATH ?? fallbackModelsPath
}
