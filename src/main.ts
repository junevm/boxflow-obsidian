/**
 * Boxflow Plugin
 *
 * Renders boxflow markdown as interactive UI directly in the editor
 */
import {
	App,
	Editor,
	getAllTags,
	ItemView,
	MarkdownPostProcessorContext,
	MarkdownView,
	Menu,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import React from "react";
import { createRoot, Root } from "react-dom/client";
import { BoxflowGrid } from "./BoxflowGrid";
import { BoxflowSettings, DEFAULT_SETTINGS } from "./settings";
import { BoxflowData, Category, Grid } from "./types";

class InputModal extends Modal {
	private resolve: (result: string | null) => void;
	private defaultValue: string;
	private submitted = false;
	private fieldName: string;

	constructor(
		app: App,
		title: string,
		defaultValue: string,
		resolve: (result: string | null) => void,
		fieldName = "Name",
	) {
		super(app);
		this.setTitle(title);
		this.resolve = resolve;
		this.defaultValue = defaultValue;
		this.fieldName = fieldName;
	}

	onOpen() {
		const { contentEl } = this;
		let inputValue = this.defaultValue;

		new Setting(contentEl).setName(this.fieldName).addText((text) =>
			text.setValue(this.defaultValue).onChange((value) => {
				inputValue = value;
			}),
		);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Submit")
				.setCta()
				.onClick(() => {
					this.submitted = true;
					this.close();
					this.resolve(inputValue);
				}),
		);
	}

	onClose() {
		if (!this.submitted) {
			this.resolve(null);
		}
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ConfirmModal extends Modal {
	private resolve: (confirmed: boolean) => void;
	private message: string;
	private submitted = false;

	constructor(
		app: App,
		message: string,
		resolve: (confirmed: boolean) => void,
	) {
		super(app);
		this.setTitle("Confirm");
		this.resolve = resolve;
		this.message = message;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Yes")
					.setCta()
					.onClick(() => {
						this.submitted = true;
						this.close();
						this.resolve(true);
					}),
			)
			.addButton((btn) =>
				btn.setButtonText("No").onClick(() => {
					this.submitted = true;
					this.close();
					this.resolve(false);
				}),
			);
	}

	onClose() {
		if (!this.submitted) {
			this.resolve(false);
		}
		const { contentEl } = this;
		contentEl.empty();
	}
}

class BoxflowView extends ItemView {
	private file: TFile | null = null;
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return "boxflow";
	}

	getIcon(): string {
		return "check-square";
	}

	getDisplayText(): string {
		return this.file ? this.file.basename : "Boxflow";
	}

	async onOpen() {
		this.addAction("edit", "Edit as Markdown", () => {
			this.plugin.setMarkdownMode(this.leaf);
		});

		// Listen for file changes to update the view
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && file.path === this.file?.path) {
					void this.renderView();
				}
			}),
		);

		// Handle file deletion
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (file instanceof TFile && file.path === this.file?.path) {
					this.leaf.detach();
				}
			}),
		);

		// Handle file renaming
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFile && oldPath === this.file?.path) {
					this.file = file;
					void this.renderView();
				}
			}),
		);
	}

	onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);

		if (this.file) {
			menu.addSeparator();
			menu.addItem((item) => {
				item.setTitle("Edit as Markdown")
					.setIcon("lucide-file-text")
					.onClick(() => {
						this.plugin.setMarkdownMode(this.leaf);
					});
			});

			menu.addItem((item) => {
				item.setTitle("Delete Note")
					.setIcon("lucide-trash-2")
					.onClick(async () => {
						const confirmed = await this.plugin.confirmDialog(
							`Are you sure you want to delete "${this.file!.basename}"?`,
						);
						if (confirmed) {
							await this.app.fileManager.trashFile(this.file!);
						}
					});
			});

			// Show typical file options
			this.app.workspace.trigger(
				"file-menu",
				menu,
				this.file,
				"pane-menu",
			);
		}
	}

	async onClose() {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	async setState(state: any, result: any): Promise<void> {
		if (state.file) {
			const file = this.app.vault.getAbstractFileByPath(
				state.file as string,
			);
			if (file instanceof TFile) {
				this.file = file;
				await this.renderView();
			}
		}
		return super.setState(state, result);
	}

	getState() {
		return {
			...super.getState(),
			file: this.file?.path,
		};
	}

	private renderPromise: Promise<void> | null = null;

	private async renderView() {
		// Prevent parallel renders
		if (this.renderPromise) {
			await this.renderPromise;
		}

		this.renderPromise = this.doRender();
		try {
			await this.renderPromise;
		} finally {
			this.renderPromise = null;
		}
	}

	private async doRender() {
		if (!this.file) return;

		// Verify we are still in the DOM
		if (!this.contentEl || !this.contentEl.parentElement) return;

		const content = await this.app.vault.read(this.file);
		const grids = this.parseGridsFromContent(content);

		// Get note-level config
		let showPercentage = this.plugin.settings.showPercentage;
		const jsonRegex = /```boxflow\s*([\s\S]*?)\s*```/g;
		const match = jsonRegex.exec(content);
		if (match && match[1]) {
			try {
				const data = JSON.parse(match[1]) as BoxflowData;
				if (data.config?.showPercentage !== undefined) {
					showPercentage = data.config.showPercentage;
				}
			} catch {
				// Ignore parse errors
			}
		}

		const container = this.contentEl;
		container.addClass("boxflow-view");

		// Get or create structural elements (don't empty everything)
		let header = container.querySelector(".boxflow-header");
		if (!header) {
			header = container.createDiv("boxflow-header");
		}

		let gridsContainer = container.querySelector(
			".boxflow-grids",
		) as HTMLElement;
		if (!gridsContainer) {
			gridsContainer = container.createDiv("boxflow-grids");
		}

		// Update Header content only
		header.empty();
		const titleEl = header.createEl("h1", { text: this.file.basename });
		titleEl.addEventListener("click", async () => {
			const newName = await this.plugin.promptInput(
				"Rename note",
				this.file!.basename,
			);
			if (newName && newName !== this.file!.basename) {
				const extension = this.file!.extension;
				const parentPath = this.file!.parent
					? this.file!.parent.path
					: "";
				const newPath =
					(parentPath === "/" || parentPath === ""
						? ""
						: parentPath + "/") +
					newName +
					"." +
					extension;
				await this.app.fileManager.renameFile(this.file!, newPath);
			}
		});

		const viewActions = header.createDiv("boxflow-view-actions");

		const addCategoryBtn = viewActions.createEl("button", {
			text: "+ Category",
			cls: "mod-primary",
		});
		addCategoryBtn.addEventListener("click", () => {
			void this.addCategory();
		});

		const editButton = viewActions.createEl("button", {
			text: "Markdown",
		});
		editButton.addEventListener("click", () => {
			this.plugin.setMarkdownMode(this.leaf);
		});

		const deleteButton = viewActions.createEl("button", {
			text: "Delete",
			cls: "mod-warning",
		});
		deleteButton.addEventListener("click", async () => {
			const confirmed = await this.plugin.confirmDialog(
				`Are you sure you want to delete "${this.file!.basename}"?`,
			);
			if (confirmed) {
				await this.app.fileManager.trashFile(this.file!);
			}
		});

		// Handle empty state
		if (grids.length === 0) {
			if (this.root) {
				this.root.unmount();
				this.root = null;
			}
			gridsContainer.empty();
			const empty = gridsContainer.createDiv("boxflow-empty");
			empty.setText(
				"No boxflow grids found. Click '+ Category' to start!",
			);
			return;
		}

		// Reuse or create root
		if (!this.root) {
			// Ensure it's empty before creating root
			gridsContainer.empty();
			this.root = createRoot(gridsContainer);
		}

		const gridComponents = grids.map((grid, index) => {
			return React.createElement(BoxflowGrid, {
				key: grid.id || `grid-${index}`,
				grid,
				onToggleBox: (g: Grid, i: number) => this.toggleBox(g, i),
				onAddBox: (g: Grid) => this.addBoxToGrid(g),
				onAddBulk: (g: Grid) => this.addBoxesBulk(g),
				onRemoveBox: (g: Grid, i: number) =>
					this.removeBoxFromGrid(g, i),
				onDeleteCategory: (id: string) => this.deleteCategory(id),
				onRenameCategory: (id: string, name: string) =>
					this.renameCategory(id, name),
				onChangeColor: (id: string, color: string) =>
					this.changeCategoryColor(id, color),
				onMoveCategory: (draggedId: string, targetId: string) =>
					this.moveCategory(draggedId, targetId),
				onShowMenu: (g: Grid, e: React.MouseEvent) =>
					this.showCategoryMenu(g, e),
				settings: {
					showPercentage: showPercentage,
				},
			});
		});

		this.root.render(
			React.createElement(React.Fragment, null, ...gridComponents),
		);
	}

	private async toggleBox(grid: Grid, boxIndex: number) {
		await this.plugin.toggleBox(grid, boxIndex, this.file!.path);
	}

	private async addBoxToGrid(grid: Grid) {
		await this.plugin.addBoxToGrid(grid, this.file!.path);
	}

	private async addBoxesBulk(grid: Grid) {
		await this.plugin.addBoxesBulk(grid, this.file!.path);
	}

	private async removeBoxFromGrid(grid: Grid, boxIndex: number) {
		await this.plugin.removeBoxFromGrid(grid, boxIndex, this.file!.path);
	}

	private async renameCategory(id: string, name: string) {
		await this.plugin.renameCategory(id, name, this.file!.path);
	}

	private async changeCategoryColor(id: string, color: string) {
		await this.plugin.changeCategoryColor(id, color, this.file!.path);
	}

	private async moveCategory(draggedId: string, targetId: string) {
		await this.plugin.moveCategory(draggedId, targetId, this.file!.path);
	}

	private async deleteCategory(id: string) {
		const confirmed = await this.plugin.confirmDialog(
			"Are you sure you want to delete this category?",
		);
		if (!confirmed) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(this.file!),
		);
		const filtered = currentGrids.filter((g) => g.id !== id);
		await this.plugin.updateFileData(this.file!, filtered);
	}

	private showCategoryMenu(grid: Grid, e: React.MouseEvent) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Add Boxes in Bulk")
				.setIcon("lucide-plus-square")
				.onClick(() => this.addBoxesBulk(grid));
		});

		menu.addItem((item) => {
			item.setTitle("Rename Category")
				.setIcon("lucide-edit")
				.onClick(async () => {
					const newName = await this.plugin.promptInput(
						"Rename Category",
						grid.categoryName,
					);
					if (newName) this.renameCategory(grid.id, newName);
				});
		});

		menu.addSeparator();

		const colors = ["blue", "green", "purple", "orange", "red", "none"];
		colors.forEach((color) => {
			menu.addItem((item) => {
				item.setTitle(
					`Color: ${color.charAt(0).toUpperCase() + color.slice(1)}`,
				)
					.setIcon("lucide-palette")
					.setChecked(
						grid.color === color ||
							(!grid.color && color === "none"),
					)
					.onClick(() => this.changeCategoryColor(grid.id, color));
			});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("Delete Category")
				.setIcon("lucide-trash")
				.onClick(() => this.deleteCategory(grid.id));
		});

		menu.showAtMouseEvent(e.nativeEvent);
	}

	private async addCategory() {
		const name = await this.plugin.promptInput(
			"Category Name:",
			"New Category",
		);
		if (!name) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(this.file!),
		);
		currentGrids.push({
			id: Math.random().toString(36).substring(2, 9),
			categoryName: name,
			boxes: Array(8)
				.fill(null)
				.map((_, i) => ({ checked: false, index: i })),
			color: "none",
		});

		await this.plugin.updateFileData(this.file!, currentGrids);
	}

	private switchToMarkdownView() {
		if (this.leaf) {
			this.leaf.setViewState({
				type: "markdown",
				state: { file: this.file!.path },
			});
		}
	}

	get plugin(): BoxflowPlugin {
		return (this.app as any).plugins.getPlugin("boxflow") as BoxflowPlugin;
	}

	// Reuse parsing methods from plugin
	private parseGridsFromContent(content: string): Grid[] {
		return this.plugin.parseGridsFromContent(content);
	}
}

