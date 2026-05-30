import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  Download,
  ImageIcon,
  Moon,
  Pencil,
  Settings,
  Sun,
  Upload,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconCustomizer } from "@/components/IconCustomizer";

import {
  useAnimationMultiplier,
  useAnimationSpeed,
  useSetAnimationSpeed,
  type AnimationSpeed,
} from "@/stores/uiPrefsStore";
import {
  ACCENTS,
  useAccent,
  useSetAccent,
  type AccentId,
} from "@/stores/accentStore";
import {
  useBookmarkActions,
  useCategories,
} from "@/stores/bookmarksStore";
import { useAllIconOverrides } from "@/stores/iconOverridesStore";
import type { Theme } from "@/stores/themeStore";

interface SettingsMenuProps {
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
}

export function SettingsMenu({ onExport, onImport, theme, onToggleTheme }: SettingsMenuProps) {
  const animationMultiplier = useAnimationMultiplier();
  const animationSpeed = useAnimationSpeed();
  const setAnimationSpeed = useSetAnimationSpeed();
  const accent = useAccent();
  const setAccent = useSetAccent();
  const categories = useCategories();
  const { updateCategory } = useBookmarkActions();
  const overrides = useAllIconOverrides();
  const overrideCount = Object.keys(overrides).length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconCustomizerOpen, setIconCustomizerOpen] = useState(false);

  const openIconCustomizer = useCallback(() => {
    // Close the settings dialog before opening the customizer so the user
    // sees one focused surface instead of stacked modals.
    setSettingsOpen(false);
    // Defer to the next frame so Radix's exit animation can complete and
    // focus management hands off cleanly to the new dialog.
    requestAnimationFrame(() => setIconCustomizerOpen(true));
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          await onImport(file);
          setImportSuccess(true);
          setTimeout(() => setImportSuccess(false), 1500);
        } catch {
          // toast is fired by the caller
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [onImport],
  );

  const handleExport = useCallback(() => {
    onExport();
    setExportSuccess(true);
    setTimeout(() => setExportSuccess(false), 1500);
  }, [onExport]);

  const startEdit = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId && editValue.trim()) {
      updateCategory(editingId, { name: editValue.trim() });
    }
    setEditingId(null);
    setEditValue("");
  }, [editingId, editValue, updateCategory]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue("");
  }, []);

  return (
    <>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogTrigger asChild>
          <motion.button
            type="button"
            aria-label="Open settings"
            className="h-11 w-11 sm:h-12 sm:w-12 md:h-14 md:w-14 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Settings className="h-5 w-5 sm:h-6 sm:w-6 md:h-7 md:w-7" />
          </motion.button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Theme */}
          <section className="space-y-4">
            <h4 className="font-medium leading-none">Appearance</h4>
            <div className="flex items-center justify-between">
              <Label htmlFor="theme-toggle">Theme</Label>
              <Button
                id="theme-toggle"
                type="button"
                variant="outline"
                size="sm"
                onClick={onToggleTheme}
                className="w-32"
              >
                {theme === "light" ? (
                  <>
                    <Sun className="mr-2 h-4 w-4" />
                    Light
                  </>
                ) : (
                  <>
                    <Moon className="mr-2 h-4 w-4" />
                    Dark
                  </>
                )}
              </Button>
            </div>

            {/* Accent color — swatches share width with the theme row above
                so the section reads as one cohesive Appearance block.
                Each chip is keyboard-focusable; the active one shows a
                checkmark and a soft ring matching its own hue. */}
            <div className="flex items-center justify-between gap-3">
              <Label className="shrink-0">Accent</Label>
              <div
                role="radiogroup"
                aria-label="Accent color"
                className="flex items-center gap-2"
              >
                {Object.values(ACCENTS).map((option) => {
                  const selected = option.id === accent;
                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => setAccent(option.id as AccentId)}
                      className="relative h-8 w-8 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      style={{
                        backgroundColor: option.hex,
                        boxShadow: selected
                          ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${option.hex}`
                          : "0 1px 2px rgba(0,0,0,0.1)",
                      }}
                      whileHover={{ scale: 1.08 }}
                      whileTap={{ scale: 0.92 }}
                      transition={{
                        type: "spring",
                        stiffness: 400 / animationMultiplier,
                        damping: 17,
                      }}
                    >
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            key="check"
                            className="absolute inset-0 flex items-center justify-center text-white"
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.6 }}
                            transition={{
                              duration: 0.15 * animationMultiplier,
                            }}
                          >
                            <Check
                              className="h-4 w-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]"
                              aria-hidden
                            />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Animation speed */}
          <section className="space-y-4">
            <h4 className="font-medium leading-none">Animation Speed</h4>
            <RadioGroup
              value={animationSpeed}
              onValueChange={(v) => setAnimationSpeed(v as AnimationSpeed)}
              className="grid grid-cols-3 gap-4"
            >
              {(["fast", "normal", "relaxed"] as const).map((speed) => (
                <div key={speed}>
                  <RadioGroupItem value={speed} id={speed} className="peer sr-only" />
                  <Label
                    htmlFor={speed}
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 capitalize hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                  >
                    {speed}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </section>

          {/* Categories */}
          <section className="space-y-3">
            <h4 className="font-medium leading-none">Categories</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {categories.map((cat, index) => (
                <motion.div
                  key={cat.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: index * 0.04 * animationMultiplier,
                    type: "spring",
                    stiffness: 300 / animationMultiplier,
                    damping: 25,
                  }}
                  layout
                >
                  <AnimatePresence mode="wait">
                    {editingId === cat.id ? (
                      <motion.div
                        key="edit"
                        className="flex items-center gap-2 flex-1"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 * animationMultiplier }}
                      >
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-8 flex-1"
                          autoFocus
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={saveEdit}
                          aria-label="Save category name"
                        >
                          <Check className="h-4 w-4 text-green-500" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={cancelEdit}
                          aria-label="Cancel edit"
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="view"
                        className="flex items-center gap-2 flex-1"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.15 * animationMultiplier }}
                      >
                        <span className="flex-1 text-sm truncate">
                          {cat.emoji} {cat.name}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => startEdit(cat.id, cat.name)}
                          aria-label={`Rename ${cat.name}`}
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Site Icons */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium leading-none">Site Icons</h4>
              {overrideCount > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {overrideCount} customized
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Pick the favicon variant shown for each site, or fall back to the
              letter avatar.
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start"
              onClick={openIconCustomizer}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              Customize site icons
            </Button>
          </section>

          {/* Data */}
          <section className="space-y-4">
            <h4 className="font-medium leading-none">Data Management</h4>
            <div className="flex gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
                aria-hidden
              />
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={handleExport}
              >
                {exportSuccess ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    Exported
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Export
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => fileInputRef.current?.click()}
              >
                {importSuccess ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    Imported
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Import
                  </>
                )}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>

      <IconCustomizer
        isOpen={iconCustomizerOpen}
        onClose={() => setIconCustomizerOpen(false)}
      />
    </>
  );
}
