import { Waves } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { RequestAccessForm } from "./request-access-form";

export const metadata: Metadata = {
  title: "Request access",
  description:
    "Lane4 is in private beta. Tell us about your team and why you want to use it.",
};

export default function RequestAccessPage() {
  return (
    <div className="flex min-h-svh flex-col gap-6 p-6 md:p-10">
      <Link
        href="/sign-in"
        className="flex items-center gap-2 font-medium"
        prefetch={false}
      >
        <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
          <Waves className="size-4" />
        </span>
        Lane4 HQ
      </Link>
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-md">
          <RequestAccessForm />
        </div>
      </div>
    </div>
  );
}
