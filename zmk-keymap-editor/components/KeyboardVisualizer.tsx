"use client";

import { useState } from "react";
import { Layer, KeyBinding } from "@/lib/keymap-parser";
import { getKeyLabel, ZMK_KEY_LABELS } from "@/lib/zmk-keys";

// Returns a short symbol and tooltip description for special behaviors
function getBehaviorInfo(behavior: string, params: string[]): { symbol: string; tooltip: string } | null {
  if (behavior === "&mo") {
    return { symbol: "⇧", tooltip: `Hold to activate layer ${params[0]}` };
  }
  if (behavior === "&lt") {
    const keyLabel = ZMK_KEY_LABELS[params[1]] || params[1];
    return { symbol: "⇧", tooltip: `Tap: ${keyLabel} · Hold: layer ${params[0]}` };
  }
  if (behavior === "&mt") {
    const modLabel = ZMK_KEY_LABELS[params[0]] || params[0];
    const keyLabel = ZMK_KEY_LABELS[params[1]] || params[1];
    return { symbol: "◆", tooltip: `Tap: ${keyLabel} · Hold: ${modLabel}` };
  }
  if (behavior === "&tog") {
    return { symbol: "⟳", tooltip: `Toggle layer ${params[0]} on/off` };
  }
  if (behavior === "&to") {
    return { symbol: "→", tooltip: `Switch to layer ${params[0]}` };
  }
  if (behavior === "&sk") {
    const modLabel = ZMK_KEY_LABELS[params[0]] || params[0];
    return { symbol: "◇", tooltip: `Sticky key: ${modLabel} (applies to next keypress)` };
  }
  if (behavior === "&sl") {
    return { symbol: "◇", tooltip: `Sticky layer ${params[0]} (active for one keypress)` };
  }
  if (behavior === "&bt") {
    return { symbol: "◎", tooltip: `Bluetooth: ${params.join(" ")}` };
  }
  return null;
}

interface Props {
  layers: Layer[];
  activeLayer: number;
  onLayerChange: (index: number) => void;
  onKeyClick?: (layerName: string, keyLabel: string, binding: string, side: "left" | "right", position: { row: number; col: number; index: number; isThumb: boolean }) => void;
  changedKeys?: Set<number>;
}

const KEY_W = 52;
const KEY_H = 42;
const GAP = 4;
const UNIT = KEY_W + GAP;

type ColumnLayout = 5 | 6;

// Real Corne/Chocofi column stagger (fraction of KEY_H, 0 = highest)
// Measured from middle finger (highest point) downward
const CORNE_STAGGER_6 = [0.38, 0.14, 0, 0.12, 0.19, 0.24];
const CORNE_STAGGER_5 = [0.14, 0, 0.12, 0.19, 0.24];

// Compute all key positions for one half (left), then mirror for right
// Returns array of { x, y, rotation } for each key
function computeHalfPositions(cols: ColumnLayout) {
  const stagger = cols === 6 ? CORNE_STAGGER_6 : CORNE_STAGGER_5;
  const halfWidth = cols * UNIT;

  // Main grid: 3 rows x N cols
  const mainKeys: { x: number; y: number; rot: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < cols; col++) {
      mainKeys.push({
        x: col * UNIT,
        y: row * (KEY_H + GAP) + stagger[col] * (KEY_H + GAP),
        rot: 0,
      });
    }
  }

  // Thumb cluster: 3 keys in a fan arc under inner columns
  // Positioned relative to inner 3 columns, fanning outward
  const thumbBaseX = (cols - 3) * UNIT;
  const thumbBaseY = 3 * (KEY_H + GAP) + 0.15 * (KEY_H + GAP);
  const thumbKeys: { x: number; y: number; rot: number }[] = [
    { x: thumbBaseX + 0.15 * UNIT, y: thumbBaseY + 12, rot: -12 },
    { x: thumbBaseX + 1.1 * UNIT, y: thumbBaseY + 4, rot: -4 },
    { x: thumbBaseX + 2.05 * UNIT, y: thumbBaseY, rot: 0 },
  ];

  return { mainKeys, thumbKeys, halfWidth };
}

// Mirror a position horizontally within a half-width
function mirrorPos(pos: { x: number; y: number; rot: number }, halfWidth: number) {
  return {
    x: halfWidth - pos.x - KEY_W,
    y: pos.y,
    rot: -pos.rot,
  };
}

