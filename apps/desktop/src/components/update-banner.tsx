import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import { Download } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  type AvailableUpdate,
  appUpdate,
  errorMessage,
  isTauri,
} from "../lib/native";

/**
 * Offers a newer Lane4 on the meets list only, so an update never restarts
 * the app in the middle of a session. Offline deck machines just see nothing.
 */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installing, startInstall] = useTransition();

  useEffect(() => {
    if (!isTauri()) return;
    appUpdate.check().then(setUpdate, () => {});
  }, []);

  if (!update || dismissed) return null;

  function install() {
    setError(null);
    startInstall(async () => {
      try {
        await appUpdate.install();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }

  return (
    <Alert>
      <Download />
      <AlertTitle>Lane4 {update.version} is available</AlertTitle>
      <AlertDescription>
        <p>
          {error ??
            update.notes ??
            `You have ${update.currentVersion}. Updating takes a minute and restarts the app; your meets stay on this computer.`}
        </p>
      </AlertDescription>
      <AlertAction className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={installing}
          onClick={() => setDismissed(true)}
        >
          Later
        </Button>
        <Button size="sm" disabled={installing} onClick={install}>
          {installing ? "Updating…" : "Update and restart"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
