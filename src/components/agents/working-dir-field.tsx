"use client";

import { isTauri } from "@tauri-apps/api/core";
import { FolderOpenIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface WorkingDirFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputClassName?: string;
  /** Match the compact h-7 inputs used in settings. */
  compact?: boolean;
}

/**
 * Working-directory input with a native folder picker (Tauri dialog plugin).
 * In a plain browser the picker button is hidden and it degrades to a text input.
 */
export function WorkingDirField({ id, value, onChange, placeholder, inputClassName, compact }: WorkingDirFieldProps) {
  const t = useTranslations("agents");

  const pickDirectory = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: value.trim() || undefined,
      title: t("pickWorkingDir"),
    });
    if (typeof selected === "string") onChange(selected);
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn("font-mono text-xs", inputClassName)}
      />
      {isTauri() && (
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-xs" : "icon"}
          title={t("pickWorkingDir")}
          onClick={pickDirectory}
        >
          <FolderOpenIcon className={compact ? "size-3.5" : "size-4"} />
        </Button>
      )}
    </div>
  );
}
