export type AccessibilityTab = "audio" | "aria" | "soundboard" | "activity";

export interface AccessibilitySettingsProps {
  className?: string;
  isOpen?: boolean;
  onClose?: () => void;
}
