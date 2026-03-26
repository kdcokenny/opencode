import z from "zod"

export const ModelsDevModelSchema = z.object({
	id: z.string(),
	name: z.string(),
	family: z.string().optional(),
	release_date: z.string(),
	last_updated: z.string().optional(),
	knowledge: z.string().optional(),
	attachment: z.boolean(),
	reasoning: z.boolean(),
	temperature: z.boolean(),
	tool_call: z.boolean(),
	structured_output: z.boolean().optional(),
	open_weights: z.boolean().optional(),
	interleaved: z
		.union([
			z.literal(true),
			z
				.object({
					field: z.enum(["reasoning_content", "reasoning_details"]),
				})
				.strict(),
		])
		.optional(),
	cost: z
		.object({
			input: z.number(),
			output: z.number(),
			reasoning: z.number().optional(),
			cache_read: z.number().optional(),
			cache_write: z.number().optional(),
			context_over_200k: z
				.object({
					input: z.number(),
					output: z.number(),
					cache_read: z.number().optional(),
					cache_write: z.number().optional(),
				})
				.optional(),
		})
		.optional(),
	limit: z.object({
		context: z.number(),
		input: z.number().optional(),
		output: z.number(),
	}),
	modalities: z
		.object({
			input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
			output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
		})
		.optional(),
	experimental: z.boolean().optional(),
	status: z.enum(["alpha", "beta", "deprecated"]).optional(),
	options: z.record(z.string(), z.any()).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
	variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
})

export type ModelsDevModel = z.infer<typeof ModelsDevModelSchema>

export const ModelsDevProviderSchema = z.object({
	api: z.string().optional(),
	name: z.string(),
	env: z.array(z.string()),
	id: z.string(),
	npm: z.string().optional(),
	models: z.record(z.string(), ModelsDevModelSchema),
})

export type ModelsDevProvider = z.infer<typeof ModelsDevProviderSchema>
