import adapter from '@sveltejs/adapter-static'
import preprocess from 'svelte-preprocess'
import { optimizeImports, optimizeCss } from 'carbon-preprocess-svelte'

import { resolve } from 'path'

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [
		preprocess({
			postcss: true
		}),
		optimizeImports()
	],

	kit: {
		adapter: adapter(),

		// hydrate the <div id="svelte"> element in src/app.html
		target: '#svelte',

		vite: {
			plugins: [process.env.NODE_ENV === 'production' && optimizeCss()],
			resolve: {
				alias: {
					$components: resolve('src/components/'),
					$hooks: resolve('src/hooks/'),
					$store: resolve('src/store/')
				}
			}
		}
	}
}

export default config
