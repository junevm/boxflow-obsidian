/**
 * Core types for the boxflow plugin
 */

/**
 * Represents a single category (grid) of boxes
 */
export interface Category {
	id: string;
	title: string;
	boxes: boolean[]; // true if checked, false if not
	color?: string; // e.g., "blue", "green", "purple", "orange", "red"
}

/**
 * The full data structure stored in the JSON block
 */
export interface BoxflowData {
	version: number;
	config?: {
		showPercentage?: boolean;
		accentColor?: string;
	};
	categories: Category[];
}

/**
 * Internal UI state for a grid (helper for rendering)
 */
export interface Grid {
	id: string;
	categoryName: string;
	boxes: { checked: boolean; index: number }[];
	color?: string;
}

/**
 * Result of parsing a grid from content
 */
export interface ParseResult {
	grid: Grid | null;
	error?: string;
}

/**
 * Result of finding a header at cursor position
 */
export interface HeaderResult {
	found: boolean;
	headerLine: number;
	headerText: string;
	nextLine: number; // Where to insert grid
}
