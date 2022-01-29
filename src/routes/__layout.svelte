<script lang="ts">
	import { Content, Header } from 'carbon-components-svelte'
	import 'carbon-components-svelte/css/white.css'
	import '../app.css'
</script>

<Header company="Ease" platformName="Everything" />
<Content style="background: transparent">
	<slot />
</Content>
