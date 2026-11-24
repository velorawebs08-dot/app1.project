import React from 'react';
import { siteData } from '../siteData';

interface BrandLogoProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'dark',
  size = 'md',
  showSubtitle = false,
}) => {
  const iconSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const titleClass =
    size === 'sm'
      ? 'text-base font-bold'
      : size === 'lg'
        ? 'text-2xl font-extrabold'
        : 'text-lg font-bold';

  const textColor = variant === 'light' ? 'text-white' : 'text-[#0F2A4A]';
  const subTextColor = variant === 'light' ? 'text-slate-300' : 'text-slate-500';

  return (
    <div className="flex items-center gap-3 shrink-0">
      <div
        className={`${iconSize} rounded-xl bg-white overflow-hidden flex items-center justify-center shrink-0 ring-1 ${
          variant === 'light' ? 'ring-white/25' : 'ring-slate-200'
        } shadow-sm`}
      >
        <img
          src={siteData.logoUrl}
          alt={`${siteData.instituteName} logo`}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="min-w-0">
        <span
          className={`font-display tracking-tight block whitespace-nowrap leading-tight ${titleClass} ${textColor}`}
        >
          {siteData.instituteName}
        </span>
        {showSubtitle && (
          <span className={`block text-xs whitespace-nowrap ${subTextColor}`}>
            {siteData.tagline}
          </span>
        )}
      </div>
    </div>
  );
};
