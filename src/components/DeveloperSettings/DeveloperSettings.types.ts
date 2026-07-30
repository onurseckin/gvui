export type DeveloperSettingsTab = "local-storage";

export interface DeveloperSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onClearStorage?: () => void;
}