export default class BoxflowPlugin extends Plugin {
	settings: BoxflowSettings;
	private roots: Map<HTMLElement, Root> = new Map();
	private explicitMarkdownLeaves: WeakSet<WorkspaceLeaf> = new WeakSet();

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new BoxflowSettingsTab(this.app, this));

		// Add ribbon icon
		this.addRibbonIcon("check-square", "Create boxflow note", () => {
			void this.createNewBoxflowNote();
		});

		// Register markdown post-processor to render boxflow as UI
		this.registerMarkdownPostProcessor(
			this.boxflowPostProcessor.bind(this),
		);

		// Command to create new boxflow note
		this.addCommand({
			id: "create-boxflow-note",
			name: "Create new boxflow note",
			callback: async () => {
				await this.createNewBoxflowNote();
			},
		});

		// Command to insert grid at cursor
		this.addCommand({
			id: "insert-grid",
			name: "Insert boxflow grid",
			editorCallback: (editor: Editor) => {
				this.insertGridAtCursor(editor);
			},
		});

		// Command to toggle between Boxflow and Markdown view
		this.addCommand({
			id: "toggle-view",
			name: "Toggle Boxflow / Markdown view",
			callback: () => {
				const leaf = this.app.workspace.getMostRecentLeaf();
				if (!leaf) return;

				if (leaf.view.getViewType() === "boxflow") {
					this.setMarkdownMode(leaf);
				} else if (leaf.view instanceof MarkdownView) {
					this.setBoxflowMode(leaf, leaf.view.file!);
				}
			},
		});

		// Register the boxflow view
		this.registerView("boxflow", (leaf) => new BoxflowView(leaf));

		// Add context menu item
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					menu.addItem((item) => {
						item.setTitle("Open as Boxflow board")
							.setIcon("check-square")
							.onClick(async () => {
								const leaf =
									this.app.workspace.getMostRecentLeaf();
								if (leaf) {
									await this.setBoxflowMode(leaf, file);
								}
							});
					});
				}
			}),
		);

		// Listen for active leaf change to switch to boxflow view
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", async (leaf) => {
				if (!leaf) return;

				const view = leaf.view;
				const viewType = view.getViewType();

				if (viewType === "markdown") {
					const file = (view as any).file;
					if (
						file instanceof TFile &&
						!this.explicitMarkdownLeaves.has(leaf) &&
						(await this.isBoxflowNote(file))
					) {
						await this.setBoxflowMode(leaf, file);
					}
				} else if (viewType === "boxflow") {
					this.explicitMarkdownLeaves.delete(leaf);
				}
			}),
		);
	}

	public async setMarkdownMode(leaf: WorkspaceLeaf) {
		const view = leaf.view;
		if (!(view instanceof BoxflowView)) return;

		const file = (view as any).file;
		if (!(file instanceof TFile)) return;

		this.explicitMarkdownLeaves.add(leaf);
		await leaf.setViewState({
			type: "markdown",
			state: { file: file.path },
		});
	}

	public async setBoxflowMode(leaf: WorkspaceLeaf, file: TFile) {
		this.explicitMarkdownLeaves.delete(leaf);
		await leaf.setViewState({
			type: "boxflow",
			state: { file: file.path },
		});
	}

	onunload() {
		// Cleanup React roots
		for (const root of this.roots.values()) {
			root.unmount();
		}
		this.roots.clear();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BoxflowSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Markdown post-processor that renders boxflow as interactive UI
	 */
	boxflowPostProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const sourcePath = ctx.sourcePath;
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		// Get the raw markdown content
		this.app.vault
			.read(file)
			.then((content) => {
				const grids = this.parseGridsFromContent(content);

				// Find and replace grid markers with interactive UI
				const walker = document.createTreeWalker(
					el,
					NodeFilter.SHOW_COMMENT,
					null,
				);
				let comment: Comment | null;

				while ((comment = walker.nextNode() as Comment)) {
					if (comment.nodeValue?.trim() === "boxflow:start") {
						// Find the corresponding end marker
						let endComment: Comment | null = null;
						let sibling = comment.nextSibling;

						while (sibling) {
							if (
								sibling.nodeType === Node.COMMENT_NODE &&
								(sibling as Comment).nodeValue?.trim() ===
									"boxflow:end"
							) {
								endComment = sibling as Comment;
								break;
							}
							sibling = sibling.nextSibling;
						}

						if (endComment) {
							// Find the grid data for this position
							const grid = this.findGridAtPosition(
								grids,
								comment,
								content,
							);
							if (grid) {
								this.replaceGridWithUI(
									comment,
									endComment,
									grid,
									sourcePath,
									content,
								);
							}
						}
					}
				}
			})
			.catch((err) => {
				console.error(
					"Failed to read file for boxflow processing:",
					err,
				);
			});
	}

	/**
	 * Parse grids from raw markdown content
	 */
	parseGridsFromContent(content: string): Grid[] {
		const grids: Grid[] = [];
		const jsonRegex = /```boxflow\s*([\s\S]*?)\s*```/g;
		let match;

		let hasJson = false;
		while ((match = jsonRegex.exec(content)) !== null) {
			if (match[1]) {
				try {
					const data = JSON.parse(match[1]) as BoxflowData;
					hasJson = true;
					data.categories.forEach((c: Category) => {
						grids.push({
							id:
								c.id ||
								Math.random().toString(36).substring(2, 9),
							categoryName: c.title,
							boxes: c.boxes.map(
								(checked: boolean, index: number) => ({
									checked,
									index,
								}),
							),
							color: c.color,
						});
					});
				} catch (e) {
					console.error("Failed to parse boxflow JSON:", e);
				}
			}
		}

		if (hasJson) return grids;

		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]?.trim();
			if (!line) continue;

			if (line === "<!-- boxflow:start -->") {
				// Find corresponding end and header
				let gridEnd = -1;
				let categoryName = "";

				// Search backward for header
				for (let h = i - 1; h >= 0; h--) {
					const headerText = lines[h]?.trim();
					if (headerText?.startsWith("## ")) {
						categoryName = headerText.substring(3).trim();
						break;
					}
				}

				// Search forward for end
				for (let e = i + 1; e < lines.length; e++) {
					const endText = lines[e]?.trim();
					if (endText === "<!-- boxflow:end -->") {
						gridEnd = e;
						break;
					}
				}

				if (gridEnd !== -1) {
					const boxes = this.parseBoxesFromLines(
						lines,
						i + 1,
						gridEnd - 1,
					);
					grids.push({
						id: `legacy-${i}`,
						boxes,
						categoryName,
					});
				}
			}
		}

		return grids;
	}

	private isUpdating = false;
	async updateFileData(file: TFile, data: BoxflowData | Grid[]) {
		if (this.isUpdating) return;
		this.isUpdating = true;
		try {
			let finalData: BoxflowData;
			if (Array.isArray(data)) {
				finalData = {
					version: 1,
					categories: data.map((g) => ({
						id: g.id || Math.random().toString(36).substring(2, 9),
						title: g.categoryName,
						boxes: g.boxes.map((b) => b.checked),
						color: g.color,
					})),
				};
			} else {
				finalData = data;
			}

			const content = await this.app.vault.read(file);
			const jsonBlock = `\`\`\`boxflow\n${JSON.stringify(finalData, null, 2)}\n\`\`\``;

			let newContent: string;
			const boxflowRegex = /```boxflow[\s\S]*?```/g;
			if (boxflowRegex.test(content)) {
				newContent = content.replace(boxflowRegex, jsonBlock);
			} else {
				// Migration or first time
				if (content.includes("<!-- boxflow:start -->")) {
					newContent = content.replace(
						/<!-- boxflow:start -->[\s\S]*?<!-- boxflow:end -->/g,
						"",
					);
					newContent = newContent.replace(/^## .*$/gm, "");
					newContent = newContent.trim() + "\n\n" + jsonBlock;
				} else {
					newContent = content.trim() + "\n\n" + jsonBlock;
				}
			}

			await this.app.vault.modify(file, newContent);
		} finally {
			this.isUpdating = false;
		}
	}

	/**
	 * Parse boxes from content lines
	 */
	parseBoxesFromLines(
		lines: string[],
		startLine: number,
		endLine: number,
	): { checked: boolean; index: number }[] {
		const boxes: { checked: boolean; index: number }[] = [];
		let index = 0;

		for (let i = startLine; i <= endLine && i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const regex = /\[([x ])\]/gi;
			let match;

			while ((match = regex.exec(line)) !== null) {
				const checkChar = match[1];
				if (checkChar) {
					boxes.push({
						checked: checkChar.toLowerCase() === "x",
						index: index++,
					});
				}
			}
		}

		return boxes;
	}

	/**
	 * Find grid at a specific DOM position
	 */
	findGridAtPosition(
		grids: Grid[],
		startComment: Comment,
		content: string,
	): Grid | null {
		const lines = content.split("\n");
		let commentCount = 0;

		// Count comments before this one to determine which grid this is
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (line?.includes("<!-- boxflow:start -->")) {
				if (commentCount === grids.length) break;
				commentCount++;
			}
		}

		return grids[commentCount - 1] || null;
	}

	/**
	 * Replace grid markers with interactive UI
	 */
	replaceGridWithUI(
		startComment: Comment,
		endComment: Comment,
		grid: Grid,
		sourcePath: string,
		content: string,
	) {
		// Create container for the React component
		const container = document.createElement("div");
		container.className = "boxflow-interactive-grid";

		// Remove all nodes between start and end comments
		let current = startComment.nextSibling;
		const toRemove: Node[] = [];

		while (current && current !== endComment) {
			toRemove.push(current);
			current = current.nextSibling;
		}

		toRemove.forEach((node) => {
			if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		});

		// Replace start comment with our container
		startComment.replaceWith(container);

		// Remove end comment
		endComment.remove();

		// Get note-level config
		let showPercentage = this.settings.showPercentage;
		const jsonRegex = /```boxflow\s*([\s\S]*?)\s*```/g;
		const jsonMatch = jsonRegex.exec(content);
		if (jsonMatch && jsonMatch[1]) {
			try {
				const data = JSON.parse(jsonMatch[1]) as BoxflowData;
				if (data.config?.showPercentage !== undefined) {
					showPercentage = data.config.showPercentage;
				}
			} catch {
				// Ignore parse errors
			}
		}

		// Create React root and render component
		const root = createRoot(container);
		this.roots.set(container, root);

		root.render(
			React.createElement(BoxflowGrid, {
				grid,
				onToggleBox: (g: Grid, i: number) =>
					this.toggleBox(g, i, sourcePath),
				onAddBox: (g: Grid) => this.addBoxToGrid(g, sourcePath),
				onAddBulk: (g: Grid) => this.addBoxesBulk(g, sourcePath),
				onRemoveBox: (g: Grid, i: number) =>
					this.removeBoxFromGrid(g, i, sourcePath),
				onDeleteCategory: (id: string) =>
					this.deleteCategoryByPath(id, sourcePath),
				onRenameCategory: (id: string, name: string) =>
					this.renameCategory(id, name, sourcePath),
				onChangeColor: (id: string, color: string) =>
					this.changeCategoryColor(id, color, sourcePath),
				onMoveCategory: (draggedId: string, targetId: string) =>
					this.moveCategory(draggedId, targetId, sourcePath),
				onShowMenu: (g: Grid, e: React.MouseEvent) =>
					this.showCategoryMenu(g, e, sourcePath),
				settings: {
					showPercentage: showPercentage,
				},
			}),
		);
	}

	/**
	 * Render an interactive grid UI
	 */
	renderInteractiveGrid(
		container: HTMLElement,
		grid: Grid,
		sourcePath: string,
	) {
		// This method is now legacy as we use React directly in replaceGridWithUI
	}

	/**
	 * Toggle a box's state
	 */
	async toggleBox(grid: Grid, boxIndex: number, sourcePath: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === grid.id);
		if (targetGrid && targetGrid.boxes[boxIndex]) {
			targetGrid.boxes[boxIndex].checked =
				!targetGrid.boxes[boxIndex].checked;
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Rename a category
	 */
	async renameCategory(id: string, newName: string, sourcePath: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === id);
		if (targetGrid) {
			targetGrid.categoryName = newName;
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Change category color
	 */
	async changeCategoryColor(id: string, color: string, sourcePath: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === id);
		if (targetGrid) {
			targetGrid.color = color;
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Move a category to a new position (drag and drop)
	 */
	async moveCategory(
		draggedId: string,
		targetId: string,
		sourcePath: string,
	) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);

		const draggedIndex = currentGrids.findIndex((g) => g.id === draggedId);
		const targetIndex = currentGrids.findIndex((g) => g.id === targetId);

		if (draggedIndex !== -1 && targetIndex !== -1) {
			const draggedItem = currentGrids[draggedIndex];
			if (draggedItem) {
				currentGrids.splice(draggedIndex, 1);
				currentGrids.splice(targetIndex, 0, draggedItem);
				await this.updateFileData(file, currentGrids);
			}
		}
	}

	/**
	 * Delete a category by path (for post-processor)
	 */
	async deleteCategoryByPath(id: string, sourcePath: string) {
		const confirmed = await this.confirmDialog(
			"Are you sure you want to delete this category?",
		);
		if (!confirmed) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const filtered = currentGrids.filter((g) => g.id !== id);
		await this.updateFileData(file, filtered);
	}

	showCategoryMenu(grid: Grid, e: React.MouseEvent, sourcePath: string) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Add Boxes in Bulk")
				.setIcon("lucide-plus-square")
				.onClick(() => this.addBoxesBulk(grid, sourcePath));
		});

		menu.addItem((item) => {
			item.setTitle("Rename Category")
				.setIcon("lucide-edit")
				.onClick(async () => {
					const newName = await this.promptInput(
						"Rename Category",
						grid.categoryName,
					);
					if (newName)
						this.renameCategory(grid.id, newName, sourcePath);
				});
		});

		menu.addSeparator();

		const colors = ["blue", "green", "purple", "orange", "red", "none"];
		colors.forEach((color) => {
			menu.addItem((item) => {
				item.setTitle(
					`Color: ${color.charAt(0).toUpperCase() + color.slice(1)}`,
				)
					.setIcon("lucide-palette")
					.setChecked(
						grid.color === color ||
							(!grid.color && color === "none"),
					)
					.onClick(() =>
						this.changeCategoryColor(grid.id, color, sourcePath),
					);
			});
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle("Delete Category")
				.setIcon("lucide-trash")
				.onClick(() => this.deleteCategoryByPath(grid.id, sourcePath));
		});

		menu.showAtMouseEvent(e.nativeEvent);
	}

	/**
	 * Add a single box to grid
	 */
	async addBoxToGrid(grid: Grid, sourcePath: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === grid.id);
		if (targetGrid) {
			targetGrid.boxes.push({
				checked: false,
				index: targetGrid.boxes.length,
			});
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Add multiple boxes
	 */
	async addBoxesBulk(grid: Grid, sourcePath: string) {
		const count = await this.promptNumber("Number of boxes to add:", "10");
		if (!count || count <= 0) return;

		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === grid.id);
		if (targetGrid) {
			for (let i = 0; i < count; i++) {
				targetGrid.boxes.push({
					checked: false,
					index: targetGrid.boxes.length,
				});
			}
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Remove box at index
	 */
	async removeBoxFromGrid(grid: Grid, boxIndex: number, sourcePath: string) {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		const currentGrids = this.parseGridsFromContent(
			await this.app.vault.read(file),
		);
		const targetGrid = currentGrids.find((g) => g.id === grid.id);
		if (targetGrid && targetGrid.boxes.length > 0) {
			targetGrid.boxes.splice(boxIndex, 1);
			// Re-index remaining boxes
			targetGrid.boxes.forEach((b, i) => (b.index = i));
			await this.updateFileData(file, currentGrids);
		}
	}

	/**
	 * Insert grid at cursor position
	 */
	insertGridAtCursor(editor: any) {
		const cursor = editor.getCursor();

		// Check if we're under a header
		let headerLine = -1;

		for (let i = cursor.line; i >= 0; i--) {
			const currentLine = editor.getLine(i);
			const match = currentLine.match(/^#{1,6}\s+(.+)$/);
			if (match) {
				headerLine = i;
				break;
			}
		}

		if (headerLine === -1) {
			new Notice("Please place cursor under a header (## Header)");
			return;
		}

		const numBoxes = 8; // Default
		const gridMarkdown = `\n<!-- boxflow:start -->\n- ${Array(numBoxes).fill("[ ]").join(" ")}\n<!-- boxflow:end -->\n`;

		// Insert after the header
		const insertPos = { line: headerLine + 1, ch: 0 };
		editor.replaceRange(gridMarkdown, insertPos);
	}

	/**
	 * Create a new boxflow note
	 */
	async createNewBoxflowNote() {
		const fileName = await this.promptInput(
			"Boxflow note name:",
			"Untitled Boxflow",
		);
		if (!fileName) return;

		const sanitizedName = fileName.replace(/[\\/:*?"<>|]/g, "-");
		const filePath = `${sanitizedName}.md`;

		const initialContent = `---\nboxflow: true\n---\n\n# ${sanitizedName}\n\n\`\`\`boxflow\n{\n  "version": 1,\n  "categories": [\n    {\n      "id": "init",\n      "title": "Getting Started",\n      "boxes": [false, false, false, false, false, false, false, false]\n    }\n  ]\n}\n\`\`\`\n`;

		try {
			const file = await this.app.vault.create(filePath, initialContent);
			if (file instanceof TFile) {
				const leaf = this.app.workspace.getLeaf(false);
				await this.setBoxflowMode(leaf, file);
				this.app.workspace.setActiveLeaf(leaf, { focus: true });
			}
		} catch (error) {
			new Notice(`Failed to create note: ${error}`);
		}
	}

	/**
	 * Helper: Prompt for text input
	 */
	async promptInput(
		message: string,
		defaultValue: string,
		fieldName = "Name",
	): Promise<string | null> {
		return new Promise((resolve) => {
			new InputModal(
				this.app,
				message,
				defaultValue,
				resolve,
				fieldName,
			).open();
		});
	}

	/**
	 * Helper: Prompt for number
	 */
	async promptNumber(
		message: string,
		defaultValue: string,
		fieldName = "Count",
	): Promise<number | null> {
		const result = await this.promptInput(message, defaultValue, fieldName);
		if (!result) return null;
		const num = parseInt(result);
		return isNaN(num) ? null : num;
	}

	/**
	 * Helper: Confirmation dialog
	 */
	async confirmDialog(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			new ConfirmModal(this.app, message, resolve).open();
		});
	}

	/**
	 * Check if a file is a boxflow note
	 */
	async isBoxflowNote(file: TFile): Promise<boolean> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return false;

		// Check frontmatter
		if (cache.frontmatter?.boxflow === true) return true;
		if (cache.frontmatter?.["boxflow-board"] === true) return true;

		// Check tags
		const tags = getAllTags(cache);
		if (
			tags &&
			(tags.includes("#boxflow-board") ||
				tags.includes("boxflow-board") ||
				tags.includes("#boxflow"))
		) {
			return true;
		}

		// Fallback to checking content for markers
		const content = await this.app.vault.read(file);
		return (
			content.includes("<!-- boxflow:start -->") ||
			content.includes("```boxflow")
		);
	}
}

class BoxflowSettingsTab extends PluginSettingTab {
	plugin: BoxflowPlugin;

	constructor(app: App, plugin: BoxflowPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show percentage")
			.setDesc("Show progress percentage next to the count")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showPercentage)
					.onChange(async (value) => {
						this.plugin.settings.showPercentage = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default accent color")
			.setDesc("Default color for new categories")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						blue: "Blue",
						green: "Green",
						purple: "Purple",
						orange: "Orange",
						red: "Red",
						none: "Default",
					})
					.setValue(this.plugin.settings.accentColor)
					.onChange(async (value) => {
						this.plugin.settings.accentColor = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
