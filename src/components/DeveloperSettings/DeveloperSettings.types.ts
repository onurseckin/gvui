export type DeveloperSettingsTab = "local-storage" | "sqlite-db" | "database";

export interface DeveloperSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onClearStorage?: () => void;
}
