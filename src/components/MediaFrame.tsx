import React from 'react';

export const MediaFrame: React.FC<{
  mediaUrl?: string;
  label: string;
  className?: string;
}> = ({ mediaUrl, label, className }) => {
  if (!mediaUrl) {
    return (
      <div className={`flex items-center justify-center bg-slate-900 text-[11px] text-slate-400 ${className || ''}`}>
        Media is not in Drive
      </div>
    );
  }
  return <img src={mediaUrl} alt={label} className={className} />;
};
