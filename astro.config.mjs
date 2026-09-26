// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Visit Dhaka',
			// Pre-launch: keep the site out of search engines. Remove this and public/robots.txt to go live.
			head: [
				{ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' } },
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
				{ tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' } },
				{
					tag: 'link',
					attrs: {
						rel: 'stylesheet',
						href: 'https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap',
					},
				},
			],
			// "Edit page" link on every docs page: readers propose changes as GitHub pull requests.
			editLink: { baseUrl: 'https://github.com/Tingeworks/visitdhakaorg/edit/main/' },
			customCss: ['./src/styles/custom.css'],
			components: {
				Header: './src/components/Header.astro',
				PageFrame: './src/components/PageFrame.astro',
			},
			// Grouped by visitor intent. Each folder in src/content/docs is one content pillar.
			sidebar: [
				{
					label: 'Explore',
					items: [
						{ label: 'Overview', slug: 'overview' },
						{ label: "What's On", link: '/whats-on/' },
						{ label: 'Areas & Neighborhoods', collapsed: true, items: [{ autogenerate: { directory: 'areas' } }] },
						{ label: 'Attractions & Landmarks', collapsed: true, items: [{ autogenerate: { directory: 'attractions' } }] },
						{ label: 'Culture & Festivals', collapsed: true, items: [{ autogenerate: { directory: 'culture' } }] },
						{ label: 'Shopping', collapsed: true, items: [{ autogenerate: { directory: 'shopping' } }] },
						{ label: 'Day Trips', collapsed: true, items: [{ autogenerate: { directory: 'day-trips' } }] },
					],
				},
				{
					label: 'Eat',
					items: [{ label: 'Food & Dining', collapsed: true, items: [{ autogenerate: { directory: 'food' } }] }],
				},
				{
					label: 'Stay',
					items: [{ label: 'Where to Stay', slug: 'where-to-stay' }],
				},
				{
					label: 'Get Around',
					items: [{ label: 'Getting Around', collapsed: true, items: [{ autogenerate: { directory: 'getting-around' } }] }],
				},
				{
					label: 'Plan Your Trip',
					items: [{ label: 'Practical Info', collapsed: true, items: [{ autogenerate: { directory: 'practical-info' } }] }],
				},
			],
		}),
	],
});
