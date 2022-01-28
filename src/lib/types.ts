import type * as paper from 'paper'

export type SelectedItem = {
	segment: paper.Segment
	item: 'segment' | 'handle-in' | 'handle-out'
}

export type SelectedItems = (SelectedItem & {
	addedAt: number
	frozenPoint?: paper.Point
})[]

export type EditorState = {
	view: {
		size: number
		isAnimating: boolean
	}
	path: paper.Path | undefined
	selectedItems: SelectedItems
	mouse: {
		lastMouseDownEvent: paper.MouseEvent | undefined
		isMouseDown: boolean
		cursor: 'cursor-crosshair' | 'cursor-grabbing' | 'cursor-copy'
	}
	mounted: boolean
	fnHasError: boolean
	tolerance: number
	layers: {
		default: paper.Layer | undefined
		selectionLayer: paper.Layer | undefined
		grid4: paper.Layer | undefined
		grid16: paper.Layer | undefined
	}
}
