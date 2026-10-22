import Link from "next/link";

export function PrivateBetaNotice({
  reason,
}: {
  reason: "missing" | "invalid";
}) {
  return (
    <div className="flex flex-col gap-4 text-center">
      <h1 className="text-2xl font-bold">Lane4 is in private beta</h1>
      <p className="text-muted-foreground text-sm text-balance">
        {reason === "invalid" ? (
          <>
            This invitation is invalid or expired. Ask the person who invited
            you to send a new one, or{" "}
            <Link
              href="/request-access"
              className="text-foreground underline underline-offset-4"
              prefetch={false}
            >
              request access
            </Link>
            .
          </>
        ) : (
          <>
            New accounts need an invitation.{" "}
            <Link
              href="/request-access"
              className="text-foreground underline underline-offset-4"
              prefetch={false}
            >
              Request access
            </Link>{" "}
            and tell us about your team, or ask a coach to invite you to their
            team.
          </>
        )}
      </p>
      <p className="text-sm">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="underline underline-offset-4"
          prefetch={false}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