// Slice bindings based on column layout
// 6-col Corne: 42 keys (3 rows of 12 + 6 thumb)
// 5-col: show inner 5 cols per side (skip outermost column each side)
function sliceBindings(bindings: KeyBinding[], cols: ColumnLayout) {
  if (cols === 6) {
    return {
      leftRows: [
        bindings.slice(0, 6),
        bindings.slice(12, 18),
        bindings.slice(24, 30),
      ],
      rightRows: [
        bindings.slice(6, 12),
        bindings.slice(18, 24),
        bindings.slice(30, 36),
      ],
      leftThumb: bindings.slice(36, 39),
      rightThumb: bindings.slice(39, 42),
    };
  }
  // 5-col: drop the outermost key on each side per row
  return {
    leftRows: [
      bindings.slice(1, 6),    // skip col 0 (outer pinky)
      bindings.slice(13, 18),
      bindings.slice(25, 30),
    ],
    rightRows: [
      bindings.slice(6, 11),   // skip col 11 (outer pinky)
      bindings.slice(18, 23),
      bindings.slice(30, 35),
    ],
    leftThumb: bindings.slice(36, 39),
    rightThumb: bindings.slice(39, 42),
  };
}

// Get the real binding index for change tracking
function getRealIndex(
  cols: ColumnLayout,
  half: "left" | "right",
  row: number,
  col: number
) {
  if (cols === 6) {
    if (half === "left") return row * 12 + col;
    return row * 12 + 6 + col;
  }
  // 5-col: offset by 1 on left (skipped col 0), keep right as-is but cap at 5
  if (half === "left") return row * 12 + (col + 1);
  return row * 12 + 6 + col;
}

