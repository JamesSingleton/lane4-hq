import { Avatar, AvatarFallback } from "@lane4hq/ui/components/avatar";
import { Badge } from "@lane4hq/ui/components/badge";
import { Button } from "@lane4hq/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@lane4hq/ui/components/dialog";
import { Label } from "@lane4hq/ui/components/label";
import { Spinner } from "@lane4hq/ui/components/spinner";
import { CircleUserRound, ExternalLink, LogIn, LogOut } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { errorMessage, isTauri } from "../lib/native";
import { type SignInFlow, useAccount } from "../state/account-context";

/** Runs an async action with a pending flag and an inline error. */
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  }
  return { error, pending, run };
}

function InlineError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}

export function Row({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[9rem_1fr] sm:items-center sm:gap-4">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      <div className="flex min-w-0 flex-col gap-1.5">
        {children}
        <InlineError>{error}</InlineError>
      </div>
    </div>
  );
}

function initials(name: string, email: string) {
  const [first = "", second = ""] = (name || email).trim().split(/\s+/);
  return (first.charAt(0) + second.charAt(0) || "?").toUpperCase();
}

/** Signed out: one clear way in, and a way to make an account. */
function SignedOut({ outcome }: { outcome: SignInFlow | null }) {
  const {
    state: { error: accountError },
    actions,
  } = useAccount();
  const { error, pending, run } = useAction();
  return (
    <div className="flex flex-col gap-3">
      {outcome && outcome.status !== "waiting" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          {outcome.status === "denied"
            ? "Sign-in was denied in the browser."
            : "That code expired before it was approved."}
        </p>
      ) : null}
      <Button
        disabled={pending}
        onClick={() => run(actions.startSignIn)}
        className="w-full"
      >
        {pending ? <Spinner /> : <LogIn />}
        {pending
          ? "Opening your browser…"
          : outcome
            ? "Try again"
            : "Sign in with your browser"}
      </Button>
      <InlineError>{error ?? accountError}</InlineError>
      <p className="text-center text-sm text-muted-foreground">
        New to Lane4?{" "}
        <button
          type="button"
          className="font-medium text-foreground underline-offset-4 hover:underline"
          onClick={() => run(actions.openSignUp)}
        >
          Create an account
        </button>
      </p>
    </div>
  );
}

/** While the browser approval is pending; the browser hands back on approval. */
function WaitingForApproval({ userCode }: { userCode: string }) {
  const { actions } = useAccount();
  const { error, pending, run } = useAction();
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <Spinner className="size-5 text-muted-foreground" />
      <div className="flex flex-col gap-1" aria-live="polite">
        <p className="font-medium">Finish signing in in your browser</p>
        <p className="text-sm text-balance text-muted-foreground">
          Approve this computer there and Lane4 picks up on its own.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        The browser shows code{" "}
        <span className="font-mono font-medium tracking-wider text-foreground">
          {userCode}
        </span>
      </p>
      <div className="flex justify-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(actions.reopenSignIn)}
        >
          <ExternalLink />
          Open browser again
        </Button>
        <Button size="sm" variant="ghost" onClick={actions.cancelSignIn}>
          Cancel
        </Button>
      </div>
      <InlineError>{error}</InlineError>
    </div>
  );
}

/** Who is signed in, with a way out. */
function AccountIdentity() {
  const {
    state: { settings },
    actions,
  } = useAccount();
  const { error, pending, run } = useAction();
  const user = settings?.account;
  if (!user) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>{initials(user.name, user.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{user.name || user.email}</p>
          {user.name ? (
            <p className="truncate text-sm text-muted-foreground">
              {user.email}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(actions.signOut)}
        >
          <LogOut />
          Sign out
        </Button>
      </div>
      <InlineError>{error}</InlineError>
    </div>
  );
}

/** The signed-in user's teams and whether each can publish. */
function TeamList() {
  const {
    state: { teams },
  } = useAccount();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Teams</p>
      {teams === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-3.5" /> Loading teams…
        </p>
      ) : teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You aren't on a team yet. Ask a team owner to invite you.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {teams.map((team) => (
            <li
              key={team.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="truncate">{team.name}</span>
              <Badge variant={team.canHostMeets ? "secondary" : "outline"}>
                {team.canHostMeets ? "Can publish" : "View only"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact account status for the meet's publish settings. */
export function AccountRow() {
  const {
    state: { settings, signIn },
  } = useAccount();
  let body: ReactNode;
  if (settings?.account) {
    body = <AccountIdentity />;
  } else if (signIn?.status === "waiting") {
    body = <WaitingForApproval userCode={signIn.userCode} />;
  } else {
    body = <SignedOut outcome={signIn} />;
  }
  return <Row label="Account">{body}</Row>;
}

function dialogCopy(signedIn: boolean, signIn: SignInFlow | null) {
  if (signedIn)
    return {
      title: "Lane4 account",
      description: "Verified heats publish to live results for these teams.",
    };
  if (signIn?.status === "waiting")
    return {
      title: "Sign in to Lane4",
      description: "Your browser opened Lane4.",
    };
  return {
    title: "Sign in to Lane4",
    description:
      "Sign in to publish live results. Meets still run without an account or a connection.",
  };
}

/** The home screen's account button and its dialog. */
export function AccountButton() {
  const [open, setOpen] = useState(false);
  const {
    state: { settings, signIn },
  } = useAccount();
  if (!isTauri()) return null;

  const user = settings?.account;
  const waiting = signIn?.status === "waiting";
  const copy = dialogCopy(Boolean(user), signIn);
  return (
    <>
      <Button
        size="sm"
        variant={user ? "ghost" : "outline"}
        onClick={() => setOpen(true)}
      >
        {user ? <CircleUserRound /> : waiting ? <Spinner /> : <LogIn />}
        <span className="max-w-40 truncate">
          {user
            ? user.name || user.email
            : waiting
              ? "Finish signing in"
              : "Sign in"}
        </span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          {user ? (
            <div className="flex flex-col gap-5">
              <AccountIdentity />
              <TeamList />
            </div>
          ) : waiting ? (
            <WaitingForApproval userCode={signIn.userCode} />
          ) : (
            <SignedOut outcome={signIn} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
