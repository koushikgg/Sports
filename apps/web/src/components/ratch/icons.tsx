import type { CSSProperties } from 'react';

/** One set of line icons so every arrow, close and check is the same weight and a comfortable size. Colour follows the text. */
type P = { size?: number; className?: string; style?: CSSProperties };
const Svg = ({ size = 24, className, style, children, stroke = 2.4 }: P & { children: React.ReactNode; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className} style={{ flex: 'none', ...style }}>{children}</svg>
);

export const ArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></Svg>;
export const ArrowUpRight = (p: P) => <Svg {...p}><path d="M7 17 17 7" /><path d="M8 7h9v9" /></Svg>;
export const Close = (p: P) => <Svg {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Svg>;
export const Check = (p: P) => <Svg {...p} stroke={3}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const Undo = (p: P) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const Search = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>;
export const Lock = (p: P) => <Svg {...p} stroke={2.2}><rect x="4" y="10" width="16" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></Svg>;
