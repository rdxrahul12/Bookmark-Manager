import { useRef, useState } from "react";
import { Download, Upload, Check, Settings, Moon, Sun, Pencil, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiPreferences } from "@/contexts/UiPreferencesContext";
import { Category } from "@/types/bookmark";

interface SettingsMenuProps {
    onExport: () => void;
    onImport: (file: File) => Promise<void>;
    theme: "light" | "dark";
    onToggleTheme: () => void;
    categories: Category[];
    onUpdateCategory: (id: string, updates: Partial<Category>) => void;
}

export function SettingsMenu({ onExport, onImport, theme, onToggleTheme, categories, onUpdateCategory }: SettingsMenuProps) {
    const { animationSpeed, setAnimationSpeed, animationMultiplier } = useUiPreferences();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importSuccess, setImportSuccess] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                await onImport(file);
                setImportSuccess(true);
                setTimeout(() => setImportSuccess(false), 1500);
            } catch (error) {
                console.error("Import failed:", error);
            }
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleExport = () => {
        onExport();
        setExportSuccess(true);
        setTimeout(() => setExportSuccess(false), 1500);
    };

    const startEdit = (category: Category) => {
        setEditingId(category.id);
        setEditValue(category.name);
    };

    const saveEdit = () => {
        if (editingId && editValue.trim()) {
            onUpdateCategory(editingId, { name: editValue.trim() });
        }
        setEditingId(null);
        setEditValue("");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue("");
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                <motion.button
                    className="h-14 w-14 rounded-full flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                >
                    <Settings className="h-7 w-7" />
                </motion.button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Theme Section */}
                    <div className="space-y-4">
                        <h4 className="font-medium leading-none">Appearance</h4>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="theme-toggle">Theme</Label>
                            <Button
                                id="theme-toggle"
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
                    </div>

                    {/* UI Options Section */}
                    <div className="space-y-4">
                        <h4 className="font-medium leading-none">Animation Speed</h4>
                        <RadioGroup
                            defaultValue={animationSpeed}
                            onValueChange={(value) => setAnimationSpeed(value as "fast" | "normal" | "relaxed")}
                            className="grid grid-cols-3 gap-4"
                        >
                            <div>
                                <RadioGroupItem value="fast" id="fast" className="peer sr-only" />
                                <Label
                                    htmlFor="fast"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                >
                                    Fast
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="normal" id="normal" className="peer sr-only" />
                                <Label
                                    htmlFor="normal"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                >
                                    Normal
                                </Label>
                            </div>
                            <div>
                                <RadioGroupItem value="relaxed" id="relaxed" className="peer sr-only" />
                                <Label
                                    htmlFor="relaxed"
                                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                >
                                    Relaxed
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Categories Section */}
                    <div className="space-y-3">
                        <h4 className="font-medium leading-none">Categories</h4>
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {categories.map((cat, index) => (
                                <motion.div
                                    key={cat.id}
                                    className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 * animationMultiplier, type: "spring", stiffness: 300 / animationMultiplier, damping: 25 }}
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
                                                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                                                    className="h-8 flex-1"
                                                    autoFocus
                                                />
                                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveEdit}>
                                                        <Check className="h-4 w-4 text-green-500" />
                                                    </Button>
                                                </motion.div>
                                                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEdit}>
                                                        <X className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </motion.div>
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
                                                <span className="flex-1 text-sm truncate">{cat.name}</span>
                                                <motion.div whileHover={{ scale: 1.15, rotate: 15 }} whileTap={{ scale: 0.9 }}>
                                                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(cat)}>
                                                        <Pencil className="h-4 w-4 text-muted-foreground" />
                                                    </Button>
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Data Section */}
                    <div className="space-y-4">
                        <h4 className="font-medium leading-none">Data Management</h4>
                        <div className="flex gap-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            <Button variant="outline" className="flex-1" onClick={handleExport}>
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
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

