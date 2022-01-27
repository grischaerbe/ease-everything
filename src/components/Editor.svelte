<script lang="ts">
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { useKeyUp } from '$hooks/useKeyUp'
	import { useRaf } from '$hooks/useRaf'
	import { useWheel } from '$hooks/useWheel'
	import {
		drawGridLines,
		functionFromPath,
		insertPointToPath,
		makeSegmentLinear,
		segmentIsLinear,
		segmentIsPartiallyLinear
	} from '$lib/editorUtils'
	import ClipboardJS from 'clipboard'
	import * as paper from 'paper'
	import { onMount } from 'svelte'

	let canvas: HTMLCanvasElement | undefined
	let copyBtn: HTMLButtonElement | undefined

	let size = 400

	let path: paper.Path | undefined

	let fnstart = 'function interpolate(t) {\n'
	let fnBody = '  return t'
	let fnEnd = '\n}'

	let fn = new Function('t', fnBody)

	let mounted = false

	let fnHasError = false

	let tolerance = 30

	let resultCircle: paper.Shape.Circle | undefined
	let selectedCircle: paper.Shape.Circle | undefined
	let selectionToolCircle: paper.Shape.Circle | undefined

	const setViewSize = () => {
		paper.view.viewSize.width = size
		paper.view.viewSize.height = size
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

		selectionToolCircle = new paper.Shape.Circle(new paper.Point(0, 0), tolerance)
		selectionToolCircle.visible = false
		selectionToolCircle.fillColor = new paper.Color('rgba(19, 147, 224, 0.1)')

		selectedCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
		selectedCircle.visible = false
		selectedCircle.fillColor = new paper.Color('rgb(209, 213, 219, 0.6)')
	}

	onMount(() => {
		if (!canvas || !copyBtn) return
		paper.setup(canvas)

		path = new paper.Path()
		const json = $page.url.searchParams.get('path')
		if (json) {
			path.importJSON(json)
		} else {
			path.moveTo(new paper.Point(0, 0))
			path.lineTo(new paper.Point([size, size]))
		}

		path.fullySelected = true
		paper.view.autoUpdate = true
		paper.view.scale(1, -1)

		drawUtils()

		setViewSize()

		installEventListeners()

		drawGridLines(4, 4, paper.view.bounds)

		new ClipboardJS(copyBtn)
		mounted = true
	})

	const hitTestPath = (e: paper.MouseEvent) => {
		if (!path) return
		return path.hitTest(e.point, {
			tolerance,
			segments: true,
			points: true,
			handles: true,
			stroke: false
		})
	}

	let mouseEventStart: paper.MouseEvent | null = null

	const handleClick = (e: paper.MouseEvent) => {
		if (!path) return
		const result = hitTestPath(e)

		if (result?.type === 'segment') {
			if (e.modifiers.shift) {
				if (segmentIsLinear(result.segment)) {
					if (result.segment.isFirst()) {
						const nextPoint = result.segment.next.point
						const dir = result.segment.point.subtract(nextPoint).multiply(-1)
						dir.length = 0.1 * size
						result.segment.handleOut.set(dir)
					} else if (result.segment.isLast()) {
						const previousPoint = result.segment.previous.point
						const dir = result.segment.point.subtract(previousPoint).multiply(-1)
						dir.length = 0.1 * size
						result.segment.handleIn.set(dir)
					} else {
						result.segment.smooth()
					}
				} else if (segmentIsPartiallyLinear(result.segment)) {
					if (!result.segment.handleIn.length) {
						result.segment.handleIn.set(result.segment.handleOut.multiply(-1))
					} else {
						result.segment.handleOut.set(result.segment.handleIn.multiply(-1))
					}
				} else {
					makeSegmentLinear(result.segment)
				}
			}
		}
		path = path
	}

	let selectedItem: 'handle-in' | 'handle-out' | 'segment' | null = null
	let selectedSegment: paper.Segment | null = null
	let isMouseDown = false

	const select = (segment: paper.Segment, item: 'point' | 'handle-in' | 'handle-out' = 'point') => {
		if (selectedCircle && selectedSegment) {
			switch (item) {
				case 'point':
					selectedCircle.position.set(segment.point)
					break
				case 'handle-out':
					selectedCircle.position.set(segment.point.add(segment.handleOut))
					break
				case 'handle-in':
					selectedCircle.position.set(segment.point.add(segment.handleIn))
					break
				default:
					break
			}
			selectedCircle.visible = true
		}
	}

	const deselect = () => {
		if (selectedCircle) {
			selectedCircle.visible = false
		}
	}

	const onMouseDown = (e: paper.MouseEvent) => {
		mouseEventStart = e
		isMouseDown = true
		if (resultCircle) resultCircle.visible = false

		if (!path) return

		const result = hitTestPath(e)

		if (result && selectionToolCircle) {
			selectionToolCircle.position.set(result.point)
			selectionToolCircle.visible = true
		}

		if (result?.type === 'segment') {
			selectedItem = 'segment'
			selectedSegment = result.segment
			select(selectedSegment)
		} else if (result?.type === 'handle-in') {
			selectedItem = 'handle-in'
			selectedSegment = result.segment
			select(selectedSegment, 'handle-in')
		} else if (result?.type === 'handle-out') {
			selectedItem = 'handle-out'
			selectedSegment = result.segment
			select(selectedSegment, 'handle-out')
		} else {
			selectedItem = 'segment'
			selectedSegment = insertPointToPath(path, e.point)
			if (selectedSegment) {
				select(selectedSegment)
			}
		}

		path = path
	}

	const onMouseUp = (e: paper.MouseEvent) => {
		const deltaTime = e.timeStamp - (mouseEventStart?.timeStamp ?? 0)
		const deltaPoint = e.point.subtract(mouseEventStart?.point ?? new paper.Point(0, 0))

		const isClick = deltaTime < 300 && deltaPoint.length < 3

		if (isClick) handleClick(e)

		if (resultCircle) resultCircle.visible = true
		isMouseDown = false
	}

	const onMouseMove = (e: paper.MouseEvent) => {
		if (resultCircle && path && fn && !fnHasError) {
			const t = e.point.x / size
			const y = fn(t)
			resultCircle.position.set(e.point.x, y * size)
			resultCircle = resultCircle
		}

		if (!isMouseDown && path && selectionToolCircle) {
			const result = hitTestPath(e)

			if (result) {
				selectionToolCircle.position.set(result.point)
				selectionToolCircle.visible = true
			} else {
				selectionToolCircle?.position.set(e.point)
				selectionToolCircle.visible = true
			}
		} else if (isMouseDown && selectionToolCircle) {
			selectionToolCircle.visible = false
		}

		if (!selectedSegment || !isMouseDown) return

		if (selectedItem === 'segment') {
			if (selectedSegment.isFirst() || selectedSegment.isLast()) {
				selectedSegment.point.y = e.point.y
			} else {
				let newPoint = e.point.clone()
				if (e.modifiers.shift) {
					newPoint = newPoint.divide(size).multiply(16).round().divide(16).multiply(size)
				}
				if (newPoint.x > selectedSegment.next.point.x) {
					newPoint.x = selectedSegment.next.point.x
				} else if (newPoint.x < selectedSegment.previous.point.x) {
					newPoint.x = selectedSegment.previous.point.x
				}
				selectedSegment.point.set(newPoint)
			}
			select(selectedSegment)
			path = path
		} else if (selectedItem === 'handle-in') {
			let newHandlePoint = e.point.subtract(selectedSegment.point)
			if (e.modifiers.shift) {
				newHandlePoint = newHandlePoint.divide(size).multiply(16).round().divide(16).multiply(size)
			}
			// if (e.modifiers.shift) {
			// 	if (Math.abs(newHandlePoint.x) > Math.abs(newHandlePoint.y)) {
			// 		newHandlePoint.y = 0
			// 	} else {
			// 		newHandlePoint.x = 0
			// 	}
			// }
			selectedSegment.handleIn.set(newHandlePoint)
			if (e.modifiers.alt) {
				selectedSegment.handleOut = selectedSegment.handleIn.multiply(-1)
			}
			select(selectedSegment, 'handle-in')
			path = path
		} else if (selectedItem === 'handle-out') {
			let newHandlePoint = e.point.subtract(selectedSegment.point)
			if (e.modifiers.shift) {
				newHandlePoint = newHandlePoint.divide(size).multiply(16).round().divide(16).multiply(size)
			}
			// if (e.modifiers.shift) {
			// 	if (Math.abs(newHandlePoint.x) > Math.abs(newHandlePoint.y)) {
			// 		newHandlePoint.y = 0
			// 	} else {
			// 		newHandlePoint.x = 0
			// 	}
			// }

			selectedSegment.handleOut.set(newHandlePoint)

			if (e.modifiers.alt) {
				selectedSegment.handleIn = selectedSegment.handleOut.multiply(-1)
			}
			select(selectedSegment, 'handle-out')
			path = path
		}
	}

	$: {
		if (path) {
			const scaledPath = path.clone()
			scaledPath.scale(1 / size, new paper.Point(0, 0))
			try {
				const { fn: newFn, fnBody: newFnBody } = functionFromPath(scaledPath)
				fn = newFn
				fnBody = newFnBody
				fnHasError = false
			} catch (error) {
				fnHasError = true
			}
			if (!fnHasError) {
				const pathJson = path.exportJSON()
				$page.url.searchParams.set('path', pathJson)
				goto($page.url.href, {
					replaceState: true
				})
			}
		}
	}

	let isAnimating = false
	let t = 0
	let y = fn(t)
	let speed = 0.005
	let animationCircle: paper.Shape.Circle | undefined
	useRaf(() => {
		if (!isAnimating || !mounted || fnHasError) return

		if (!animationCircle) {
			animationCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
			animationCircle.fillColor = new paper.Color('rgb(34 197 94)')
		}

		t += speed
		y = fn(t)

		animationCircle.position.set(new paper.Point(t * size, y * size))

		if (t >= 1) {
			t = 0
		}
	})

	useKeyUp('Backspace', () => {
		if (selectedSegment) {
			if (selectedItem === 'segment') {
				selectedSegment.remove()
			} else if (selectedItem === 'handle-in') {
				selectedSegment.handleIn.set(0, 0)
			} else if (selectedItem === 'handle-out') {
				selectedSegment.handleOut.set(0, 0)
			}
			selectedSegment = null
			selectedItem = null
			path = path
			deselect()
		}
	})

	const { mouseWheelAction } = useWheel((e) => {
		e.preventDefault()
		const newTolerance = tolerance + e.deltaY
		if (newTolerance > 5 && newTolerance < 200) {
			tolerance = newTolerance
			if (!selectionToolCircle) return
			selectionToolCircle.radius = tolerance
		}
	})

	const reset = () => {
		path?.remove()
		path = new paper.Path()
		path.moveTo(new paper.Point(0, 0))
		path.lineTo(new paper.Point([size, size]))
		path.fullySelected = true
		selectedSegment = null
		selectedItem = null
		path = path
		deselect()
	}

	const onPointerEnter = () => {
		if (resultCircle) resultCircle.visible = true
		if (selectionToolCircle) selectionToolCircle.visible = true
	}

	const onPointerLeave = () => {
		if (resultCircle) resultCircle.visible = false
		if (selectionToolCircle) selectionToolCircle.visible = false
	}
