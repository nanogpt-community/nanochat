<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { authClient } from '$lib/backend/auth/client.js';

	let username = $state('');
	let password = $state('');
	let isLoading = $state(false);
	let error = $state('');

	async function handleSignUp() {
		if (!username || !password) return;
		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}
		isLoading = true;
		error = '';
		try {
			const result = await authClient.signUp.email({
				name: username,
				email: `${username}@thom.chat`,
				password: password,
			});
			if (result.error) {
				error = result.error.message || 'Sign up failed';
			} else {
				window.location.href = '/chat';
			}
		} catch (e: any) {
			error = e.message || 'Sign up failed';
		} finally {
			isLoading = false;
		}
	}

	async function handleSignIn() {
		if (!username || !password) return;
		isLoading = true;
		error = '';
		try {
			const result = await authClient.signIn.email({
				email: `${username}@thom.chat`,
				password: password,
			});
			if (result.error) {
				error = result.error.message || 'Sign in failed';
			} else {
				window.location.href = '/chat';
			}
		} catch (e: any) {
			error = e.message || 'Sign in failed';
		} finally {
			isLoading = false;
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && username && password) {
			handleSignIn();
		}
	}
</script>

<div class="flex h-svh flex-col place-items-center justify-center gap-6">
	<h1 class="text-2xl font-bold">Sign in to not t3.chat</h1>
	
	<div class="w-full max-w-sm space-y-4">
		<div class="grid w-full items-center gap-1.5">
			<Label for="username">Username</Label>
			<Input 
				type="text" 
				id="username" 
				placeholder="username" 
				bind:value={username}
				onkeydown={handleKeyDown}
			/>
		</div>

		<div class="grid w-full items-center gap-1.5">
			<Label for="password">Password</Label>
			<Input 
				type="password" 
				id="password" 
				placeholder="••••••••" 
				bind:value={password}
				onkeydown={handleKeyDown}
			/>
		</div>

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{/if}

		<div class="flex flex-col gap-2 pt-2">
			<Button onclick={handleSignIn} disabled={isLoading || !username || !password}>
				{isLoading ? 'Loading...' : 'Sign In'}
			</Button>
			<Button variant="outline" onclick={handleSignUp} disabled={isLoading || !username || !password}>
				Create Account
			</Button>
		</div>

		<p class="text-center text-xs text-muted-foreground pt-2">
			You can add a passkey for passwordless login in your account settings after signing in.
		</p>
	</div>
</div>
