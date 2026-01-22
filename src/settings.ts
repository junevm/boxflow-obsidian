/**
 * Settings for the boxflow plugin
 *
 * Note: Edit mode is session-only (stored in memory, not persisted)
 * No configuration UI needed per spec requirements
 */

export interface BoxflowSettings {
	showPercentage: boolean;
	accentColor: string;
}

export const DEFAULT_SETTINGS: BoxflowSettings = {
	showPercentage: false,
	accentColor: "blue",
};
