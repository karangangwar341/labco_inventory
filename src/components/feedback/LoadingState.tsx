import React from 'react';

export function LoadingState({ message = 'Loading data...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-14 text-center bg-white/70 backdrop-blur-xs rounded-xl border border-slate-200/80 shadow-xs">
      <div className="relative w-8 h-8 mb-3.5">
        <div className="absolute inset-0 rounded-full border-2 border-slate-200"></div>
        <div className="absolute inset-0 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div>
      </div>
      <p className="text-xs text-slate-500 font-medium tracking-wide animate-pulse">{message}</p>
    </div>
  );
}

export default LoadingState;
