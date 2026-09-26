import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
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
	// "Dhaka Now" listings on the homepage and /whats-on/. One YAML file per event, edited in the CMS.
	// Past events drop off automatically, both at build time and in the browser (see src/components/home/EventList.astro).
	events: defineCollection({
		loader: glob({ pattern: '**/*.{yml,yaml}', base: './src/content/events' }),
		schema: z.object({
			title: z.string(),
			summary: z.string(),
			startDate: z.coerce.date(),
			// Leave out for one-day events.
			endDate: z.coerce.date().optional(),
			category: z.string().optional(),
			venue: z.string().optional(),
			area: z.string().optional(),
			// A related wiki page such as /culture/pohela-boishakh/. Takes priority over `link` as the card's target.
			page: z.string().optional(),
			// Official or organiser source for dates and details.
			link: z.string().url().optional(),
			verified: z.boolean().default(false),
		}),
	}),
};
