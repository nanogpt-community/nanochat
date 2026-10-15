/*
	Installed from @ieedan/shadcn-svelte-extras
*/

import type { Snippet } from 'svelte';
import type { ButtonPropsWithoutHTML } from '#lib/components/ui/button/index.js';
import type { UseClipboard } from '#lib/hooks/use-clipboard.svelte.js';
import type { HTMLAttributes } from 'svelte/elements';

export type CopyButtonPropsWithoutHTML = Pick<ButtonPropsWithoutHTML, 'size' | 'variant'> & {
	ref?: HTMLButtonElement | null;
	text: string;
	icon?: Snippet<[]>;
	animationDuration?: number;
	onCopy?: (status: UseClipboard['status']) => void;
	children?: Snippet<[]>;
};

export type CopyButtonProps = CopyButtonPropsWithoutHTML &
	Omit<HTMLAttributes<HTMLButtonElement>, 'children'>;
