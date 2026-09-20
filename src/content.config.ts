import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// One `docs` collection holds every pillar (Starlight requires this). Pillar-specific
// fields are optional here and exposed per pillar in public/admin/config.yml.
export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema({
			extend: z.object({
				category: z.string().optional(),
				area: z.string().optional(),
				tags: z.array(z.string()).default([]),
				coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
				hours: z.string().optional(),
				entryFee: z.string().optional(),
				bestTime: z.string().optional(),
				// Set to true once an editor has fact-checked the page.
				verified: z.boolean().default(false),
			}),
		}),
	}),
};
