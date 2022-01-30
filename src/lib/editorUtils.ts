import * as paper from 'paper'
import parserTypeScript from 'prettier/parser-typescript.js'
import prettier from 'prettier/standalone.js'
import { bezierUtils } from './bezierUtils'
import { toTypeColor } from './paperUtils'
import type { EditorState, SelectedItem } from './types'

export const transpileCode = (code: string) => {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	return window.ts.transpile(code)
}

export const formatCode = (code: string) => {
	return prettier.format(code, {
		parser: 'typescript',
		plugins: [parserTypeScript]
	})
}

export const insertPointToPath = (path: paper.Path, point: paper.Point): paper.Segment => {
	if (path.segments.length === 0) {
		throw new Error('Path has no segments')
	}
	const nearestSegment = path.segments.reduce(
		(acc, s) => {
			const d = point.x - s.point.x
			if (d > 0 && d < acc.distance) {
				acc.segment = s
				acc.distance = d
				return acc
			}
			return acc
		},
		{
			distance: point.x - path.segments[0].point.x,
			segment: path.segments[0]
		}
	)
	const segment = path.insert(nearestSegment.segment.index + 1, point)
	return segment
}

export const getNearestPointOfPath = (
	path: paper.Path,
	point: paper.Point,
	threshold: number
): paper.Point | undefined => {
	const allPoints = path.segments
		.map((s): paper.Point[] => {
			const p = []
			if (s.handleIn.length > 0) p.push(s.handleIn)
			if (s.handleOut.length > 0) p.push(s.handleOut)
			p.push(s.point)
			return p
		})
		.flat()

	if (allPoints.length === 0) return

	const nearestPoint = allPoints.reduce(
		(acc, p, index) => {
			if (index === 0) return acc
			const d = p.getDistance(point)
			if (d < acc.distance) {
				acc.distance = d
				acc.point = p
				return acc
			}
			return acc
		},
		{
			point: allPoints[0],
			distance: allPoints[0].getDistance(point)
		}
	)

	if (nearestPoint.distance < threshold) {
		return nearestPoint.point
	}
}

export const segmentIsPartiallySmooth = (segment: paper.Segment): boolean => {
	if (segment.handleIn.length > 0 || segment.handleOut.length > 0) return true
	return false
}

export const segmentIsPartiallyLinear = (segment: paper.Segment): boolean => {
	if (segment.handleIn.length === 0 || segment.handleOut.length === 0) return true
	return false
}

export const segmentIsLinear = (segment: paper.Segment): boolean => {
	if (segment.handleIn.length === 0 && segment.handleOut.length === 0) return true
	return false
}

export const makeSegmentLinear = (segment: paper.Segment): void => {
	segment.handleIn.set(0, 0)
	segment.handleOut.set(0, 0)
}

export const drawGridLines = (
	num_rectangles_wide: number,
	num_rectangles_tall: number,
	boundingRect: paper.View['bounds']
) => {
	const width_per_rectangle = boundingRect.width / num_rectangles_wide
	const height_per_rectangle = boundingRect.height / num_rectangles_tall
	for (let i = 0; i <= num_rectangles_wide; i++) {
		const xPos = boundingRect.left + i * width_per_rectangle
		const topPoint = new paper.Point(xPos, boundingRect.top)
		const bottomPoint = new paper.Point(xPos, boundingRect.bottom)
		const aLine = new paper.Path.Line(topPoint, bottomPoint)
		aLine.strokeColor = toTypeColor('#dddddd')
	}
	for (let i = 0; i <= num_rectangles_tall; i++) {
		const yPos = boundingRect.top + i * height_per_rectangle
		const leftPoint = new paper.Point(boundingRect.left, yPos)
		const rightPoint = new paper.Point(boundingRect.right, yPos)
		const aLine = new paper.Path.Line(leftPoint, rightPoint)
		aLine.strokeColor = toTypeColor('#dddddd')
	}
}

