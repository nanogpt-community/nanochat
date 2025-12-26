export interface ThemeColors {
	// Base colors
	background: string;
	foreground: string;
	card: string;
	cardForeground: string;
	popover: string;
	popoverForeground: string;
	
	// Primary colors
	primary: string;
	primaryForeground: string;
	heading: string;
	
	// Secondary colors
	secondary: string;
	secondaryForeground: string;
	muted: string;
	mutedForeground: string;
	accent: string;
	accentForeground: string;
	
	// Destructive
	destructive: string;
	destructiveForeground: string;
	
	// Borders & inputs
	border: string;
	input: string;
	ring: string;
	
	// Sidebar
	sidebar: string;
	sidebarForeground: string;
	sidebarPrimary: string;
	sidebarPrimaryForeground: string;
	sidebarAccent: string;
	sidebarAccentForeground: string;
	sidebarBorder: string;
	sidebarRing: string;
}

export interface Theme {
	id: string;
	name: string;
	mode: 'light' | 'dark';
	colors: ThemeColors;
}

export const themes: Theme[] = [
	// Dracula
	{
		id: 'dracula',
		name: 'Dracula',
		mode: 'dark',
		colors: {
			background: '#282a36',
			foreground: '#f8f8f2',
			card: '#282a36',
			cardForeground: '#f8f8f2',
			popover: '#21222c',
			popoverForeground: '#f8f8f2',
			primary: '#bd93f9',
			primaryForeground: '#282a36',
			heading: '#f8f8f2',
			secondary: '#44475a',
			secondaryForeground: '#f8f8f2',
			muted: '#44475a',
			mutedForeground: '#6272a4',
			accent: '#44475a',
			accentForeground: '#f8f8f2',
			destructive: '#ff5555',
			destructiveForeground: '#f8f8f2',
			border: '#44475a',
			input: '#44475a',
			ring: '#bd93f9',
			sidebar: '#191a21',
			sidebarForeground: '#6272a4',
			sidebarPrimary: '#bd93f9',
			sidebarPrimaryForeground: '#282a36',
			sidebarAccent: '#21222c',
			sidebarAccentForeground: '#f8f8f2',
			sidebarBorder: '#21222c',
			sidebarRing: '#bd93f9',
		},
	},
	// Catppuccin Latte (Light)
	{
		id: 'catppuccin-latte',
		name: 'Catppuccin Latte',
		mode: 'light',
		colors: {
			background: '#eff1f5',
			foreground: '#4c4f69',
			card: '#e6e9ef',
			cardForeground: '#4c4f69',
			popover: '#ffffff',
			popoverForeground: '#4c4f69',
			primary: '#8839ef',
			primaryForeground: '#eff1f5',
			heading: '#8839ef',
			secondary: '#ccd0da',
			secondaryForeground: '#5c5f77',
			muted: '#e6e9ef',
			mutedForeground: '#6c6f85',
			accent: '#ccd0da',
			accentForeground: '#5c5f77',
			destructive: '#d20f39',
			destructiveForeground: '#eff1f5',
			border: '#ccd0da',
			input: '#e6e9ef',
			ring: '#8839ef',
			sidebar: '#dce0e8',
			sidebarForeground: '#5c5f77',
			sidebarPrimary: '#8839ef',
			sidebarPrimaryForeground: '#eff1f5',
			sidebarAccent: '#ccd0da',
			sidebarAccentForeground: '#5c5f77',
			sidebarBorder: '#bcc0cc',
			sidebarRing: '#8839ef',
		},
	},
	// Catppuccin Mocha (Dark)
	{
		id: 'catppuccin-mocha',
		name: 'Catppuccin Mocha',
		mode: 'dark',
		colors: {
			background: '#1e1e2e',
			foreground: '#cdd6f4',
			card: '#1e1e2e',
			cardForeground: '#cdd6f4',
			popover: '#181825',
			popoverForeground: '#cdd6f4',
			primary: '#cba6f7',
			primaryForeground: '#1e1e2e',
			heading: '#cdd6f4',
			secondary: '#45475a',
			secondaryForeground: '#cdd6f4',
			muted: '#313244',
			mutedForeground: '#a6adc8',
			accent: '#45475a',
			accentForeground: '#cdd6f4',
			destructive: '#f38ba8',
			destructiveForeground: '#1e1e2e',
			border: '#45475a',
			input: '#313244',
			ring: '#cba6f7',
			sidebar: '#11111b',
			sidebarForeground: '#bac2de',
			sidebarPrimary: '#cba6f7',
			sidebarPrimaryForeground: '#1e1e2e',
			sidebarAccent: '#181825',
			sidebarAccentForeground: '#cdd6f4',
			sidebarBorder: '#181825',
			sidebarRing: '#cba6f7',
		},
	},
	// Nord (works well in both modes, but we'll define it as dark)
	{
		id: 'nord',
		name: 'Nord',
		mode: 'dark',
		colors: {
			background: '#2e3440',
			foreground: '#eceff4',
			card: '#2e3440',
			cardForeground: '#eceff4',
			popover: '#3b4252',
			popoverForeground: '#eceff4',
			primary: '#88c0d0',
			primaryForeground: '#2e3440',
			heading: '#eceff4',
			secondary: '#4c566a',
			secondaryForeground: '#eceff4',
			muted: '#3b4252',
			mutedForeground: '#d8dee9',
			accent: '#4c566a',
			accentForeground: '#eceff4',
			destructive: '#bf616a',
			destructiveForeground: '#eceff4',
			border: '#4c566a',
			input: '#3b4252',
			ring: '#88c0d0',
			sidebar: '#242933',
			sidebarForeground: '#d8dee9',
			sidebarPrimary: '#88c0d0',
			sidebarPrimaryForeground: '#2e3440',
			sidebarAccent: '#3b4252',
			sidebarAccentForeground: '#eceff4',
			sidebarBorder: '#3b4252',
			sidebarRing: '#88c0d0',
		},
	},
	// Tokyo Night
	{
		id: 'tokyo-night',
		name: 'Tokyo Night',
		mode: 'dark',
		colors: {
			background: '#1a1b26',
			foreground: '#c0caf5',
			card: '#1a1b26',
			cardForeground: '#c0caf5',
			popover: '#16161e',
			popoverForeground: '#c0caf5',
			primary: '#7aa2f7',
			primaryForeground: '#1a1b26',
			heading: '#c0caf5',
			secondary: '#414868',
			secondaryForeground: '#c0caf5',
			muted: '#24283b',
			mutedForeground: '#9aa5ce',
			accent: '#414868',
			accentForeground: '#c0caf5',
			destructive: '#f7768e',
			destructiveForeground: '#c0caf5',
			border: '#414868',
			input: '#24283b',
			ring: '#7aa2f7',
			sidebar: '#16161e',
			sidebarForeground: '#9aa5ce',
			sidebarPrimary: '#7aa2f7',
			sidebarPrimaryForeground: '#1a1b26',
			sidebarAccent: '#1f2335',
			sidebarAccentForeground: '#c0caf5',
			sidebarBorder: '#1f2335',
			sidebarRing: '#7aa2f7',
		},
	},
];

