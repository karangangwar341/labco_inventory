import React from 'react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'md',
}: ModalProps) {
  if (!isOpen) return null;

  const widthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
      <div
        className={`w-full ${widthStyles[maxWidth]} bg-white border border-[#dbe3ee] rounded-xl p-5 shadow-lg space-y-4 text-[#172033]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between border-b border-[#dbe3ee] pb-3">
          <h3 id="modal-title" className="text-sm font-semibold text-[#172033]">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#5b6678] hover:text-[#172033] hover:bg-[#f1f5f9] transition"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}

export default Modal;