export const map = (
	value: number, // 0
	inMin: number, // 0
	inMax: number, // 0
	outMin: number, // 0
	outMax: number // 1
) => {
	// edge case, but still...
	if (inMin - inMax === 0) return outMin
	return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

const getLinearReturn = (p0: paper.Point, p1: paper.Point) => {
	return `return ((${p1.y} - ${p0.y}) / (${p1.x} - ${p0.x})) * (t - ${p0.x}) + ${p0.y};`
}

const getBezierReturn = (
	p0: paper.Point,
	h0x: number,
	h0y: number,
	h1x: number,
	h1y: number,
	p1: paper.Point
) => {
	return `return map(b(${h0x}, ${h0y}, ${h1x}, ${h1y})(((t - ${p0.x}) * (1 - 0)) / (${p1.x} - ${p0.x}) + 0 * 2), 0, 1, ${p0.y}, ${p1.y});`
}

/**
 * Returns a function to project t to an arbitrary path
 * @param path The provided path, must be normalized to the length of x === 1
 */
export const functionFromPath = (
	path: paper.Path,
	state: EditorState
): {
	// eslint-disable-next-line @typescript-eslint/ban-types
	fn: Function
	fnJs: string
	fnTs: string
} => {
	let fnBodyTs = path.segments.reduce((acc, s) => {
		if (acc.length || !s.point || !s.next || !s.next.point) return acc
		const linear = s.handleOut.length === 0 && s.next.handleIn.length === 0
		if (linear) return acc
		acc = '  ' + bezierUtils + '\n'
		return acc
	}, '')

	path.segments.forEach((s, index, arr) => {
		if (!s.point || !s.next || !s.next.point) return

		const linear = s.handleOut.length === 0 && s.next.handleIn.length === 0

		const p0 = s.point
		const p1 = s.next.point

		if (linear) {
			if (arr.length === 2) {
				fnBodyTs += `${getLinearReturn(p0, p1)}`
			} else {
				if (index === arr.length - 2) {
					fnBodyTs += `${getLinearReturn(p0, p1)}`
				} else {
					fnBodyTs += `if (t < ${p1.x}) ${getLinearReturn(p0, p1)}`
				}
			}
		} else {
			const h0 = s.point.add(s.handleOut)
			const h1 = s.next.point.add(s.next.handleIn)

			const h0x = map(h0.x, p0.x, p1.x, 0, 1)
			const h0y = map(h0.y, p0.y, p1.y, 0, 1)
			const h1x = map(h1.x, p0.x, p1.x, 0, 1)
			const h1y = map(h1.y, p0.y, p1.y, 0, 1)

			if (arr.length === 2) {
				fnBodyTs += `${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)}`
			} else {
				if (index === arr.length - 2) {
					fnBodyTs += `${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)}`
				} else {
					fnBodyTs += `if (t < ${p1.x}) ${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)} \n`
				}
			}
		}
	})

	const fnBodyJs = transpileCode(fnBodyTs)
	const newFn = new Function('t', fnBodyJs)
	const fnJs = formatCode(`function interpolate(t) {${fnBodyJs}}`)
	const fnTs = formatCode(`function interpolate(t: number) {${fnBodyTs}}`)

	for (let t = 0; t <= 1; t += 0.01) {
		try {
			newFn(t)
		} catch (error) {
			throw new Error('Function has errors')
		}
	}

	const edges = [0, 1]
	edges.forEach((edge) => {
		try {
			newFn(edge)
		} catch (error) {
			throw new Error('Function has errors')
		}
	})

	return {
		fn: newFn,
		fnJs,
		fnTs
	}
}

export const selectedItemAddedAt = (selectedItem: SelectedItem, state: EditorState) => {
	const item = findSelectedItemFromState(selectedItem, state)
	if (item) {
		return item.addedAt
	} else {
		return 0
	}
}

export const findSelectedItemFromState = (selectedItem: SelectedItem, state: EditorState) => {
	return state.selectedItems.find((i) => {
		return i.segment === selectedItem.segment && i.item === selectedItem.item
	})
}

export const isSelected = (selectedItem: SelectedItem, state: EditorState): boolean => {
	return !!state.selectedItems.find((i) => {
		return i.segment === selectedItem.segment && i.item === selectedItem.item
	})
}

export const findSelectedIndex = (selectedItem: SelectedItem, state: EditorState) => {
	return state.selectedItems.findIndex((i) => {
		return i.segment === selectedItem.segment && i.item === selectedItem.item
	})
}

export const hitTestPath = (e: paper.MouseEvent, path: paper.Path, tolerance: number) => {
	return path.hitTest(e.point, {
		tolerance,
		segments: true,
		points: true,
		handles: true,
		stroke: false
	})
}

export const clearSelectedItems = (state: EditorState) => {
	state.selectedItems.splice(0, state.selectedItems.length)
}

export const removeSelectedItem = (selectedItem: SelectedItem, state: EditorState) => {
	const index = findSelectedIndex(selectedItem, state)
	if (index !== -1) {
		state.selectedItems.splice(index, 1)
	}
}

export const addSelectedItem = (selectedItem: SelectedItem, state: EditorState) => {
	if (!isSelected(selectedItem, state)) {
		const addedAt = Date.now()

		state.selectedItems.push({
			...selectedItem,
			addedAt
		})
	}
}

export const recentlyAdded = (selectedItem: SelectedItem, state: EditorState) => {
	if (isSelected(selectedItem, state)) {
		const addedAt = selectedItemAddedAt(selectedItem, state)
		return Date.now() - addedAt < 300
	}
	return false
}

export const toggleSelectedItem = (selectedItem: SelectedItem, state: EditorState) => {
	if (isSelected(selectedItem, state)) removeSelectedItem(selectedItem, state)
	else addSelectedItem(selectedItem, state)
}

export const maybeAddSelectedItem = (e: paper.MouseEvent, state: EditorState) => {
	if (!state.path) return

	const result = hitTestPath(e, state.path, state.tolerance)

	// the mousedown event happens first
	if (e.type === 'mousedown') {
		if (!result) {
			// if there's no result, the user could still try
			// to select or modify things with modifier keys
			// so we skip the clearing of selectedItems in this case
			if (!e.modifiers.shift && !e.modifiers.alt) {
				clearSelectedItems(state)
			}
		} else {
			// we have a result.
			const selectedItem: SelectedItem = {
				item: result.type as SelectedItem['item'],
				segment: result.segment
			}
			if (e.modifiers.alt) {
				// the user probably wants to modify items
				if (!isSelected(selectedItem, state)) {
					// user clicked on a non-selected item
					clearSelectedItems(state)
					addSelectedItem(selectedItem, state)
				}
			} else if (e.modifiers.shift) {
				// add items
				addSelectedItem(selectedItem, state)
			} else {
				// if no modifier was pressed, we can assume the user
				// wanted to select a new item
				clearSelectedItems(state)
				addSelectedItem(selectedItem, state)
			}
		}
	}

	// this event happens after mousedown
	if (e.type === 'click') {
		if (result) {
			// there is a result
			const selectedItem: SelectedItem = {
				item: result.type as SelectedItem['item'],
				segment: result.segment
			}

			if (e.modifiers.shift) {
				// the user pressed the shift key, indicating
				// to add to the current selection of items
				// but we need to check for interference with
				// the mousedown event
				if (!recentlyAdded(selectedItem, state)) {
					toggleSelectedItem(selectedItem, state)
				}
			}
		}
	}
}

const primaryColor = toTypeColor('#0F61FE')
// const secondaryColor = toTypeColor('#D91E28')
const whiteColor = toTypeColor('white')
export const drawGraph = (state: EditorState) => {
	if (!state.path || !state.layers.segments || !state.layers.default) return

	state.path.strokeColor = primaryColor
	state.path.strokeWidth = 2

	state.layers.segments.removeChildren()
	state.layers.segments.activate()
	state.path.segments.forEach((s) => {
		;[s.handleIn, s.handleOut].forEach((h, i) => {
			if (h.length === 0) return
			const selected = isSelected(
				{
					item: i === 0 ? 'handle-in' : 'handle-out',
					segment: s
				},
				state
			)
			const hAbs = s.point.add(h)
			const line = new paper.Path.Line(s.point, hAbs)
			line.strokeColor = primaryColor
			line.strokeWidth = 1

			if (selected) {
				const c = new paper.Shape.Circle(hAbs, 5)
				c.fillColor = primaryColor
			} else {
				const c = new paper.Shape.Circle(hAbs, 4)
				c.strokeWidth = 1
				c.fillColor = whiteColor
				c.strokeColor = primaryColor
			}
		})

		const selected = isSelected(
			{
				item: 'segment',
				segment: s
			},
			state
		)
		if (selected) {
			const r = new paper.Shape.Rectangle({
				center: s.point,
				size: [8, 8]
			})
			r.fillColor = primaryColor
		} else {
			const r = new paper.Shape.Rectangle({
				center: s.point,
				size: [7, 7]
			})
			r.strokeWidth = 1
			r.fillColor = whiteColor
			r.strokeColor = primaryColor
		}
	})
	state.layers.default.activate()
}

export const isFirstOrLastSegment = (item: SelectedItem) => {
	return item.segment.isLast() || item.segment.isFirst()
}

export const mirrorHandle = (
	segment: paper.Segment,
	leader: 'handle-in' | 'handle-out',
	state: EditorState
) => {
	const leaderHandle = leader === 'handle-in' ? segment.handleIn : segment.handleOut
	const followerHandle = leader === 'handle-in' ? segment.handleOut : segment.handleIn
	const newFollowerHandlePoint = leaderHandle.multiply(-1)
	const newFollowerHandlePointAbs = segment.point.add(newFollowerHandlePoint)
	const newFollowerHandlePointClamped = clampHandleToNormalizedX(
		segment,
		leader === 'handle-in' ? 'handle-out' : 'handle-in',
		newFollowerHandlePointAbs,
		state
	)
	followerHandle.set(newFollowerHandlePointClamped)
}

export const clampPointToNormalizedX = (point: paper.Point, state: EditorState) => {
	const pointCloned = point.clone()
	pointCloned.x = Math.min(Math.max(pointCloned.x, 0), 1 * state.view.size)
	return pointCloned
}

/**
 * Returns the segment point based (!) handle
 * @param segment
 * @param handle
 * @param target Absolute target of the handle
 * @param state
 * @returns
 */
export const clampHandleToNormalizedX = (
	segment: paper.Segment,
	handle: 'handle-in' | 'handle-out',
	target: paper.Point,
	state: EditorState
) => {
	const h = handle === 'handle-in' ? segment.handleIn : segment.handleOut
	const needsFitting = target.x > 1 * state.view.size || target.x < 0
	if (!needsFitting) return target.subtract(segment.point)
	const limit: 'upper' | 'lower' = target.x > 1 ? 'upper' : 'lower'
	const testPath = new paper.Path.Line(segment.point, target)
	const xLimit = limit === 'lower' ? 0 : 1 * state.view.size
	const boundsPath = new paper.Path.Line(
		new paper.Point(xLimit, -2000),
		new paper.Point(xLimit, 2000)
	)
	const intersections = testPath.getIntersections(boundsPath)
	if (intersections.length > 0) {
		const newHandlePointAbs = intersections[0].point
		newHandlePointAbs.x = Math.min(Math.max(newHandlePointAbs.x, 0), state.view.size)
		return newHandlePointAbs.subtract(segment.point)
	}
	return h
}

export const transformSelectedItems = (e: paper.MouseEvent, state: EditorState) => {
	if (!state.selectedItems.length) return

	const mouseDelta = e.point.subtract(
		state.mouse.lastMouseDownEvent?.point ?? new paper.Point(0, 0)
	)

	if (e.modifiers.control) {
		showGrid16(state)
	} else {
		showGrid4(state)
	}

	state.selectedItems.forEach((item) => {
		if (!item.frozenPoint) return
		if (item.item === 'handle-in') {
			let newPoint = item.frozenPoint.add(mouseDelta)
			if (e.modifiers.control) {
				newPoint = snapToGrid(newPoint, state)
			}
			const clampedNewPoint = clampHandleToNormalizedX(item.segment, 'handle-in', newPoint, state)
			item.segment.handleIn.set(clampedNewPoint)
			if (e.modifiers.alt) mirrorHandle(item.segment, 'handle-in', state)
		} else if (item.item === 'handle-out') {
			let newPoint = item.frozenPoint.add(mouseDelta)
			if (e.modifiers.control) {
				newPoint = snapToGrid(newPoint, state)
			}
			const clampedNewPoint = clampHandleToNormalizedX(item.segment, 'handle-out', newPoint, state)
			item.segment.handleOut.set(clampedNewPoint)
			if (e.modifiers.alt) mirrorHandle(item.segment, 'handle-out', state)
		} else if (item.item === 'segment') {
			let newPoint = item.frozenPoint.add(mouseDelta)
			if (e.modifiers.control) {
				newPoint = snapToGrid(newPoint, state)
			}
			item.segment.point.set(newPoint)

			if (item.segment.isFirst()) {
				item.segment.point.x = 0
			} else if (item.segment.isLast()) {
				item.segment.point.x = 1 * state.view.size
			} else {
				item.segment.point.x = Math.min(Math.max(newPoint.x, 0), 1 * state.view.size)
			}
		}
	})
}

/**
 * Freeze the point of a selectedItem to transform it absolutely
 */
export const freezeSelectedItems = (state: EditorState) => {
	state.selectedItems.forEach((selectedItem) => {
		const p =
			selectedItem.item === 'handle-in'
				? selectedItem.segment.point.add(selectedItem.segment.handleIn)
				: selectedItem.item === 'handle-out'
				? selectedItem.segment.point.add(selectedItem.segment.handleOut)
				: selectedItem.segment.point.clone()

		selectedItem.frozenPoint = p
	})
}

export const snapToGrid = (point: paper.Point, state: EditorState, gridCells = 16) => {
	return point
		.divide(state.view.size)
		.multiply(gridCells)
		.round()
		.divide(gridCells)
		.multiply(state.view.size)
}

export const mouseEventIsClick = (e: paper.MouseEvent, state: EditorState) => {
	const deltaTime = e.timeStamp - (state.mouse.lastMouseDownEvent?.timeStamp ?? 0)
	const deltaPoint = e.point.subtract(
		state.mouse.lastMouseDownEvent?.point ?? new paper.Point(0, 0)
	)
	return deltaTime < 300 && deltaPoint.length < 3
}

export const maybeModifySelectedItemsOnClick = (
	e: paper.MouseEvent,
	state: EditorState
): boolean => {
	if (!state.selectedItems.length) return false

	if (e.modifiers.alt) {
		const points = state.selectedItems.filter((item) => {
			return item.item === 'segment'
		})

		const nums = {
			handlesWithLength: 0,
			handlesWithoutLength: 0
		}
		points.forEach((s) => {
			if (s.segment.handleIn.length) nums.handlesWithLength += 1
			else nums.handlesWithoutLength += 1
			if (s.segment.handleOut.length) nums.handlesWithLength += 1
			else nums.handlesWithoutLength += 1
		})

		const onlyLinear = nums.handlesWithLength === 0

		if (onlyLinear) {
			points.forEach((item) => {
				if (item.segment.isFirst()) {
					const nextPoint = item.segment.next.point
					const dir = item.segment.point.subtract(nextPoint).multiply(-1)
					dir.length = 0.1 * state.view.size
					item.segment.handleOut.set(dir)
				} else if (item.segment.isLast()) {
					const previousPoint = item.segment.previous.point
					const dir = item.segment.point.subtract(previousPoint).multiply(-1)
					dir.length = 0.1 * state.view.size
					item.segment.handleIn.set(dir)
				} else {
					item.segment.smooth()
				}
			})
		} else {
			points.forEach((item) => {
				item.segment.handleIn.length = 0
				item.segment.handleOut.length = 0
				const s1: SelectedItem = {
					item: 'handle-in',
					segment: item.segment
				}
				const s2: SelectedItem = {
					item: 'handle-out',
					segment: item.segment
				}
				removeSelectedItem(s1, state)
				removeSelectedItem(s2, state)
			})
		}

		return true
	}

	return false
}

export const deleteSelectedItems = (state: EditorState) => {
	state.selectedItems
		.filter((item) => !item.segment.isLast() && !item.segment.isFirst())
		.forEach((item) => {
			item.segment.remove()
			removeSelectedItem(item, state)
		})
}

export const showGrid16 = (state: EditorState) => {
	if (!state.layers.grid16 || !state.layers.grid4) return
	state.layers.grid4.visible = false
	state.layers.grid16.visible = true
}

export const showGrid4 = (state: EditorState) => {
	if (!state.layers.grid16 || !state.layers.grid4) return
	state.layers.grid16.visible = false
	state.layers.grid4.visible = true
}

export const resetGrid = showGrid4

export const setCursor = (cursor: EditorState['mouse']['cursor'], state: EditorState) => {
	state.mouse.cursor = cursor
}

export const resetZoom = (state: EditorState) => {
	paper.view.scaling = new paper.Point(0.95, -0.95)
	paper.view.center = new paper.Point(state.view.size / 2, state.view.size / 2)
}
