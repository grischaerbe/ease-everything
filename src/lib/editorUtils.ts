import * as paper from 'paper'
import { bezierUtils } from './bezierUtils'

export const insertPointToPath = (path: paper.Path, point: paper.Point): paper.Segment | null => {
	if (path.segments.length === 0) return null
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
	segment.selected = true
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
		aLine.strokeColor = new paper.Color('#dddddd')
	}
	for (let i = 0; i <= num_rectangles_tall; i++) {
		const yPos = boundingRect.top + i * height_per_rectangle
		const leftPoint = new paper.Point(boundingRect.left, yPos)
		const rightPoint = new paper.Point(boundingRect.right, yPos)
		const aLine = new paper.Path.Line(leftPoint, rightPoint)
		aLine.strokeColor = new paper.Color('#dddddd')
	}
}

export const map = (
	value: number,
	inMin: number,
	inMax: number,
	outMin: number,
	outMax: number
) => {
	return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

const getLinearReturn = (p0: paper.Point, p1: paper.Point) => {
	return `return ((${p1.y} - ${p0.y}) / (${p1.x} - ${p0.x})) * (t - ${p0.x}) + ${p0.y}`
}

const getBezierReturn = (
	p0: paper.Point,
	h0x: number,
	h0y: number,
	h1x: number,
	h1y: number,
	p1: paper.Point
) => {
	return `return map(b(${h0x}, ${h0y}, ${h1x}, ${h1y})(((t - ${p0.x}) * (1 - 0)) / (${p1.x} - ${p0.x}) + 0 * 2), 0, 1, ${p0.y}, ${p1.y})`
}

/**
 * Returns a function to project t to an arbitrary path
 * @param path The provided path, must be normalized to the length of x === 1
 */
export const functionFromPath = (
	path: paper.Path
): {
	// eslint-disable-next-line @typescript-eslint/ban-types
	fn: Function
	fnBody: string
} => {
	let fnBody = path.segments.reduce((acc, s) => {
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
				fnBody += `  ${getLinearReturn(p0, p1)}`
			} else {
				if (index === arr.length - 2) {
					fnBody += `  ${getLinearReturn(p0, p1)}`
				} else {
					fnBody += `  if (t < ${p1.x}) ${getLinearReturn(p0, p1)}\n`
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
				fnBody += `  ${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)}`
			} else {
				if (index === arr.length - 2) {
					fnBody += `  ${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)}`
				} else {
					fnBody += `  if (t < ${p1.x}) ${getBezierReturn(p0, h0x, h0y, h1x, h1y, p1)} \n`
				}
			}
		}
	})
	const newFn = new Function('t', fnBody)

	for (let t = 0; t <= 1; t += 0.01) {
		try {
			newFn(t)
		} catch (error) {
			throw new Error('Function has errors')
		}
	}

	return {
		fn: newFn,
		fnBody
	}
}
