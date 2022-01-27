import { onDestroy } from 'svelte'

export const useWheel = (callback: (e: WheelEvent) => void) => {
	let node: HTMLElement | undefined = undefined

	const mouseWheelAction = (n: HTMLElement) => {
		node = n
		node.addEventListener('wheel', callback)
	}

	onDestroy(() => {
		if (!node) return
		node.removeEventListener('wheel', callback)
	})

	return {
		mouseWheelAction
	}
}
