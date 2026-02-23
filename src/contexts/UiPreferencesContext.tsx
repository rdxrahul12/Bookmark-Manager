import React, { createContext, useContext, useState, useEffect } from "react";

type AnimationSpeed = "fast" | "normal" | "relaxed";

interface UiPreferencesContextType {
    animationSpeed: AnimationSpeed;
    setAnimationSpeed: (speed: AnimationSpeed) => void;
    animationMultiplier: number; // For JS-based physics (framer-motion)
}

const UiPreferencesContext = createContext<UiPreferencesContextType | undefined>(undefined);

export const UiPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>(() => {
        const saved = localStorage.getItem("ui-animation-speed");
        return (saved as AnimationSpeed) || "normal";
    });

    const getMultiplier = (speed: AnimationSpeed) => {
        switch (speed) {
            case "fast": return 0.5;
            case "relaxed": return 2.0;
            default: return 1.0;
        }
    };

    const animationMultiplier = getMultiplier(animationSpeed);

    useEffect(() => {
        localStorage.setItem("ui-animation-speed", animationSpeed);

        // update CSS variables for global animation control if needed
        const root = document.documentElement;
        root.style.setProperty("--duration-factor", animationMultiplier.toString());

    }, [animationSpeed, animationMultiplier]);

    return (
        <UiPreferencesContext.Provider value={{
            animationSpeed,
            setAnimationSpeed,
            animationMultiplier
        }}>
            {children}
        </UiPreferencesContext.Provider>
    );
};

export const useUiPreferences = () => {
    const context = useContext(UiPreferencesContext);
    if (context === undefined) {
        throw new Error("useUiPreferences must be used within a UiPreferencesProvider");
    }
    return context;
};
