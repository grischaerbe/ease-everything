import { browser } from '$app/env'
import { onDestroy } from 'svelte'

export const useKeyDown = (key: string, fn: (e: KeyboardEvent) => void) => {
	if (!browser) return

	const proxy = (e: KeyboardEvent) => {
		if (e.key === key) fn(e)
	}

	window.addEventListener('keydown', proxy)

	onDestroy(() => {
		window.removeEventListener('keydown', proxy)
	})
}
