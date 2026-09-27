// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	// Google Sans, downloaded from Google Fonts at build time and served from this site, so visitors' browsers never
	// contact Google for it. Weights 400 to 700 and optical sizes 17 to 18, in normal and italic. It has no Bengali, so Bangla
	// text falls back to Noto Sans Bengali where the reader has it installed. Used in src/styles/custom.css through
	// --font-google-sans, and added to every page's <head> by src/components/Head.astro.
	fonts: [
		{
			provider: fontProviders.google(),
			name: 'Google Sans',
			cssVariable: '--font-google-sans',
			weights: ['400 700'],
			styles: ['normal', 'italic'],
			// Accented Latin letters (latin-ext) are a separate file, downloaded only by pages that use them.
			subsets: ['latin', 'latin-ext'],
			fallbacks: ['Noto Sans Bengali', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
			options: { experimental: { variableAxis: { opsz: [['17', '18']] } } },
		},
	],
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
			],
			// "Edit page" link on every docs page: readers propose changes as GitHub pull requests.
			editLink: { baseUrl: 'https://github.com/Tingeworks/visitdhakaorg/edit/main/' },
			// Navbar logo, in place of the site title text: public/favicon-long.svg with its viewBox cropped to the artwork, so
			// there is no empty margin around it. It's a separate copy, so recreate it whenever favicon-long.svg changes.
			// The title is still in the link for screen readers, so the image has empty alt.
			logo: { src: './src/assets/logo.svg', alt: '', replacesTitle: true },
			// No "On this page" column on any page, so the content gets the full width.
			tableOfContents: false,
			customCss: ['./src/styles/custom.css'],
			components: {
				// Loads Google Tag Manager once the visitor has agreed to analytics cookies.
				Head: './src/components/Head.astro',
				Header: './src/components/Header.astro',
				// Adds the fluted glass effect to the homepage hero photo.
				Hero: './src/components/Hero.astro',
				PageFrame: './src/components/PageFrame.astro',
				// Light by default, with no "auto" mode. Dark mode is switched on only from the accessibility menu.
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
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
