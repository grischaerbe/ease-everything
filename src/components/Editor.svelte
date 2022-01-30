<script context="module" lang="ts">
	import { useKeyDown } from '$hooks/useKeyDown'
	import { useKeyUp } from '$hooks/useKeyUp'
	import { useRaf } from '$hooks/useRaf'
	import { useWheel } from '$hooks/useWheel'
	import {
		addSelectedItem,
		clearSelectedItems,
		deleteSelectedItems,
		drawGraph,
		drawGridLines,
		freezeSelectedItems,
		functionFromPath,
		hitTestPath,
		insertPointToPath,
		maybeAddSelectedItem,
		maybeModifySelectedItemsOnClick,
		mouseEventIsClick,
		resetGrid,
		resetZoom,
		setCursor,
		transformSelectedItems,
		zoom,
		zoomIn,
		zoomOut
	} from '$lib/editorUtils'
	import { toTypeColor } from '$lib/paperUtils'
	import type { EditorState, SelectedItem } from '$lib/types'
	import { replaceStateWithQuery } from '$lib/utils'
	import {
		Button,
		ButtonSet,
		CodeSnippet,
		Column,
		Grid,
		ListItem,
		Row,
		Slider,
		Tile,
		Toggle,
		UnorderedList
	} from 'carbon-components-svelte'
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
		fn: new Function('t', 'return t'),
		fnJs: '',
		fnTs: '',
		mounted: false,
		fnHasError: false,
		selectedItems: [],
		tolerance: 20,
		useTypeScript: false,
		layers: {
			background: undefined,
			default: undefined,
			segments: undefined,
			grid4: undefined,
			grid16: undefined,
			selectionLayer: undefined
		}
	}
	const getState = () => state
	const stateUpdated = (reason?: string) => {
		if (reason) console.log('state updated:', reason)
		state.path = state.path
	}

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
		selectionToolCircle = new paper.Shape.Circle(new paper.Point(0, 0), state.tolerance)
		selectionToolCircle.visible = false
		selectionToolCircle.fillColor = toTypeColor('rgba(0, 0, 0, 0.1)')

		selectedCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
		selectedCircle.visible = false
		selectedCircle.fillColor = toTypeColor('rgb(209, 213, 219, 0.6)')
	}

	onMount(() => {
		if (!canvas) return
		paper.setup(canvas)

		const p = new paper.Path()
		getState().path = p
		const params = new URLSearchParams(document.location.search)
		const pathJson = params.get('path')

		let imported = false
		if (pathJson) {
			try {
				p.importJSON(decodeURIComponent(pathJson))
				imported = true
			} catch (error) {
				console.error(error)
			}
		}
		if (!imported) {
			p.moveTo(new paper.Point(0, 0))
			p.lineTo(new paper.Point([state.view.size, state.view.size]))
		}

		p.strokeColor = toTypeColor('#0F61FE')
		p.strokeWidth = 2
		p.fullySelected = false

		state.layers.default = paper.project.activeLayer
		state.layers.selectionLayer = new paper.Layer()
		state.layers.selectionLayer.sendToBack()
		state.layers.grid4 = new paper.Layer()
		state.layers.grid4.sendToBack()
		state.layers.grid16 = new paper.Layer()
		state.layers.grid16.visible = false
		state.layers.grid16.sendToBack()
		state.layers.background = new paper.Layer()
		state.layers.background.activate()
		const bg = new paper.Shape.Rectangle(
			new paper.Point(0, 0),
			new paper.Size(state.view.size, state.view.size)
		)
		bg.fillColor = toTypeColor('white')
		state.layers.background.sendToBack()

		state.layers.segments = new paper.Layer()
		state.layers.segments.bringToFront()
		state.layers.default.activate()

		drawUtils()

		drawGraph(state)

		setViewSize()

		installEventListeners()

		state.layers.grid4.activate()
		drawGridLines(4, 4, paper.view.bounds)
		state.layers.grid16.activate()
		drawGridLines(16, 16, paper.view.bounds)
		state.layers.default.activate()

		state.mounted = true

		resetZoom(state)

		stateUpdated('mounted')
	})

	const onClick = (e: paper.MouseEvent) => {
		const modifiedSelectedItems = maybeModifySelectedItemsOnClick(e, state)

		if (!modifiedSelectedItems) {
			maybeAddSelectedItem(e, state)
		}

		drawGraph(state)
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

		drawGraph(state)

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
				return
			}

			const scaledPath = state.path.clone()
			scaledPath.scale(1 / state.view.size, new paper.Point(0, 0))
			try {
				const result = functionFromPath(scaledPath, state)

				state.fn = result.fn
				state.fnJs = result.fnJs
				state.fnTs = result.fnTs
				state.fnHasError = false
			} catch (error) {
				state.fnHasError = true
			}
			if (!state.fnHasError) {
				replaceStateWithQuery({
					path: pathJson
				})
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
			drawGraph(state)
			if (state.mouse.cursor !== 'cursor-grabbing') {
				setCursor('cursor-grabbing', state)
				stateUpdated('cursor-grabbing')
			}
		}
	}

	let t = 0
	let y = state.fn(t)
	let speed = 0.005
	let animationCircle: paper.Shape.Circle | undefined
	useRaf(() => {
		if (state.fnHasError || !state.mounted || state.mouse.isMouseDown) {
			if (animationCircle) animationCircle.visible = false
			return
		}

		if (!state.view.isAnimating) {
			return
		}

		if (!animationCircle) {
			animationCircle = new paper.Shape.Circle(new paper.Point(0, 0), 10)
			animationCircle.fillColor = toTypeColor('#0F61FE')
		} else {
			animationCircle.visible = true
		}

		t += speed
		y = state.fn(t)

		animationCircle.position.set(new paper.Point(t * state.view.size, y * state.view.size))

		if (t >= 1) {
			t = 0
		}
	})

	useKeyUp('Backspace', () => {
		deleteSelectedItems(state)
		drawGraph(state)
		stateUpdated('deleted selection')
	})

	const { mouseWheelAction } = useWheel((e) => {
		e.preventDefault()
		const zoomAmount = -e.deltaY
		const p = paper.view.getEventPoint(e as unknown as paper.Event)
		paper.view.scale(1 + zoomAmount * 0.005, p)
	})

	const reset = () => {
		if (!state.path) return
		state.path.remove()
		const newPath = new paper.Path()
		newPath.moveTo(new paper.Point(0, 0))
		newPath.lineTo(new paper.Point([state.view.size, state.view.size]))
		getState().path = newPath
		clearSelectedItems(state)
		drawGraph(state)
		resetZoom(state)
		stateUpdated('reset')
	}

	const onPointerEnter = () => {
		if (selectionToolCircle) selectionToolCircle.visible = true
	}

	const onPointerLeave = () => {
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

<Grid padding>
	<Row>
		<Column>
			<h2>Graph</h2>
		</Column>
	</Row>

	<Tile>
		<Row>
			<Column>
				<canvas
					use:mouseWheelAction
					on:pointerenter={onPointerEnter}
					on:pointerleave={onPointerLeave}
					bind:this={canvas}
					style:width={`${state.view.size}px`}
					style:height={`${state.view.size}px`}
				/>
			</Column>
			<Column>
				<div class="controls-column">
					<div class="controls-top">
						<h4 style="margin-bottom: 20px">Controls</h4>
						<UnorderedList>
							<ListItem>Click to add new point</ListItem>
							<ListItem>Click on a point to select</ListItem>
							<ListItem>Shift + Click to add point to selection</ListItem>
							<ListItem>Drag to transform selection</ListItem>
							<ListItem>Alt + Click to change segment interpolation</ListItem>
							<ListItem>Alt + Drag on handle to synchronize handles</ListItem>
							<ListItem>Drag + Ctrl to use snapping</ListItem>
							<br />
							<ListItem>Mousewheel to zoom</ListItem>
						</UnorderedList>
					</div>
					<div class="reset">
						<ButtonSet>
							<Button style="width: auto;" on:click={() => resetZoom(state)}>Reset View</Button>
							<Button style="width: auto;" on:click={reset}>Reset Graph</Button>
						</ButtonSet>
					</div>
				</div>
			</Column>
		</Row>
	</Tile>

	<Row style="margin-top: 40px">
		<Column style="padding-bottom: 0">
			<h2>Animation</h2>
		</Column>
	</Row>
	<Row>
		<Column style="position: relative">
			<Button
				disabled={state.fnHasError}
				on:click={() => (state.view.isAnimating = !state.view.isAnimating)}
				>{state.view.isAnimating ? 'Stop Animation' : 'Start Animation'}</Button
			>
		</Column>
		<Column>
			<Slider
				labelText="Animation Speed"
				hideTextInput
				bind:value={speed}
				min={0.0001}
				max={0.1}
				step={0.00001}
			/>
		</Column>
	</Row>
	<Row>
		<Column style="padding-top: 0; padding-bottom: 0">
			<div style="background-color: #F4F4F4">
				<div
					style={`position: relative; will-change: left; background-color: #0f62fe; width: 50px; height: 50px; left: calc(${
						y * 100
					}% - ${
						y * 50
					}px); display: flex; flex-direction: row; justify-content: center; align-items: center`}
				>
					<small style="color: white">{y.toFixed(2)}</small>
				</div>
			</div>
		</Column>
	</Row>

	<Row style="margin-top: 40px">
		<Column style="padding-bottom: 0">
			<h2>Function</h2>
		</Column>
	</Row>
	<Row>
		<Column>
			<Tile>
				<Toggle
					style="margin-bottom: 20px"
					bind:toggled={state.useTypeScript}
					labelText="TypeScript"
				/>
				<CodeSnippet
					style="max-width: unset"
					light
					type="multi"
					code={state.useTypeScript ? state.fnTs : state.fnJs}
				/>
			</Tile>
		</Column>
	</Row>
</Grid>

<style lang="postcss">
	.controls-column {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: space-between;
		height: 100%;
	}

	.controls-top {
		display: flex;
		flex-direction: column;
	}
</style>
