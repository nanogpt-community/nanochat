import { IsMobile } from '$lib/hooks/is-mobile.svelte';
import { Context } from 'runed';

const SIDEBAR_WIDTH_STORAGE_KEY = 'nanochat-sidebar-width';
const SIDEBAR_OPEN_STORAGE_KEY = 'nanochat-sidebar-open';
const DEFAULT_SIDEBAR_WIDTH = 280;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 460;

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
	}

	showSidebar = $derived(this.isMobile.current ? this.openMobile : this.open);

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
