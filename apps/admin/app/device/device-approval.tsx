"use client";

import { device } from "@lane4hq/auth/client";
import { deviceClient } from "@lane4hq/auth/device-clients";
import { Button } from "@lane4hq/ui/components/button";
import { Input } from "@lane4hq/ui/components/input";
import { Label } from "@lane4hq/ui/components/label";
import { useId, useState, useTransition } from "react";

/** A looked-up code: the app asking to sign in, or why it can't. */
export type DeviceRequest =
  | { code: string; app: string; returnUrl: string | null }
  | { error: string };

type Decision = { approved: boolean; app: string; returnUrl: string | null };

const ALREADY_USED =
  "This code was already used. Start sign-in again in the app.";

function message(error: { message?: string; error_description?: string }) {
  return (
    error.error_description ??
    error.message ??
    "That code didn't work. Check it and try again."
  );
}

export function DeviceApproval({
  initialCode,
  initialRequest,
  email,
}: {
  initialCode: string;
  initialRequest: DeviceRequest | null;
  email: string;
}) {
  const inputId = useId();
  const [code, setCode] = useState(initialCode);
  const [request, setRequest] = useState(initialRequest);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [actionError, setActionError] = useState("");
  const [pending, startTransition] = useTransition();

  function lookUp(userCode: string) {
    startTransition(async () => {
      const result = await device({ query: { user_code: userCode } });
      if (result.error) {
        setRequest({ error: message(result.error) });
      } else if (result.data.status !== "pending") {
        setRequest({ error: ALREADY_USED });
      } else {
        const client = deviceClient(
          (result.data as { client_id?: string }).client_id,
        );
        setRequest({
          code: userCode,
          app: client.name,
          returnUrl: client.returnUrl,
        });
      }
    });
  }

  function decide(approve: boolean) {
    if (!request || "error" in request) return;
    setActionError("");
    startTransition(async () => {
      const result = approve
        ? await device.approve({ userCode: request.code })
        : await device.deny({ userCode: request.code });
      if (result.error) {
        setActionError(message(result.error));
        return;
      }
      setDecision({
        approved: approve,
        app: request.app,
        returnUrl: request.returnUrl,
      });
      if (approve && request.returnUrl)
        window.location.href = request.returnUrl;
    });
  }

  if (decision) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">
          {decision.approved ? "You're signed in" : "Sign-in denied"}
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          {decision.approved
            ? `Go back to ${decision.app}. You can close this tab.`
            : `${decision.app} was not signed in. You can close this tab.`}
        </p>
        {decision.approved && decision.returnUrl ? (
          <Button
            className="mt-4"
            nativeButton={false}
            render={<a href={decision.returnUrl} />}
          >
            Open {decision.app}
          </Button>
        ) : null}
      </div>
    );
  }

  if (request && !("error" in request)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-2xl font-bold">Sign in {request.app}?</h1>
          <p className="text-muted-foreground text-sm text-balance">
            It will act as <span className="text-foreground">{email}</span> and
            can publish results for teams you coach. Only continue if you
            started this sign-in.
          </p>
        </div>
        <p className="bg-muted rounded-lg py-3 text-center font-mono text-xl tracking-[0.3em]">
          {request.code}
        </p>
        {actionError ? (
          <p role="alert" className="text-destructive text-center text-sm">
            {actionError}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button disabled={pending} onClick={() => decide(true)}>
            Approve
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => decide(false)}
          >
            Deny
          </Button>
        </div>
      </div>
    );
  }

  const error = request?.error;
  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const userCode = code.trim();
        if (userCode) lookUp(userCode);
      }}
    >
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold">Sign in a device</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Enter the code shown in the Lane4 app.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={inputId}>Code</Label>
        <Input
          id={inputId}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD-1234"
          className="font-mono tracking-widest"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        {error ? (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-destructive text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending || !code.trim()}>
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
