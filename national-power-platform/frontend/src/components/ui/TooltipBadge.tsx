'use client';

import React from 'react';

interface TooltipBadgeProps {
  content: string;
}

/** Inline question-mark badge showing contextual engineering definitions on hover. */
export const TooltipBadge: React.FC<TooltipBadgeProps> = ({ content }) => (
  <span className="relative group inline-flex items-center ml-1 align-baseline cursor-help">
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600 hover:bg-[#500b50] hover:text-white transition">
      ?
    </span>
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-56 rounded-lg bg-slate-900 p-2 text-[11px] font-normal normal-case leading-snug text-white shadow-xl z-50 text-center">
      {content}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
    </span>
  </span>
);
