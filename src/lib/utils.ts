export const replaceStateWithQuery = (values: Record<string, string>) => {
	const url = new URL(window.location.toString())
	for (const [k, v] of Object.entries(values)) {
		if (v) {
			url.searchParams.set(encodeURIComponent(k), encodeURIComponent(v))
		} else {
			url.searchParams.delete(k)
		}
	}
	history.replaceState({}, '', url)
}
