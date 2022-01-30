<script lang="ts">
	import {
		Column,
		Content,
		Grid,
		Header,
		HeaderActionLink,
		HeaderUtilities,
		Row
	} from 'carbon-components-svelte'
	import 'carbon-components-svelte/css/white.css'
	import LogoGithub24 from 'carbon-icons-svelte/lib/LogoGithub24'
	import '../app.css'
</script>

<Header company="Ease" platformName="Everything">
	<HeaderUtilities>
		<HeaderActionLink
			href="https://github.com/grischaerbe/ease-everything"
			target="_blank"
			aria-label="GitHub"
			icon={LogoGithub24}
		/>
	</HeaderUtilities>
</Header>
<Content style="background: transparent">
	<slot />
	<Grid style="margin-top: 20px">
		<Row>
			<Column>
				<p>Made with ❤️ by <a href="https://legrisch.com">Grischa Erbe</a></p>
			</Column>
		</Row>
	</Grid>
</Content>
