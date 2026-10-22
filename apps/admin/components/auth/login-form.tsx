"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { INVITE_REQUIRED_MESSAGE } from "@lane4hq/auth/beta-access";
import { signIn } from "@lane4hq/auth/client";
import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { cn } from "@lane4hq/ui/lib/utils";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { SocialAuthButtons } from "@/components/auth/social-auth-buttons";
import { getCallbackURL, invitationIdFromCallback } from "@/lib/auth-callback";
import type { SocialProvider } from "@/lib/auth-providers";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function authErrorFromSearch(params: Pick<URLSearchParams, "get">): string {
  const described = params.get("error_description");
  if (described) return described;
  const code = params.get("error");
  if (code === "INVITE_REQUIRED" || code === "unable_to_create_user") {
    return INVITE_REQUIRED_MESSAGE;
  }
  return "";
}

export function LoginForm({
  socialProviders = [],
  className,
  ...props
}: React.ComponentProps<"form"> & {
  socialProviders?: SocialProvider[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = getCallbackURL(searchParams);
  const [error, setError] = useState(() => authErrorFromSearch(searchParams));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const signUpHref = searchParams.get("callbackUrl")
    ? `/sign-up?callbackUrl=${encodeURIComponent(searchParams.get("callbackUrl")!)}`
    : "/sign-up";

  async function onSubmit(values: LoginFormValues) {
    setError("");

    const result = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: callbackUrl,
      fetchOptions: {
        query: Object.fromEntries(searchParams.entries()),
      },
    });

    if (result.error) {
      const code = result.error.code;
      if (code === "EMAIL_NOT_VERIFIED") {
        const checkEmail = new URL("/check-email", window.location.origin);
        checkEmail.searchParams.set("email", values.email);
        router.push(`${checkEmail.pathname}${checkEmail.search}`);
        return;
      }
      setError(result.error.message ?? "Sign in failed");
      return;
    }

    if (
      result.data &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect
    ) {
      router.push("/2fa");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <form
        {...props}
        method="post"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(onSubmit)(event);
        }}
      >
        <FieldGroup>
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Sign in to your account</h1>
            <p className="text-muted-foreground text-sm text-balance">
              Enter your email below to access your coach dashboard
            </p>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="coach@example.com"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-muted-foreground text-xs underline underline-offset-4"
                prefetch={false}
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </Field>
          <FieldDescription className="text-center">
            {invitationIdFromCallback(searchParams.get("callbackUrl") ?? "") ? (
              <>
                Don&apos;t have an account?{" "}
                <Link
                  href={signUpHref}
                  className="underline underline-offset-4"
                  prefetch={false}
                >
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Lane4 is in private beta.{" "}
                <Link
                  href="/sign-up"
                  className="underline underline-offset-4"
                  prefetch={false}
                >
                  You need an invitation
                </Link>
              </>
            )}
          </FieldDescription>
        </FieldGroup>
      </form>
      <SocialAuthButtons
        providers={socialProviders}
        callbackURL={callbackUrl}
        queryParams={searchParams}
      />
    </div>
  );
}
