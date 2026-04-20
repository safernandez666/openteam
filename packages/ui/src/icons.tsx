import {
  XMarkIcon,
  CheckIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  TrashIcon,
  BugAntIcon,
  SparklesIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  ClipboardDocumentListIcon,
  CodeBracketIcon,
  PaintBrushIcon,
  BeakerIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

// Re-export for consistent usage
export {
  XMarkIcon,
  CheckIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  TrashIcon,
  BugAntIcon,
  SparklesIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  ClipboardDocumentListIcon,
  CodeBracketIcon,
  PaintBrushIcon,
  BeakerIcon,
  MagnifyingGlassIcon,
};

const ICON_SIZE = { width: 16, height: 16 };

/** Close button icon (replaces &times;) */
export function CloseIcon({ size = 16 }: { size?: number }) {
  return <XMarkIcon width={size} height={size} />;
}

/** Check icon (replaces &#10003; / ✓) */
export function CheckmarkIcon({ size = 14 }: { size?: number }) {
  return <CheckIcon width={size} height={size} />;
}

/** Settings gear icon (replaces &#9881;) */
export function SettingsIcon({ size = 14 }: { size?: number }) {
  return <Cog6ToothIcon width={size} height={size} />;
}

/** Warning icon (replaces &#9888; / ⚠) */
export function WarningIcon({ size = 16 }: { size?: number }) {
  return <ExclamationTriangleIcon width={size} height={size} />;
}

/** Toast icons by type */
export function ToastIcon({ type, size = 14 }: { type: "success" | "error" | "warning" | "info"; size?: number }) {
  switch (type) {
    case "success": return <CheckCircleIcon width={size} height={size} />;
    case "error": return <ExclamationCircleIcon width={size} height={size} />;
    case "warning": return <ExclamationTriangleIcon width={size} height={size} />;
    case "info": return <InformationCircleIcon width={size} height={size} />;
  }
}

/** Workflow category icons (replaces emoji) */
export function WorkflowCategoryIcon({ category, size = 18 }: { category: string; size?: number }) {
  const props = { width: size, height: size };
  switch (category) {
    case "bug_fix": return <BugAntIcon {...props} />;
    case "feature": return <SparklesIcon {...props} />;
    case "quick_refinement": return <BoltIcon {...props} />;
    case "refactor": return <WrenchScrewdriverIcon {...props} />;
    case "security_audit": return <LockClosedIcon {...props} />;
    default: return <ClipboardDocumentListIcon {...props} />;
  }
}

/** Role icons (replaces emoji in NameEditor) */
export function RoleIcon({ role, size = 16 }: { role: string; size?: number }) {
  const props = { width: size, height: size };
  switch (role) {
    case "pm": return <ClipboardDocumentListIcon {...props} />;
    case "developer": return <CodeBracketIcon {...props} />;
    case "designer": return <PaintBrushIcon {...props} />;
    case "tester": return <BeakerIcon {...props} />;
    case "reviewer": return <MagnifyingGlassIcon {...props} />;
    default: return <CodeBracketIcon {...props} />;
  }
}