</script>

<div class="relative m-10 inline-block">
	<canvas
		use:mouseWheelAction
		on:pointerenter={onPointerEnter}
		on:pointerleave={onPointerLeave}
		bind:this={canvas}
		style:width={`${size}px`}
		style:height={`${size}px`}
		class="relative border border-gray-300 border"
	/>

	<p class="absolute left-1/2 transform -translate-x-1/2  top-[calc(100%+6px)]">x</p>

	<p class="absolute top-1/2 transform -translate-y-1/2 left-[-20px]">y</p>

	<p class="absolute top-[calc(100%+6px)] -left-6">0,0</p>

	<p class="absolute top-[-30px] left-full">1,1</p>
</div>

<div class="m-10 font-mono">
	<button on:click={reset} class="px-8 py-2 bg-red-500 rounded text-white mb-5">Reset</button>

	{#if selectedSegment}
		Selected: {selectedSegment.index}
		<div>
			<label for="x">x: </label>
			<input id="x" type="number" bind:value={selectedSegment.point.x} />
		</div>
		<div>
			<label for="y">y: </label>
			<input id="y" type="number" bind:value={selectedSegment.point.y} />
		</div>
	{/if}
</div>

<div class="m-10">
	{#if resultCircle}
		<pre class="mb-10">
			 <code>
Test:
x: {resultCircle.position.x / size}
y: {resultCircle.position.x / size}
			 </code>
		 </pre>
	{/if}

	<button
		bind:this={copyBtn}
		data-clipboard-target="#fn"
		class="px-8 py-2 bg-green-500 rounded text-white mb-5">Copy to Clipboard</button
	>
	<pre class="p-4 bg-gray-200 overflow-scroll max-w-full text-xs" class:bg-red-300={fnHasError}>
    <code id="fn">{fnstart}{fnBody}{fnEnd}</code>
  </pre>
</div>

<div class="m-10">
	<div class="flex flex-row space-x-4">
		<button
			class:bg-red-500={isAnimating}
			class:bg-green-500={!isAnimating}
			class="px-8 py-2 rounded text-white mb-5"
			on:click={() => (isAnimating = !isAnimating)}
			>{isAnimating ? 'Stop Animation' : 'Start Animation'}</button
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
