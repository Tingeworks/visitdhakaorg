// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Visit Dhaka',
			// English is the root locale (no URL prefix). Bangla pages live in src/content/docs/bn/ and are served at /bn/.
			// Pages without a Bangla version fall back to English with a notice. Interface text is in src/content/i18n/.
			defaultLocale: 'root',
			locales: {
				root: { label: 'English', lang: 'en' },
				bn: { label: 'বাংলা', lang: 'bn' },
			},
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
			// Grouped by visitor intent. Each folder in src/content/docs is one content pillar. Bangla labels go in `translations`
			// and should match the section.* and nav.* strings in src/content/i18n/bn.json.
			sidebar: [
				{
					label: 'Explore',
					translations: { bn: 'ঘুরে দেখুন' },
					items: [
						{ label: 'Overview', translations: { bn: 'পরিচিতি' }, slug: 'overview' },
						{ label: "What's On", translations: { bn: 'কী হচ্ছে' }, link: '/whats-on/' },
						{ label: 'Areas & Neighborhoods', translations: { bn: 'এলাকা ও পাড়া' }, collapsed: true, items: [{ autogenerate: { directory: 'areas' } }] },
						{ label: 'Attractions & Landmarks', translations: { bn: 'দর্শনীয় স্থান ও স্থাপনা' }, collapsed: true, items: [{ autogenerate: { directory: 'attractions' } }] },
						{ label: 'Culture & Festivals', translations: { bn: 'সংস্কৃতি ও উৎসব' }, collapsed: true, items: [{ autogenerate: { directory: 'culture' } }] },
						{ label: 'Shopping', translations: { bn: 'কেনাকাটা' }, collapsed: true, items: [{ autogenerate: { directory: 'shopping' } }] },
						{ label: 'Day Trips', translations: { bn: 'একদিনের ভ্রমণ' }, collapsed: true, items: [{ autogenerate: { directory: 'day-trips' } }] },
					],
				},
				{
					label: 'Eat',
					translations: { bn: 'খাওয়াদাওয়া' },
					items: [{ label: 'Food & Dining', translations: { bn: 'খাবার ও রেস্তোরাঁ' }, collapsed: true, items: [{ autogenerate: { directory: 'food' } }] }],
				},
				{
					label: 'Stay',
					translations: { bn: 'থাকা' },
					items: [{ label: 'Where to Stay', translations: { bn: 'কোথায় থাকবেন' }, slug: 'where-to-stay' }],
				},
				{
					label: 'Get Around',
					translations: { bn: 'যাতায়াত' },
					items: [{ label: 'Getting Around', translations: { bn: 'যাতায়াত' }, collapsed: true, items: [{ autogenerate: { directory: 'getting-around' } }] }],
				},
				{
					label: 'Plan Your Trip',
					translations: { bn: 'ভ্রমণ পরিকল্পনা' },
					items: [{ label: 'Practical Info', translations: { bn: 'প্রয়োজনীয় তথ্য' }, collapsed: true, items: [{ autogenerate: { directory: 'practical-info' } }] }],
				},
			],
		}),
	],
});
