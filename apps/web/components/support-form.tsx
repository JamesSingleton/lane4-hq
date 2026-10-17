"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lane4hq/ui/components/alert";
import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { Spinner } from "@lane4hq/ui/components/spinner";
import { Textarea } from "@lane4hq/ui/components/textarea";
import { useActionState } from "react";
import { type SupportState, sendSupportMessage } from "@/app/support/actions";

const initial: SupportState = {};

export function SupportForm() {
  const [state, action, pending] = useActionState(sendSupportMessage, initial);

  if (state.success) {
    return (
      <Alert>
        <AlertTitle>Message received</AlertTitle>
        <AlertDescription>
          We&apos;ll reply to the email you entered.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Could not send</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            minLength={2}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="message">Message</FieldLabel>
          <Textarea id="message" name="message" required minLength={10} />
          <FieldDescription>
            A file that would not import, a billing question, or a meet week
            that broke.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="submit" className="press-scale w-fit" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Send message
      </Button>
    </form>
  );
}
