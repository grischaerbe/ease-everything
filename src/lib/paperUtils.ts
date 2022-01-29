import type * as paper from 'paper'

export const toTypeColor = (color: string): paper.Color => color as unknown as paper.Color
