import {
  Bell,
  FileText,
  HelpCircle,
  Home,
  Lock,
  Mail,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { ExpandableTabs } from "@tenas-ai/ui/expandable-tabs";

/** Default color demo. */
function DefaultDemo() {
  const tabs = [
    { title: "Dashboard", icon: Home },
    { title: "Notifications", icon: Bell },
    { type: "separator" as const },
    { title: "Settings", icon: Settings },
    { title: "Support", icon: HelpCircle },
    { title: "Security", icon: Shield },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ExpandableTabs tabs={tabs} />
    </div>
  );
}

/** Custom color demo. */
function CustomColorDemo() {
  const tabs = [
    { title: "Profile", icon: User },
    { title: "Messages", icon: Mail },
    { type: "separator" as const },
    { title: "Documents", icon: FileText },
    { title: "Privacy", icon: Lock },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ExpandableTabs
        tabs={tabs}
        activeColor="text-blue-500"
        className="border-blue-200 dark:border-blue-800"
      />
    </div>
  );
}

export { CustomColorDemo, DefaultDemo };
