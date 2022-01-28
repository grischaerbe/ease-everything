<script context="module" lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { useKeyDown } from '$hooks/useKeyDown'
	import { useKeyUp } from '$hooks/useKeyUp'
	import { useRaf } from '$hooks/useRaf'
	import { useWheel } from '$hooks/useWheel'
	import {
		addSelectedItem,
		clearSelectedItems,
		deleteSelectedItems,
		drawGridLines,
		drawSelection,
		freezeSelectedItems,
		functionFromPath,
		hitTestPath,
		insertPointToPath,
		map,
		maybeAddSelectedItem,
		maybeModifySelectedItemsOnClick,
		mouseEventIsClick,
		resetGrid,
		setCursor,
		transformSelectedItems
	} from '$lib/editorUtils'
	import type { EditorState, SelectedItem } from '$lib/types'
	import ClipboardJS from 'clipboard'
	import * as paper from 'paper'
	import { onMount } from 'svelte'
</script>

<script lang="ts">
	let canvas: HTMLCanvasElement | undefined
	let copyBtn: HTMLButtonElement | undefined

	const state: EditorState = {
		view: {
			size: 400,
			isAnimating: false
		},
		path: undefined,
		previousPathJson: '',
		mouse: {
			isMouseDown: false,
			lastMouseDownEvent: undefined,
			cursor: 'cursor-crosshair'
		},
		mounted: false,
		fnHasError: false,
		selectedItems: [],
		tolerance: 20,
		layers: {
			default: undefined,
			grid4: undefined,
			grid16: undefined,
			selectionLayer: undefined
		}
	}
	const getState = () => state
	const stateUpdated = (reason?: string) => {
		if (reason) console.log(reason)
		state.path = state.path
	}

	let fnstart = 'function interpolate(t) {\n'
	let fnBody = '  return t'
	let fnEnd = '\n}'

	let fn = new Function('t', fnBody)

	let resultCircle: paper.Shape.Circle | undefined
	let selectedCircle: paper.Shape.Circle | undefined
	let selectionToolCircle: paper.Shape.Circle | undefined

	const setViewSize = () => {
		paper.view.viewSize.width = state.view.size
		paper.view.viewSize.height = state.view.size
	}

	const installEventListeners = () => {
		paper.view.onMouseDown = onMouseDown
		paper.view.onMouseUp = onMouseUp
		paper.view.onMouseMove = onMouseMove
	}

	const drawUtils = () => {
		resultCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
		resultCircle.fillColor = new paper.Color('rgb(239 68 68)')
		resultCircle.visible = false

		selectionToolCircle = new paper.Shape.Circle(new paper.Point(0, 0), state.tolerance)
		selectionToolCircle.visible = false
		selectionToolCircle.fillColor = new paper.Color('rgba(19, 147, 224, 0.1)')

		selectedCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
		selectedCircle.visible = false
		selectedCircle.fillColor = new paper.Color('rgb(209, 213, 219, 0.6)')
	}

	onMount(() => {
		if (!canvas || !copyBtn) return
		paper.setup(canvas)

		const p = new paper.Path()
		getState().path = p
		const json = $page.url.searchParams.get('path')
		if (json) {
			p.importJSON(json)
		} else {
			p.moveTo(new paper.Point(0, 0))
			p.lineTo(new paper.Point([state.view.size, state.view.size]))
		}

		p.fullySelected = true
		paper.view.scale(1, -1)

		state.layers.default = paper.project.activeLayer
		state.layers.selectionLayer = new paper.Layer()
		state.layers.grid4 = new paper.Layer()
		state.layers.grid16 = new paper.Layer()
		state.layers.grid16.visible = false
		state.layers.default.activate()

		drawUtils()

		setViewSize()

		installEventListeners()

		state.layers.grid4.activate()
		drawGridLines(4, 4, paper.view.bounds)
		state.layers.grid16.activate()
		drawGridLines(16, 16, paper.view.bounds)
		state.layers.default.activate()

		new ClipboardJS(copyBtn)
		state.mounted = true
		stateUpdated('mounted')
	})

	const onClick = (e: paper.MouseEvent) => {
		const modifiedSelectedItems = maybeModifySelectedItemsOnClick(e, state)

		if (!modifiedSelectedItems) {
			maybeAddSelectedItem(e, state)
		}

		drawSelection(state)
		stateUpdated('click')
	}

	const onMouseDown = (e: paper.MouseEvent) => {
		getState().mouse.isMouseDown = true
		getState().mouse.lastMouseDownEvent = e
		if (!state.path) return
		maybeAddSelectedItem(e, state)

		// if nothing is selected, the user probably wants to add a new segment
		if (!state.selectedItems.length) {
			const newSegment = insertPointToPath(state.path, e.point)
			const selectedItem: SelectedItem = {
				item: 'segment',
				segment: newSegment
			}
			addSelectedItem(selectedItem, state)
		}

		drawSelection(state)

		freezeSelectedItems(state)

		stateUpdated('mousedown')
	}

	const onMouseUp = (e: paper.MouseEvent) => {
		resetGrid(state)

		getState().mouse.isMouseDown = false

		if (e.modifiers.shift && state.mouse.cursor !== 'cursor-copy') {
			setCursor('cursor-copy', state)
			stateUpdated('cursor')
		} else if (!e.modifiers.shift && state.mouse.cursor !== 'cursor-crosshair') {
			setCursor('cursor-crosshair', state)
			stateUpdated('cursor')
		}

		const isClick = mouseEventIsClick(e, state)
		if (isClick) {
			e.type = 'click'
			onClick(e)
			return
		}

		stateUpdated('mouseup')
	}

	const calculateFunction = () => {
		if (state.path) {
			const pathJson = state.path.exportJSON()
			if (pathJson === state.previousPathJson) {
				console.log('path did not change, returning')
				return
			}

			const scaledPath = state.path.clone()
			scaledPath.scale(1 / state.view.size, new paper.Point(0, 0))
			try {
				const { fn: newFn, fnBody: newFnBody } = functionFromPath(scaledPath)
				fn = newFn
				fnBody = newFnBody
				state.fnHasError = false
			} catch (error) {
				state.fnHasError = true
			}
			if (!state.fnHasError) {
				const currentUrlParamsPath = $page.url.searchParams.has('path')
					? ($page.url.searchParams.get('path') as string)
					: undefined

				if (currentUrlParamsPath !== pathJson) {
					$page.url.searchParams.set('path', pathJson)
					goto($page.url.href.replace($page.url.origin, ''), {
						replaceState: true,
						noscroll: true,
						keepfocus: true
					})
				}
				state.previousPathJson = pathJson
			}
		}
	}

	$: {
		if (state.path) {
			calculateFunction()
		}
	}

	const onMouseMove = (e: paper.MouseEvent) => {
		if (!state.layers.selectionLayer) return

		if (state.path && selectionToolCircle) {
			const result = hitTestPath(e, state.path, state.tolerance)
			if (result) {
				selectionToolCircle.position.set(result.point)
			} else {
				selectionToolCircle.position.set(e.point)
			}
		}

		if (state.mouse.isMouseDown) {
			transformSelectedItems(e, state)
			drawSelection(state)
			if (state.mouse.cursor !== 'cursor-grabbing') {
				setCursor('cursor-grabbing', state)
				stateUpdated('cursor-grabbing')
			}
		}
	}

	let t = 0
	let y = fn(t)
	let speed = 0.005
	let animationCircle: paper.Shape.Circle | undefined
	useRaf(() => {
		if (!state.view.isAnimating || !state.mounted || state.fnHasError || state.mouse.isMouseDown) {
			if (animationCircle) animationCircle.visible = false
			return
		}

		if (!animationCircle) {
			animationCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
			animationCircle.fillColor = new paper.Color('rgb(34 197 94)')
		} else {
			animationCircle.visible = true
		}

		t += speed
		y = fn(t)

		animationCircle.position.set(new paper.Point(t * state.view.size, y * state.view.size))

		if (t >= 1) {
			t = 0
		}
	})

	useKeyUp('Backspace', () => {
		deleteSelectedItems(state)
		drawSelection(state)
		stateUpdated('deleted selection')
	})

	const { mouseWheelAction } = useWheel((e) => {
		e.preventDefault()
		const newTolerance = state.tolerance + e.deltaY
		if (newTolerance > 5 && newTolerance < 200) {
			getState().tolerance = newTolerance
			if (!selectionToolCircle) return
			selectionToolCircle.radius = state.tolerance
		}
	})

	const reset = () => {
		if (!state.path) return
		state.path.remove()
		const newPath = new paper.Path()
		newPath.moveTo(new paper.Point(0, 0))
		newPath.lineTo(new paper.Point([state.view.size, state.view.size]))
		newPath.fullySelected = true
		getState().path = newPath
		clearSelectedItems(state)
		drawSelection(state)
		stateUpdated('reset')
	}

	const onPointerEnter = () => {
		if (resultCircle) resultCircle.visible = true
		if (selectionToolCircle) selectionToolCircle.visible = true
	}

	const onPointerLeave = () => {
		if (resultCircle) resultCircle.visible = false
		if (selectionToolCircle) selectionToolCircle.visible = false
	}

	useKeyDown('Shift', () => {
		setCursor('cursor-copy', state)
		stateUpdated('shift')
	})

	useKeyUp('Shift', () => {
		setCursor('cursor-crosshair', state)
		stateUpdated('shift')
	})
