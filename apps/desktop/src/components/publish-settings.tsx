import { Button } from "@lane4hq/ui/components/button";
import { Switch } from "@lane4hq/ui/components/switch";
import { RefreshCw } from "lucide-react";
import { useAccount } from "../state/account-context";
import { usePublish } from "../state/publish-context";
import { AccountRow, Row, useAction } from "./account-panel";
import { ChoiceSelect } from "./choice-select";

function HostTeamRow() {
  const {
    state: { settings, teams },
    actions: { refreshTeams },
  } = useAccount();
  const { actions } = usePublish();
  const { error, pending, run } = useAction();
  if (!settings?.account) return null;

  const hosts = (teams ?? []).filter((t) => t.canHostMeets);
  const items = [
    { value: "", label: teams ? "Choose a team" : "Loading teams…" },
    ...hosts.map((t) => ({ value: t.id, label: t.name })),
  ];
  if (settings.teamId && !hosts.some((t) => t.id === settings.teamId)) {
    items.push({ value: settings.teamId, label: settings.teamName });
  }
  return (
    <Row label="Hosting team" htmlFor="publish-team" error={error}>
      <div className="flex gap-2">
        <ChoiceSelect
          id="publish-team"
          value={settings.teamId}
          items={items}
          disabled={pending || !teams}
          onValueChange={(id) =>
            run(() =>
              actions.chooseTeam(hosts.find((t) => t.id === id) ?? null),
            )
          }
        />
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Reload teams"
          disabled={pending}
          onClick={() => run(refreshTeams)}
        >
          <RefreshCw />
        </Button>
      </div>
      {teams && hosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Only coaches can publish results. Ask a team owner to add you as a
          coach.
        </p>
      ) : null}
    </Row>
  );
}

function AutoPublishRow() {
  const {
    state: { settings },
    actions,
  } = usePublish();
  const { error, pending, run } = useAction();
  const canPublish = Boolean(settings?.account && settings.teamId);
  return (
    <Row label="Publishing" htmlFor="publish-enabled" error={error}>
      <div className="flex items-center gap-2">
        <Switch
          id="publish-enabled"
          checked={Boolean(settings?.enabled)}
          disabled={pending || !canPublish}
          onCheckedChange={(on) => run(() => actions.setEnabled(on))}
        />
        <span className="text-sm text-muted-foreground">
          {canPublish
            ? "Send verified heats automatically"
            : "Sign in and choose a team first"}
        </span>
      </div>
    </Row>
  );
}

export function PublishSettingsPanel() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border p-4">
      <AccountRow />
      <HostTeamRow />
      <AutoPublishRow />
    </div>
  );
}
