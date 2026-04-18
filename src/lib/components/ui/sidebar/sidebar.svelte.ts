import { IsMobile } from '$lib/hooks/is-mobile.svelte';
import { Context } from 'runed';
import { page } from '$app/state';
import { browser } from '$app/environment';
import { untrack } from 'svelte';

const SIDEBAR_WIDTH_STORAGE_KEY = 'nanochat-sidebar-width';
const SIDEBAR_OPEN_STORAGE_KEY = 'nanochat-sidebar-open';
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 460;
/* Mobile drawer is sized relative to viewport so short screens still look right */
const MOBILE_SIDEBAR_WIDTH = 320;

function clampSidebarWidth(width: number): number {
	const clampedWidth = Number.isFinite(width)
		? Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, Math.round(width)))
		: DEFAULT_SIDEBAR_WIDTH;
	return clampedWidth;
}

function loadStoredSidebarWidth(): number {
	if (typeof localStorage === 'undefined') return DEFAULT_SIDEBAR_WIDTH;
	const value = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
	if (!value) return DEFAULT_SIDEBAR_WIDTH;
	const parsed = Number.parseInt(value, 10);
	return clampSidebarWidth(parsed);
}

function loadStoredSidebarOpen(): boolean {
	if (typeof localStorage === 'undefined') return true;
	const value = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
	if (value === null) return true;
	return value !== 'false';
}

export class SidebarRootState {
	open = $state(loadStoredSidebarOpen());
	openMobile = $state(false);
	isMobile = new IsMobile();
	width = $state(loadStoredSidebarWidth());

	// When switching to mobile, ensure sidebar is closed by default
	constructor() {
		this.toggle = this.toggle.bind(this);
		this.setWidth = this.setWidth.bind(this);
		this.persistWidth = this.persistWidth.bind(this);

		$effect(() => {
			if (this.isMobile.current) {
				this.openMobile = false;
			}
		});

		$effect(() => {
			this.persistWidth(this.width);
		});

		$effect(() => {
			this.persistOpen(this.open);
		});

		// Auto-close the mobile drawer whenever the user navigates to a new
		// conversation. Without this, tapping a chat on mobile leaves the
		// drawer covering the new conversation and the user has to close it
		// manually every time. We only track the URL inputs here — the
		// openMobile / isMobile reads are untracked so the effect doesn't
		// retrigger the moment the user opens the drawer.
		$effect(() => {
			// Track these so the effect re-runs on navigation.
			const _p = page.url.pathname;
			const _s = page.url.search;
			void _p;
			void _s;
			untrack(() => {
				if (browser && this.isMobile.current && this.openMobile) {
					this.openMobile = false;
				}
			});
		});

		// Close the mobile drawer on Escape key from anywhere.
		$effect(() => {
			if (!browser) return;
			const handler = (e: KeyboardEvent) => {
				if (e.key === 'Escape' && this.isMobile.current && this.openMobile) {
					this.openMobile = false;
				}
			};
			document.addEventListener('keydown', handler);
			return () => document.removeEventListener('keydown', handler);
		});
	}

	/** Effective drawer width. Mobile uses a viewport-aware size so it doesn't feel cramped. */
	showSidebar = $derived(this.isMobile.current ? this.openMobile : this.open);
	effectiveWidth = $derived(this.isMobile.current ? MOBILE_SIDEBAR_WIDTH : this.width);

	persistWidth(width: number) {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
	}

	persistOpen(open: boolean) {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(open));
	}

	setWidth(nextWidth: number) {
		const clampedWidth = clampSidebarWidth(nextWidth);
		this.width = clampedWidth;
		this.persistWidth(clampedWidth);
	}

	toggle() {
		if (this.isMobile.current) {
			this.openMobile = !this.openMobile;
		} else {
			this.open = !this.open;
		}
	}

	closeMobile() {
		if (this.isMobile.current) {
			this.openMobile = false;
		}
	}
}


export class SidebarTriggerState {
	constructor(readonly root: SidebarRootState) {
		this.toggle = this.toggle.bind(this);
	}

	toggle() {
		this.root.toggle();
	}
}

export class SidebarSidebarState {
	constructor(readonly root: SidebarRootState) { }
}

export class SidebarControlState {
	constructor(readonly root: SidebarRootState) {
		this.closeMobile = this.closeMobile.bind(this);
		this.toggle = this.toggle.bind(this);
	}

	get isMobile() {
		return this.root.isMobile.current;
	}

	closeMobile() {
		this.root.closeMobile();
	}

	toggle() {
		this.root.toggle();
	}
}

export const ctx = new Context<SidebarRootState>('sidebar-root-context');

export function useSidebar() {
	return ctx.set(new SidebarRootState());
}

export function useSidebarTrigger() {
	return new SidebarTriggerState(ctx.get());
}

export function useSidebarSidebar() {
	return new SidebarSidebarState(ctx.get());
}

export function useSidebarControls() {
	return new SidebarControlState(ctx.get());
}
