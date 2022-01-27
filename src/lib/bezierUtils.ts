export const bezierUtils = `// https://github.com/gre/bezier-easing
  const kSTS=11,kSSS=1/(kSTS-1),map=(n,t,S,r,u)=>(n-t)*(u-r)/(S-t)+r;function A(n,t){return 1-3*t+3*n}function B(n,t){return 3*t-6*n}function C(n){return 3*n}function cB(n,t,S){return((A(t,S)*n+B(t,S))*n+C(t))*n}function gS(n,t,S){return 3*A(t,S)*n*n+2*B(t,S)*n+C(t)}function bS(n,t,S,r,u){let c,o,e=0;do{(c=cB(o=t+(S-t)/2,r,u)-n)>0?S=o:t=o}while(Math.abs(c)>1e-7&&++e<10);return o}function nRI(n,t,S,r){for(let u=0;u<4;++u){const u=gS(t,S,r);if(0===u)return t;t-=(cB(t,S,r)-n)/u}return t}function b(n,t,S,r){if(!(0<=n&&n<=1&&0<=S&&S<=1))return;const u=new Float32Array(kSTS);if(n!==t||S!==r)for(let t=0;t<kSTS;++t)u[t]=cB(t*kSSS,n,S);return c=>n===t&&S===r?c:0===c||1===c?c:cB(function(t){let r=0,c=1;const o=kSTS-1;for(;c!==o&&u[c]<=t;++c)r+=kSSS;const e=r+(t-u[--c])/(u[c+1]-u[c])*kSSS,f=gS(e,n,S);return f>=.001?nRI(t,e,n,S):0===f?e:bS(t,r,r+kSSS,n,S)}(c),t,r)}`

export const bezierUtilsDecompressed = `
const kSplineTableSize = 11
const kSampleStepSize = 1.0 / (kSplineTableSize - 1.0)

const map = (value, inMin, inMax, outMin, outMax) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

function A(aA1, aA2) {
	return 1.0 - 3.0 * aA2 + 3.0 * aA1
}
function B(aA1, aA2) {
	return 3.0 * aA2 - 6.0 * aA1
}
function C(aA1) {
	return 3.0 * aA1
}

function calcBezier(aT, aA1, aA2) {
	return ((A(aA1, aA2) * aT + B(aA1, aA2)) * aT + C(aA1)) * aT
}
function getSlope(aT, aA1, aA2) {
	return 3.0 * A(aA1, aA2) * aT * aT + 2.0 * B(aA1, aA2) * aT + C(aA1)
}

function binarySubdivide(aX, aA, aB, mX1, mX2) {
	let currentX,
		currentT,
		i = 0
	do {
		currentT = aA + (aB - aA) / 2.0
		currentX = calcBezier(currentT, mX1, mX2) - aX
		if (currentX > 0.0) {
			aB = currentT
		} else {
			aA = currentT
		}
	} while (Math.abs(currentX) > 0.0000001 && ++i < 10)
	return currentT
}

function newtonRaphsonIterate(aX, aGuessT, mX1, mX2) {
	for (let i = 0; i < 4; ++i) {
		const currentSlope = getSlope(aGuessT, mX1, mX2)
		if (currentSlope === 0.0) return aGuessT
		const currentX = calcBezier(aGuessT, mX1, mX2) - aX
		aGuessT -= currentX / currentSlope
	}
	return aGuessT
}

function bezier(mX1, mY1, mX2, mY2) {
	if (!(0 <= mX1 && mX1 <= 1 && 0 <= mX2 && mX2 <= 1)) return
	const sampleValues = new Float32Array(kSplineTableSize)

	if (mX1 !== mY1 || mX2 !== mY2) {
		for (let i = 0; i < kSplineTableSize; ++i) {
			sampleValues[i] = calcBezier(i * kSampleStepSize, mX1, mX2)
		}
	}

	function getTForX(aX) {
		let intervalStart = 0
		let currentSample = 1
		const lastSample = kSplineTableSize - 1

		for (; currentSample !== lastSample && sampleValues[currentSample] <= aX; ++currentSample) {
			intervalStart += kSampleStepSize
		}

		--currentSample

		const dist =
			(aX - sampleValues[currentSample]) /
			(sampleValues[currentSample + 1] - sampleValues[currentSample])
		const guessForT = intervalStart + dist * kSampleStepSize
		const initialSlope = getSlope(guessForT, mX1, mX2)

		if (initialSlope >= 0.001) {
			return newtonRaphsonIterate(aX, guessForT, mX1, mX2)
		} else if (initialSlope === 0.0) {
			return guessForT
		} else {
			return binarySubdivide(aX, intervalStart, intervalStart + kSampleStepSize, mX1, mX2)
		}
	}

	return (x) => {
		if (mX1 === mY1 && mX2 === mY2) return x
		if (x === 0 || x === 1) return x
		return calcBezier(getTForX(x), mY1, mY2)
	}
}
`
