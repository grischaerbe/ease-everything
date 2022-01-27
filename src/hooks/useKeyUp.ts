import { browser } from '$app/env'
import { onDestroy } from 'svelte'

export const useKeyUp = (key: string, fn: (e: KeyboardEvent) => void) => {
	if (!browser) return

	const proxy = (e: KeyboardEvent) => {
		if (e.key === key) fn(e)
	}

	window.addEventListener('keyup', proxy)

	onDestroy(() => {
		window.removeEventListener('keyup', proxy)
	})
}
