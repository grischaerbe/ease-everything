export const getSampleFunction = (ranges: [number, number][], samples: number[][]) => {
	return `
const rs: [number, number][] = [${ranges.map((r) => `[${r.toString()}]`)}]
const s: number[][] = [${samples.map((s) => `[${s.toString()}]`)}]

const map = (v: number, iMin: number, iMax: number, oMin: number, oMax: number) => {
	return ((v - iMin) * (oMax - oMin)) / (iMax - iMin) + oMin
}


if (t < 0) return s[0][0]
else if (t > 1) return s[s.length - 1][s[s.length - 1].length - 1]

const i = rs.findIndex((r) => {
	return r[0] <= t && r[1] >= t
})

if (t === rs[i][0]) return s[i][0]
else if (t === rs[i][1]) return s[i][s[i].length - 1]

const tS = map(t, rs[i][0], rs[i][1], 0, s[i].length - 1)
const tSMod = tS % 1
const sI = Math.floor(tS)
const s0 = s[i][sI]
const s1 = s[i][sI + 1]
return s0 * (1 - tSMod) + s1 * tSMod
`
}