</script>

<!-- cursor classes: 'cursor-crosshair' | 'cursor-grabbing' | 'cursor-copy' -->

<div class="relative m-10 inline-block">
	<canvas
		use:mouseWheelAction
		on:pointerenter={onPointerEnter}
		on:pointerleave={onPointerLeave}
		bind:this={canvas}
		style:width={`${state.view.size}px`}
		style:height={`${state.view.size}px`}
		class={`relative border border-gray-300 border cursor-crosshair ${state.mouse.cursor}`}
	/>

	<p class="absolute left-1/2 transform -translate-x-1/2  top-[calc(100%+6px)]">x</p>

	<p class="absolute top-1/2 transform -translate-y-1/2 left-[-20px]">y</p>

	<p class="absolute top-[calc(100%+6px)] -left-6">0,0</p>

	<p class="absolute top-[-30px] left-full">1,1</p>
</div>

<div class="m-10 font-mono">
	<button on:click={reset} class="px-8 py-2 bg-red-500 rounded text-white mb-5">Reset</button>
</div>

<div class="m-10">
	<!-- {#if resultCircle}
		<pre class="mb-10">
			 <code>
Test:
x: {resultCircle.position.x / state.view.size}
y: {resultCircle.position.x / state.view.size}
			 </code>
		 </pre>
	{/if} -->

	<pre
		class="p-4 bg-gray-200 overflow-scroll max-w-full rounded"
		class:bg-red-300={state.fnHasError}>
	<button
			bind:this={copyBtn}
			data-clipboard-target="#fn"
			class="font-sans px-8 py-2 bg-green-500 rounded text-white mb-5">Copy to Clipboard</button
		>
<code class="text-xs" id="fn">{fnstart}{fnBody}{fnEnd}</code>
  </pre>
</div>

<div class="m-10">
	<div class="flex flex-row space-x-4">
		<button
			class:bg-red-500={state.view.isAnimating}
			class:bg-green-500={!state.view.isAnimating}
			class="px-8 py-2 rounded text-white mb-5"
			on:click={() => (state.view.isAnimating = !state.view.isAnimating)}
			>{state.view.isAnimating ? 'Stop Animation' : 'Start Animation'}</button
		>

		<div class="flex flex-row i">
			<p>Speed</p>
			<input type="range" bind:value={speed} min="0.0001" max="0.1" step="0.00001" />
		</div>
	</div>

	<div
		class="h-20 w-20 bg-red-500 rounded"
		style={`will-change: transform; transform: translateX(${y * 400}px)`}
	/>
</div>
