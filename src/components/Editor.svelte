<script lang="ts">
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

	const onClick = (e: paper.MouseEvent) => {
		const segment = path.divideAt(path.getNearestLocation(e.point))
		console.log(segment.point.set(e.point))
		path = path
	}

	const onMouseDown = (e: paper.MouseEvent) => {}

	const onMouseUp = (e: paper.MouseEvent) => {}

	const onMouseMove = (e: paper.MouseEvent) => {
		inputPoint = e.point.divide(size)
	}

	const onMouseEnter = (e: paper.MouseEvent) => {
		showTest = true
	}

	const onMouseLeave = (e: paper.MouseEvent) => {
		showTest = false
	}

	$: {
		if (path) {
			const x1 = 0
			const x2 = 400
			const y1 = 0
			const y2 = 400
			const x = 200
			const y = ((y2 - y1) / (x2 - x1)) * (x - x1) + y1

			fnBody = ''
			path.segments.forEach((s, index, arr) => {
				if (!s.point || !s.next || !s.next.point) return
				const x1 = s.point.x / 400
				const x2 = s.next.point.x / 400
				const y1 = s.point.y / 400
				const y2 = s.next.point.y / 400
				if (arr.length === 2) {
					fnBody += `  return ((${y2} - ${y1}) / (${x2} - ${x1})) * (input - ${x1}) + ${y1}`
				} else {
					if (index === arr.length - 2) {
						fnBody += `  return ((${y2} - ${y1}) / (${x2} - ${x1})) * (input - ${x1}) + ${y1}`
					} else {
						fnBody += `  if (input < ${x2}) {\n`
						fnBody += `    return ((${y2} - ${y1}) / (${x2} - ${x1})) * (input - ${x1}) + ${y1}`
						fnBody += '\n  }\n'
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

	<pre class="p-4 mt-10 bg-gray-200">
    <code>{fnstart}{fnBody}{fnEnd}</code>
  </pre>
</div>