function KeyCap({
  binding,
  changed,
  style,
  onClick,
}: {
  binding: KeyBinding;
  changed: boolean;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const label = getKeyLabel(binding.behavior, binding.params);
  const isTransparent = binding.behavior === "&trans";
  const isSpecial =
    binding.behavior === "&mo" ||
    binding.behavior === "&lt" ||
    binding.behavior === "&mt" ||
    binding.behavior === "&tog" ||
    binding.behavior === "&sl";
  const behaviorInfo = getBehaviorInfo(binding.behavior, binding.params);

  return (
    <div
      className={`
        absolute flex items-center justify-center
        rounded-[8px] text-[11px] font-medium select-none
        transition-all duration-200 cursor-pointer group
        ${
          changed
            ? "bg-accent/20 border-2 border-accent text-accent-hover shadow-[0_0_14px_rgba(124,110,240,0.35)]"
            : isTransparent
              ? "bg-surface-2/40 border border-key-border/20 text-key-subtext/50"
              : isSpecial
                ? "bg-accent-dim/15 border border-accent-dim/30 text-accent-hover"
                : "bg-key border border-key-border text-key-text hover:bg-key-hover hover:border-key-border/80"
        }
      `}
      style={{
        width: KEY_W,
        height: KEY_H,
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span className="text-center leading-tight px-1 truncate max-w-[48px]">
        {label}
      </span>
      {behaviorInfo && (
        <span className="absolute -bottom-0.5 right-0.5 text-[7px] leading-none text-accent-hover/60">
          {behaviorInfo.symbol}
        </span>
      )}
      {changed && (
        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent shadow-[0_0_6px_rgba(124,110,240,0.6)]" />
      )}
      {behaviorInfo && showTooltip && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-2.5 py-1.5 bg-surface-0 border border-surface-3 rounded-lg shadow-lg whitespace-nowrap">
            <p className="text-[10px] text-key-text">{behaviorInfo.tooltip}</p>
          </div>
          <div className="w-2 h-2 bg-surface-0 border-r border-b border-surface-3 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-1" />
        </div>
      )}
    </div>
  );
}

export default function KeyboardVisualizer({
  layers,
  activeLayer,
  onLayerChange,
  onKeyClick,
  changedKeys,
}: Props) {
  const [columns, setColumns] = useState<ColumnLayout>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("zmk-editor-columns");
      if (saved === "5" || saved === "6") return Number(saved) as ColumnLayout;
    }
    return 6;
  });

  const handleColumnsChange = (val: ColumnLayout) => {
    setColumns(val);
    localStorage.setItem("zmk-editor-columns", String(val));
  };

  const layer = layers[activeLayer];
  if (!layer) return null;

  const bindings = layer.bindings;
  const { leftRows, rightRows, leftThumb, rightThumb } = sliceBindings(
    bindings,
    columns
  );

  const { mainKeys, thumbKeys, halfWidth } = computeHalfPositions(columns);

  const getThumbIndex = (half: "left" | "right", col: number) => {
    return half === "left" ? 36 + col : 39 + col;
  };

  const handleKeyClick = (binding: KeyBinding, side: "left" | "right", position: { row: number; col: number; index: number; isThumb: boolean }) => {
    if (!onKeyClick) return;
    const label = getKeyLabel(binding.behavior, binding.params) || binding.raw;
    onKeyClick(layer.displayName, label, binding.raw, side, position);
  };

  const splitGap = 48;
  const totalWidth = halfWidth * 2 + splitGap;
  // Find the max Y extent from main keys + thumb keys
  const allPositions = [...mainKeys, ...thumbKeys];
  const maxY = Math.max(...allPositions.map(p => p.y)) + KEY_H;
  const totalHeight = maxY + 20;

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Controls bar */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-surface-1 rounded-lg p-1">
          {layers.map((l, i) => (
            <button
              key={l.name}
              onClick={() => onLayerChange(i)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                i === activeLayer
                  ? "bg-accent text-white"
                  : "text-key-subtext hover:text-key-text hover:bg-surface-2"
              }`}
            >
              {l.displayName}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-surface-3" />

        <select
          value={columns}
          onChange={(e) => handleColumnsChange(Number(e.target.value) as ColumnLayout)}
          className="bg-surface-1 border border-surface-3 rounded-lg px-2.5 py-1.5 text-sm text-key-text focus:outline-none focus:border-accent cursor-pointer"
        >
          <option value={6}>6-col</option>
          <option value={5}>5-col</option>
        </select>
      </div>

      {/* Keyboard */}
      <div
        className="relative overflow-visible"
        style={{ width: totalWidth + 24, height: totalHeight + 24, paddingLeft: 12, paddingTop: 12 }}
      >
        {/* Left half */}
        <div
          className="absolute"
          style={{
            left: 12,
            top: 12,
            width: halfWidth,
            height: maxY,
            transform: "rotate(-3deg)",
            transformOrigin: "top right",
          }}
        >
          {leftRows.map((row, rowIdx) =>
            row.map((binding, colIdx) => {
              const pos = mainKeys[rowIdx * columns + colIdx];
              return (
                <KeyCap
                  key={`l-${rowIdx}-${colIdx}`}
                  binding={binding}
                  onClick={() => handleKeyClick(binding, "left", { row: rowIdx, col: colIdx, index: getRealIndex(columns, "left", rowIdx, colIdx), isThumb: false })}
                  changed={
                    changedKeys?.has(
                      getRealIndex(columns, "left", rowIdx, colIdx)
                    ) || false
                  }
                  style={{
                    left: pos.x,
                    top: pos.y,
                  }}
                />
              );
            })
          )}

          {leftThumb.map((binding, colIdx) => {
            const pos = thumbKeys[colIdx];
            return (
              <KeyCap
                key={`lt-${colIdx}`}
                binding={binding}
                onClick={() => handleKeyClick(binding, "left", { row: 3, col: colIdx, index: getThumbIndex("left", colIdx), isThumb: true })}
                changed={
                  changedKeys?.has(getThumbIndex("left", colIdx)) || false
                }
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: `rotate(${pos.rot}deg)`,
                }}
              />
            );
          })}
        </div>

        {/* Right half */}
        <div
          className="absolute"
          style={{
            left: halfWidth + splitGap + 12,
            top: 12,
            width: halfWidth,
            height: maxY,
            transform: "rotate(3deg)",
            transformOrigin: "top left",
          }}
        >
          {rightRows.map((row, rowIdx) =>
            row.map((binding, colIdx) => {
              // Mirror: right side col 0 = outermost (pinky), so mirror the mainKeys
              // Right side keys go from inner to outer, so we mirror col index
              const mirroredColIdx = columns - 1 - colIdx;
              const pos = mirrorPos(mainKeys[rowIdx * columns + mirroredColIdx], halfWidth);
              return (
                <KeyCap
                  key={`r-${rowIdx}-${colIdx}`}
                  binding={binding}
                  onClick={() => handleKeyClick(binding, "right", { row: rowIdx, col: colIdx, index: getRealIndex(columns, "right", rowIdx, colIdx), isThumb: false })}
                  changed={
                    changedKeys?.has(
                      getRealIndex(columns, "right", rowIdx, colIdx)
                    ) || false
                  }
                  style={{
                    left: pos.x,
                    top: pos.y,
                  }}
                />
              );
            })
          )}

          {rightThumb.map((binding, colIdx) => {
            // Mirror thumb keys: right thumb col 0 = inner, col 2 = outer
            // Left thumb: col 0 = outer (most rotated), col 2 = inner (no rotation)
            // Right thumb: col 0 = inner (no rotation), col 2 = outer (most rotated)
            const mirroredColIdx = 2 - colIdx;
            const pos = mirrorPos(thumbKeys[mirroredColIdx], halfWidth);
            return (
              <KeyCap
                key={`rt-${colIdx}`}
                binding={binding}
                onClick={() => handleKeyClick(binding, "right", { row: 3, col: colIdx, index: getThumbIndex("right", colIdx), isThumb: true })}
                changed={
                  changedKeys?.has(getThumbIndex("right", colIdx)) || false
                }
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: `rotate(${pos.rot}deg)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
