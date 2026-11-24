import React from 'react';
import { motion } from 'motion/react';
import { BrandLogo } from './BrandLogo';
import { siteData } from '../siteData';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0F2A4A] text-white flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-col items-center text-center"
      >
        <div className="p-4 rounded-2xl bg-white/5 border border-white/10 mb-5">
          <BrandLogo variant="light" size="lg" />
        </div>
        <p className="text-sm text-slate-300 tracking-wide">
          {siteData.tagline} · {siteData.academicYear}
        </p>

        <div className="mt-8 w-44 h-1.5 bg-white/15 rounded-full overflow-hidden">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{
              repeat: Infinity,
              duration: 1.1,
              ease: 'easeInOut',
            }}
            className="h-full w-1/2 bg-[#F5A623] rounded-full"
          />
        </div>
      </motion.div>
    </div>
  );
};
