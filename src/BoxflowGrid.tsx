import React, { useEffect, useRef, useState } from "react";
import { Grid } from "./types";

interface BoxflowGridProps {
    grid: Grid;
    onToggleBox: (grid: Grid, boxIndex: number) => void;
    onAddBox: (grid: Grid) => void;
    onAddBulk: (grid: Grid) => void;
    onRemoveBox: (grid: Grid, boxIndex: number) => void;
    onDeleteCategory: (gridId: string) => void;
    onRenameCategory: (gridId: string, newName: string) => void;
    onChangeColor: (gridId: string, color: string) => void;
    onMoveCategory: (draggedId: string, targetId: string) => void;
    onShowMenu: (grid: Grid, e: React.MouseEvent) => void;
    settings: {
        showPercentage: boolean;
    };
}

const COLORS = ["blue", "green", "purple", "orange", "red", "none"];

export const BoxflowGrid: React.FC<BoxflowGridProps> = ({
    grid,
    onToggleBox,
    onAddBox,
    onAddBulk,
    onRemoveBox,
    onDeleteCategory,
    onRenameCategory,
    onChangeColor,
    onMoveCategory,
    onShowMenu,
    settings,
}) => {
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(grid.categoryName);
    const [isDragging, setIsDragging] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    const checkedCount = grid.boxes.filter((b) => b.checked).length;
    const totalCount = grid.boxes.length;
    const percentage =
        totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    const handleTitleBlur = () => {
        setIsEditingTitle(false);
        if (titleValue.trim() && titleValue !== grid.categoryName) {
            onRenameCategory(grid.id, titleValue.trim());
        } else {
            setTitleValue(grid.categoryName);
        }
    };

    const handleTitleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") handleTitleBlur();
        if (e.key === "Escape") {
            setIsEditingTitle(false);
            setTitleValue(grid.categoryName);
        }
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", grid.id);
        e.dataTransfer.effectAllowed = "move";
        setIsDragging(true);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== grid.id) {
            onMoveCategory(draggedId, grid.id);
        }
    };

    const gridColor = grid.color || "none";

    return (
        <div
            className={`boxflow-grid color-${gridColor} ${isDragging ? "dragging" : ""}`}
            draggable={!isEditingTitle}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <div className="boxflow-grid-header">
                <div className="boxflow-grid-drag-handle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" /></svg>
                </div>
                <div className="boxflow-title-wrapper">
                    {isEditingTitle ? (
                        <input
                            ref={titleInputRef}
                            className="boxflow-title-input"
                            value={titleValue}
                            onChange={(e) => setTitleValue(e.target.value)}
                            onBlur={handleTitleBlur}
                            onKeyDown={handleTitleKeyDown}
                        />
                    ) : (
                        <h2
                            className="boxflow-title-clickable"
                            onClick={() => setIsEditingTitle(true)}
                        >
                            {grid.categoryName}
                        </h2>
                    )}
                    <div className="boxflow-stats">
                        {checkedCount} / {totalCount}
                        {settings.showPercentage && ` (${percentage}%)`}
                    </div>
                </div>

                <div className="boxflow-grid-controls">
                    <button
                        onClick={(e) => onShowMenu(grid, e)}
                        className="boxflow-button-icon category-menu-btn"
                        title="Category options"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="boxflow-boxes">
                {grid.boxes.map((box, index) => (
                    <div
                        key={`${grid.id}-box-${index}`}
                        className={`boxflow-box-wrapper`}
                    >
                        <div
                            className={`boxflow-box ${box.checked ? "checked" : ""}`}
                            onClick={() => onToggleBox(grid, index)}
                        >
                            {box.checked && (
                                <span className="boxflow-box-checkbox">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                </span>
                            )}
                        </div>
                        <button
                            className="boxflow-box-remove"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveBox(grid, index);
                            }}
                            title="Remove box"
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
                        </button>
                    </div>
                ))}
                <div
                    className="boxflow-box add-box-btn"
                    onClick={() => onAddBox(grid)}
                    title="Add box"
                >
                    +
                </div>
            </div>
        </div>
    );
};
