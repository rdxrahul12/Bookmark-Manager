import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { globalIconEngine, makeAvatar, getDomain as engineGetDomain, IconResult } from "@/utils/icon-engine";

interface FaviconProps {
    url: string;
    title: string;
    size?: number;
    className?: string;
}

// Inline hook for integrating the new MV3 Engine into React state
export function useIcon(url: string) {
  const [state, setState] = useState<IconResult>(() => makeAvatar(engineGetDomain(url)));

  useEffect(() => {
    if (!url) return;
    setState(makeAvatar(engineGetDomain(url))); // instant placeholder

    globalIconEngine.fetchIcon(url).then(result => {
      setState(result);
    });
  }, [url]);

  return {
    dataUrl: state.dataUrl,
    quality: state.quality,
    source:  state.source,
    loading: state.source === 'generated-avatar',
  };
}

export function Favicon({ url, title, size = 40, className = "" }: FaviconProps) {
    const { animationMultiplier } = useUiPreferences();
    const { dataUrl, loading, source } = useIcon(url);

    const getIconContent = () => {
        // The generated-avatar itself is rendered into `dataUrl` so we can just use the img tag immediately!
        return (
            <img
                src={dataUrl}
                alt={`${title} favicon`}
                className={`w-full h-full object-contain p-[10%] drop-shadow-sm transition-opacity duration-300 ${loading ? 'opacity-80' : 'opacity-100'}`}
            />
        );
    };

    return (
        <motion.div
            className={`relative overflow-hidden bg-secondary/30 shrink-0 ${className} shadow-sm backdrop-blur-sm transition-shadow duration-300`}
            style={{ 
                width: size, 
                height: size, 
                borderRadius: `${size * 0.225}px` // Apple Squircle 22.5% ratio
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 * animationMultiplier }}
        >
            <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-zinc-800">
                {getIconContent()}
            </div>

            {/* Subtle Inner Border/Shadow for Consistency */}
            <div 
                className="absolute inset-0 ring-1 ring-black/5 dark:ring-white/10 pointer-events-none" 
                style={{ borderRadius: `${size * 0.225}px` }}
            />
        </motion.div>
    );
}
