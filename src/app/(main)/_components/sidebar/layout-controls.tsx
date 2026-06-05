"use client";

import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/hooks/use-theme";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import type { ThemeMode } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function LayoutControls() {
  const { setTheme } = useTheme();
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const onThemeModeChange = (mode: ThemeMode | "") => {
    if (!mode) return;
    setTheme(mode);
    setThemeMode(mode);
    void persistPreference("theme_mode", mode);
  };

  const handleRestore = () => {
    onThemeModeChange(PREFERENCE_DEFAULTS.theme_mode);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon">
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-5">
          <div className="space-y-1.5">
            <h4 className="font-medium text-sm leading-none">Preferences</h4>
            <p className="text-muted-foreground text-xs">Customize your dashboard layout preferences.</p>
          </div>
          <div className="space-y-3 **:data-[slot=toggle-group]:w-full **:data-[slot=toggle-group-item]:flex-1 **:data-[slot=toggle-group-item]:text-xs">
            <div className="space-y-1">
              <Label className="font-medium text-xs">Theme Mode</Label>
              <ToggleGroup
                size="sm"
                variant="outline"
                type="single"
                value={themeMode}
                onValueChange={onThemeModeChange}
              >
                <ToggleGroupItem value="light" aria-label="Toggle light">
                  Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" aria-label="Toggle dark">
                  Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" aria-label="Toggle system">
                  System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={handleRestore}>
              Restore Defaults
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
