import React from 'react';

export function LoadingState({ message = 'Loading data...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-xl border border-[#dbe3ee]">
      <div className="w-6 h-6 border-2 border-[#2563eb] border-t-transparent rounded-full animate-spin mb-2.5"></div>
      <p className="text-xs text-[#5b6678] font-medium">{message}</p>
    </div>
  );
}

export default LoadingState;
