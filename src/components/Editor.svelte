<script lang="ts">
	import { bezierUtils } from '$lib/bezierUtils'

	import * as paper from 'paper'
	import { onMount } from 'svelte'

	let canvas: HTMLCanvasElement | undefined

	let size = 400

	let path: paper.Path | undefined

	let fnstart = 'function ease(input) {\n'
	let fnBody = '  return input'
	let fnEnd = '\n}'

	let fn = new Function('input', fnBody)

	let mounted = false

	let inputPoint = new paper.Point(0, 0)
	let resultPoint = new paper.Point(inputPoint.x, fn(inputPoint.x))

	let addingSegment: paper.Segment | undefined = undefined

	const bezier = (input) => {
		// return input
		// return (1 - input) * 0 + input * 1
		return Math.pow(1 - input, 2) * 0 + 2 * (1 - input) * input * 0 + Math.pow(input, 2) * 1
	}

	$: {
		resultPoint.set(inputPoint.x, fn(inputPoint.x))
		// resultPoint.set(inputPoint.x, bezier(inputPoint.x))
		// resultPoint.set(inputPoint)
		resultPoint = resultPoint
	}
	let resultCircle: paper.Shape.Circle | undefined

	let showTest = false

	$: {
		if (mounted && showTest && !resultCircle) {
			resultCircle = new paper.Shape.Circle(resultPoint.multiply(size), 10)
			resultCircle.fillColor = new paper.Color('red')
		} else if (mounted && showTest) {
			resultCircle.position.set(resultPoint.multiply(size))
		}
	}

	const setViewSize = () => {
		paper.view.viewSize.width = size
		paper.view.viewSize.height = size
	}

	const installEventListeners = () => {
		paper.view.onClick = onClick
		paper.view.onMouseDown = onMouseDown
		paper.view.onMouseUp = onMouseUp
		paper.view.onMouseMove = onMouseMove
		paper.view.onMouseEnter = onMouseEnter
		paper.view.onMouseLeave = onMouseLeave
	}

	onMount(() => {
		if (!canvas) return
		paper.setup(canvas)
		path = new paper.Path()
		path.strokeColor = new paper.Color('black')
		path.moveTo(new paper.Point(0, 0))
		path.lineTo(new paper.Point([size, size]))
		path.selected = true
		paper.view.autoUpdate = true
		setViewSize()
		paper.view.scale(1, -1)
		installEventListeners()
		mounted = true
	})

	const onClick = (e: paper.MouseEvent) => {}

	const onMouseDown = (e: paper.MouseEvent) => {
		addingSegment = path.divideAt(path.getNearestLocation(e.point))
		addingSegment.point.set(e.point)
		path = path
	}

	const onMouseUp = (e: paper.MouseEvent) => {
		addingSegment = undefined
	}

	const onMouseMove = (e: paper.MouseEvent) => {
		if (addingSegment) {
			addingSegment.handleOut = addingSegment.point.subtract(e.point).multiply(-1)
			addingSegment.handleOut.selected = true

			addingSegment.handleIn = addingSegment.point.subtract(e.point)
			addingSegment.handleIn.selected = true
			path = path
		}

		inputPoint = e.point.divide(size)
	}

	const onMouseEnter = (e: paper.MouseEvent) => {
		showTest = true
	}

	const onMouseLeave = (e: paper.MouseEvent) => {
		showTest = false
	}

	const getLinearReturn = (p0: paper.Point, p1: paper.Point) => {
		return `return ((${p1.y} - ${p0.y}) / (${p1.x} - ${p0.x})) * (input - ${p0.x}) + ${p0.y}`
	}

	const getT = (p0: paper.Point, p1: paper.Point) => {
		return `const mt = ((input - ${p0.x}) * (1 - 0)) / (${p1.x} - ${p0.x}) + 0 * 2`
	}

	const map = (value, inMin, inMax, outMin, outMax) => {
		return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
	}

	$: {
		if (path) {
			fnBody = path.segments.reduce((acc, s) => {
				if (acc.length || !s.point || !s.next || !s.next.point) return acc
				const linear = s.handleOut.length === 0 && s.next.handleIn.length === 0
				if (linear) return acc
				acc = bezierUtils
				return acc
			}, '')

			path.segments.forEach((s, index, arr) => {
				if (!s.point || !s.next || !s.next.point) return

				const linear = s.handleOut.length === 0 && s.next.handleIn.length === 0

				const p0 = s.point.divide(size)
				const p1 = s.next.point.divide(size)

				if (linear) {
					if (arr.length === 2) {
						fnBody += `  ${getLinearReturn(p0, p1)}`
					} else {
						if (index === arr.length - 2) {
							fnBody += `  ${getLinearReturn(p0, p1)}`
						} else {
							fnBody += `  if (input < ${p1.x}) {\n`
							fnBody += `    ${getLinearReturn(p0, p1)}`
							fnBody += '\n  }\n'
						}
					}
				} else {
					const h0 = s.point.divide(size).add(s.handleOut.divide(size))
					const h1 = s.next.point.divide(size).add(s.next.handleIn.divide(size))

					const h0x = map(h0.x, p0.x, p1.x, 0, 1)
					const h0y = map(h0.y, p0.y, p1.y, 0, 1)
					const h1x = map(h1.x, p0.x, p1.x, 0, 1)
					const h1y = map(h1.y, p0.y, p1.y, 0, 1)

					if (arr.length === 2) {
						fnBody += `  ${getT(p0, p1)}\n`
						fnBody += `  return map(bezier(${h0x}, ${h0y}, ${h1x}, ${h1y})(mt), 0, 1, ${p0.y}, ${p1.y})`
					} else {
						if (index === arr.length - 2) {
							fnBody += `  ${getT(p0, p1)}\n`
							fnBody += `  return map(bezier(${h0x}, ${h0y}, ${h1x}, ${h1y})(mt), 0, 1, ${p0.y}, ${p1.y})`
						} else {
							fnBody += `  if (input < ${p1.x}) {\n`
							fnBody += `    ${getT(p0, p1)}\n`
							fnBody += `    return map(bezier(${h0x}, ${h0y}, ${h1x}, ${h1y})(mt), 0, 1, ${p0.y}, ${p1.y})`
							fnBody += '\n  }\n'
						}
					}
				}
			})
			fn = new Function('input', fnBody)
		}
	}
</script>

<div class="relative m-10 inline-block">
	<canvas
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

<div class="m-10">
	<pre>
    <code>
x: {resultPoint.x}
y: {resultPoint.y}
    </code>
  </pre>

	<pre class="p-4 mt-10 bg-gray-200 overflow-scroll max-w-full">
    <code>{fnstart}{fnBody}{fnEnd}</code>
  </pre>
</div>
