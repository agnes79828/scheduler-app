'use client';
import { useEffect, useRef } from 'react';
import type { ShiftType } from '@/types/schedule';

export type OpenCell = { key: string; x: number; y: number } | null;

export interface ShiftOption {
  shift: ShiftType | null;
  label: string;
  color: string;
}

export const THERAPIST_OPTIONS: ShiftOption[] = [
  { shift: 'day',   label: '白班', color: 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200' },
  { shift: 'night', label: '夜班', color: 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200' },
  { shift: 'full',  label: '全日', color: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200' },
  { shift: 'off',   label: '休',   color: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' },
  { shift: null,    label: '清除', color: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50' },
];

export const NURSE_OPTIONS: ShiftOption[] = [
  { shift: 'day',       label: '白班', color: 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200' },
  { shift: 'night',     label: '夜班', color: 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200' },
  { shift: 'overnight', label: '大夜', color: 'bg-violet-100 text-violet-800 border-violet-300 hover:bg-violet-200' },
  { shift: 'off',       label: '休',   color: 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200' },
  { shift: null,        label: '清除', color: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50' },
];

interface Props {
  open: OpenCell;
  onPick: (shift: ShiftType | null) => void;
  onClose: () => void;
  options?: ShiftOption[];
}

export default function ShiftPopover({ open, onPick, onClose, options = THERAPIST_OPTIONS }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: open.x, top: open.y + 4 }}
      className="z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-1"
    >
      {options.map(opt => (
        <button
          key={opt.label}
          onMouseDown={e => { e.stopPropagation(); onPick(opt.shift); }}
          className={`text-xs px-2 py-1.5 rounded border font-medium transition-colors ${opt.color}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function cellClickToOpen(
  e: React.MouseEvent,
  key: string,
  current: OpenCell,
): OpenCell {
  if (current?.key === key) return null;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return { key, x: rect.left, y: rect.bottom };
}