export function getTheme(themeId: string): Theme | undefined {
	return themes.find((t) => t.id === themeId);
}

export function applyTheme(theme: Theme | null) {
	if (typeof document === 'undefined') return;

	const root = document.documentElement;

	if (!theme) {
		// Reset to default theme - remove all custom properties
		const props = [
			'--background',
			'--foreground',
			'--card',
			'--card-foreground',
			'--popover',
			'--popover-foreground',
			'--primary',
			'--primary-foreground',
			'--heading',
			'--secondary',
			'--secondary-foreground',
			'--muted',
			'--muted-foreground',
			'--accent',
			'--accent-foreground',
			'--destructive',
			'--destructive-foreground',
			'--border',
			'--input',
			'--ring',
			'--sidebar',
			'--sidebar-foreground',
			'--sidebar-primary',
			'--sidebar-primary-foreground',
			'--sidebar-accent',
			'--sidebar-accent-foreground',
			'--sidebar-border',
			'--sidebar-ring',
		];
		props.forEach((prop) => root.style.removeProperty(prop));
		return;
	}

	// Apply theme colors
	const { colors } = theme;
	root.style.setProperty('--background', colors.background);
	root.style.setProperty('--foreground', colors.foreground);
	root.style.setProperty('--card', colors.card);
	root.style.setProperty('--card-foreground', colors.cardForeground);
	root.style.setProperty('--popover', colors.popover);
	root.style.setProperty('--popover-foreground', colors.popoverForeground);
	root.style.setProperty('--primary', colors.primary);
	root.style.setProperty('--primary-foreground', colors.primaryForeground);
	root.style.setProperty('--heading', colors.heading);
	root.style.setProperty('--secondary', colors.secondary);
	root.style.setProperty('--secondary-foreground', colors.secondaryForeground);
	root.style.setProperty('--muted', colors.muted);
	root.style.setProperty('--muted-foreground', colors.mutedForeground);
	root.style.setProperty('--accent', colors.accent);
	root.style.setProperty('--accent-foreground', colors.accentForeground);
	root.style.setProperty('--destructive', colors.destructive);
	root.style.setProperty('--destructive-foreground', colors.destructiveForeground);
	root.style.setProperty('--border', colors.border);
	root.style.setProperty('--input', colors.input);
	root.style.setProperty('--ring', colors.ring);
	root.style.setProperty('--sidebar', colors.sidebar);
	root.style.setProperty('--sidebar-foreground', colors.sidebarForeground);
	root.style.setProperty('--sidebar-primary', colors.sidebarPrimary);
	root.style.setProperty('--sidebar-primary-foreground', colors.sidebarPrimaryForeground);
	root.style.setProperty('--sidebar-accent', colors.sidebarAccent);
	root.style.setProperty('--sidebar-accent-foreground', colors.sidebarAccentForeground);
	root.style.setProperty('--sidebar-border', colors.sidebarBorder);
	root.style.setProperty('--sidebar-ring', colors.sidebarRing);

	// Also update the class for mode-watcher compatibility
	if (theme.mode === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
}
