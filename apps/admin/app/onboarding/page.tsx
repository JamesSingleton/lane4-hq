"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { authClient, organization, useSession } from "@lane4hq/auth/client";
import { PLAN_LIMITS, type PlanTier } from "@lane4hq/swim-core/plans";
import { TEAM_TYPES } from "@lane4hq/swim-core/team-types";
import { Avatar, AvatarFallback } from "@lane4hq/ui/components/avatar";
import { Button } from "@lane4hq/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@lane4hq/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import { cn } from "@lane4hq/ui/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  ChevronRight,
  CreditCard,
  UserRound,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { uploadTeamLogoAction } from "@/app/team/[teamId]/settings/actions";
import { useAnalytics } from "@/components/analytics-provider";
import {
  BILLING_STEP_FIELDS,
  COACH_STEP_FIELDS,
  type OnboardingFormValues,
  onboardingFormSchema,
  TEAM_STEP_FIELDS,
} from "@/schemas";
import { updateOnboardingCoachAction } from "./actions";
import { OnboardingIllustration } from "./onboarding-illustration";

const LOGO_ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/svg+xml";

type StepId = "team" | "coach" | "billing";

const STEPS = [
  {
    id: "team" as const,
    label: "Team",
    description: "Name, type & logo",
    icon: Building2,
    fields: TEAM_STEP_FIELDS,
  },
  {
    id: "coach" as const,
    label: "Coach",
    description: "Your profile",
    icon: UserRound,
    fields: COACH_STEP_FIELDS,
  },
  {
    id: "billing" as const,
    label: "Billing",
    description: "Choose a plan",
    icon: CreditCard,
    fields: BILLING_STEP_FIELDS,
  },
] as const;

const PLAN_OPTIONS: {
  value: PlanTier;
  price: string;
  blurb: string;
}[] = [
  {
    value: "free",
    price: "$0/month",
    blurb: `Unlimited swimmers · ${PLAN_LIMITS.free.maxCoaches} coach · SWIMS · ${PLAN_LIMITS.free.aiGenerationsIncluded} relay/workout suggestions/mo`,
  },
  {
    value: "pro",
    price: "Pro",
    blurb: `Unlimited swimmers · ${PLAN_LIMITS.pro.maxCoaches} coaches · lineup suggestions`,
  },
  {
    value: "enterprise",
    price: "Enterprise",
    blurb: "Unlimited swimmers & coaches · SWIMS sync",
  },
];

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function BrandMark() {
  return (
    <Link href="/sign-in" className="flex items-center gap-3" prefetch={false}>
      <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-full">
        <Waves className="size-4" />
      </div>
      <span className="text-xl font-bold">Lane4 HQ</span>
    </Link>
  );
}

function Stepper({
  stepId,
  onStepClick,
}: {
  stepId: StepId;
  onStepClick: (id: StepId) => void;
}) {
  const currentIndex = STEPS.findIndex((s) => s.id === stepId);

  return (
    <nav aria-label="Onboarding steps">
      <ol className="flex items-center justify-between gap-y-4 max-md:flex-col max-md:items-start xl:gap-x-8">
        {STEPS.flatMap((item, index) => {
          const Icon = item.icon;
          const active = stepId === item.id;
          const done = index < currentIndex;
          const nodes = [];
          if (index > 0) {
            nodes.push(
              <li key={`sep-${item.id}`} className="max-md:hidden" aria-hidden>
                <ChevronRight className="text-foreground size-4" />
              </li>,
            );
          }
          nodes.push(
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onStepClick(item.id)}
                className="flex h-auto shrink-0 cursor-pointer items-center gap-2 rounded-md bg-transparent p-0"
              >
                <Avatar
                  className={cn(
                    "size-9 after:border-none",
                    active || done
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-foreground",
                  )}
                >
                  <AvatarFallback
                    className={cn(
                      "*:[svg]:size-4",
                      active || done
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-transparent text-foreground",
                    )}
                  >
                    <Icon />
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-left">
                  <span className="text-base font-medium">{item.label}</span>
                  <span className="text-muted-foreground text-sm">
                    {item.description}
                  </span>
                </div>
              </button>
            </li>,
          );
          return nodes;
        })}
      </ol>
    </nav>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const analytics = useAnalytics();
  const { data: session } = useSession();
  const [stepId, setStepId] = useState<StepId>("team");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingFormSchema),
    defaultValues: {
      teamName: "",
      teamType: "club",
      coachFirstName: "",
      coachLastName: "",
      coachTitle: "",
      plan: "free",
    },
    mode: "onTouched",
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    trigger,
    formState: { errors, isSubmitting },
  } = form;

  const stepIndex = STEPS.findIndex((s) => s.id === stepId);
  const teamType = watch("teamType");
  const selectedType = TEAM_TYPES.find((t) => t.value === teamType);

  useEffect(() => {
    const firstName = session?.user?.firstName?.trim();
    const lastName = session?.user?.lastName?.trim();
    if (firstName && !getValues("coachFirstName")) {
      setValue("coachFirstName", firstName);
    }
    if (lastName && !getValues("coachLastName")) {
      setValue("coachLastName", lastName);
    }
  }, [session?.user?.firstName, session?.user?.lastName, setValue, getValues]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function goToStep(next: StepId) {
    setSubmitError("");
    const nextIndex = STEPS.findIndex((s) => s.id === next);
    if (nextIndex > stepIndex) {
      for (let i = stepIndex; i < nextIndex; i++) {
        const fields = STEPS[i]?.fields;
        if (!fields) continue;
        const valid = await trigger([...fields]);
        if (!valid) {
          setStepId(STEPS[i]!.id);
          return;
        }
      }
    }
    setStepId(next);
  }

  async function goNext() {
    const fields = STEPS[stepIndex]?.fields;
    if (fields) {
      const valid = await trigger([...fields]);
      if (!valid) return;
    }
    const next = STEPS[stepIndex + 1];
    if (next) setStepId(next.id);
  }

  function goPrev() {
    setSubmitError("");
    const prev = STEPS[stepIndex - 1];
    if (prev) setStepId(prev.id);
  }

  async function onSubmit(values: OnboardingFormValues) {
    setSubmitError("");

    const baseSlug = slugify(values.teamName) || "team";
    let slug = baseSlug;
    let result = await organization.create({
      name: values.teamName.trim(),
      slug,
      teamType: values.teamType,
    });

    if (result.error?.message?.toLowerCase().includes("slug")) {
      slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
      result = await organization.create({
        name: values.teamName.trim(),
        slug,
        teamType: values.teamType,
      });
    }

    if (result.error) {
      setSubmitError(result.error.message ?? "Failed to create team");
      return;
    }

    const teamId = result.data?.id;
    if (!teamId) {
      setSubmitError("Failed to create team");
      return;
    }

    if (session?.user?.id) analytics.identify(session.user.id);
    analytics.group(teamId);
    analytics.capture("team_created");

    await organization.setActive({ organizationId: teamId });

    const coachResult = await updateOnboardingCoachAction({
      teamId,
      firstName: values.coachFirstName,
      lastName: values.coachLastName,
      title: values.coachTitle,
    });
    if (!coachResult.ok) {
      setSubmitError(coachResult.error);
      router.push(`/team/${teamId}/settings`);
      router.refresh();
      return;
    }

    let logoWarning = false;
    if (logoFile) {
      const formData = new FormData();
      formData.set("logo", logoFile);
      const upload = await uploadTeamLogoAction(teamId, formData);
      if (!upload.ok) logoWarning = true;
    }

    if (values.plan === "pro" || values.plan === "enterprise") {
      try {
        await authClient.checkout({
          slug: values.plan,
          reference_id: teamId,
        });
        return;
      } catch {
        // Billing can be completed later in settings
      }
    }

    const dest = logoWarning
      ? `/team/${teamId}/settings?logoError=1`
      : `/team/${teamId}`;
    router.push(dest);
  }

  return (
    <div className="flex size-full min-h-dvh flex-col lg:grid lg:grid-cols-12">
      <div className="bg-muted flex flex-col overflow-hidden max-lg:hidden lg:col-span-4">
        <div className="flex items-start p-6">
          <BrandMark />
        </div>
        <div className="flex size-full items-center justify-center p-6">
          <OnboardingIllustration className="max-h-[min(641px,70dvh)] w-auto" />
        </div>
      </div>

      <div className="flex items-start p-4 sm:p-6 lg:hidden">
        <BrandMark />
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 lg:col-span-8 lg:p-8">
        <form
          className="flex w-full max-w-3xl flex-col gap-12"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <Stepper stepId={stepId} onStepClick={goToStep} />

          <FieldGroup className="gap-6">
            {submitError ? <FieldError>{submitError}</FieldError> : null}

            {stepId === "team" ? (
              <FieldSet>
                <FieldLegend>Team</FieldLegend>
                <FieldDescription>
                  Set up your swim team workspace. You can change these later in
                  settings.
                </FieldDescription>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <Field
                    className="sm:col-span-2"
                    data-invalid={!!errors.teamName}
                  >
                    <FieldLabel htmlFor="teamName">Team name</FieldLabel>
                    <Input
                      id="teamName"
                      placeholder="FAST Swim Club"
                      aria-invalid={!!errors.teamName}
                      {...register("teamName")}
                    />
                    <FieldError>{errors.teamName?.message}</FieldError>
                  </Field>

                  <Field
                    className="sm:col-span-2"
                    data-invalid={!!errors.teamType}
                  >
                    <FieldLabel htmlFor="teamType">Team type</FieldLabel>
                    <Controller
                      control={control}
                      name="teamType"
                      render={({ field }) => (
                        <Select
                          items={TEAM_TYPES}
                          value={field.value}
                          onValueChange={(v) => {
                            if (v != null) field.onChange(v);
                          }}
                        >
                          <SelectTrigger
                            id="teamType"
                            className="w-full"
                            aria-invalid={!!errors.teamType}
                          >
                            <SelectValue placeholder="Select team type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {TEAM_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {selectedType ? (
                      <FieldDescription>
                        {selectedType.description}
                      </FieldDescription>
                    ) : null}
                    <FieldError>{errors.teamType?.message}</FieldError>
                  </Field>

                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="teamLogo">
                      Team logo (optional)
                    </FieldLabel>
                    <div className="flex w-full items-center gap-3">
                      <div className="bg-muted flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border">
                        {logoPreview ? (
                          <img
                            src={logoPreview}
                            alt="Logo preview"
                            className="size-full object-cover"
                          />
                        ) : (
                          <Waves className="text-muted-foreground size-6" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Input
                          id="teamLogo"
                          type="file"
                          accept={LOGO_ACCEPT}
                          onChange={(e) => {
                            setLogoFile(e.target.files?.[0] ?? null);
                          }}
                        />
                        <FieldDescription>
                          JPEG, PNG, WebP, AVIF, or SVG · max 2 MB
                        </FieldDescription>
                      </div>
                    </div>
                  </Field>
                </div>
              </FieldSet>
            ) : null}

            {stepId === "coach" ? (
              <FieldSet>
                <FieldLegend>Coach profile</FieldLegend>
                <FieldDescription>
                  Tell us who you are on the coaching staff. This shows up on
                  the roster and team invites.
                </FieldDescription>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <Field data-invalid={!!errors.coachFirstName}>
                    <FieldLabel htmlFor="coachFirstName">First name</FieldLabel>
                    <Input
                      id="coachFirstName"
                      placeholder="Alex"
                      autoComplete="given-name"
                      aria-invalid={!!errors.coachFirstName}
                      {...register("coachFirstName")}
                    />
                    <FieldError>{errors.coachFirstName?.message}</FieldError>
                  </Field>

                  <Field data-invalid={!!errors.coachLastName}>
                    <FieldLabel htmlFor="coachLastName">Last name</FieldLabel>
                    <Input
                      id="coachLastName"
                      placeholder="Rivera"
                      autoComplete="family-name"
                      aria-invalid={!!errors.coachLastName}
                      {...register("coachLastName")}
                    />
                    <FieldError>{errors.coachLastName?.message}</FieldError>
                  </Field>

                  <Field data-invalid={!!errors.coachTitle}>
                    <FieldLabel htmlFor="coachTitle">
                      Title (optional)
                    </FieldLabel>
                    <Input
                      id="coachTitle"
                      placeholder="Head Coach"
                      aria-invalid={!!errors.coachTitle}
                      {...register("coachTitle")}
                    />
                    <FieldDescription>
                      e.g. Head Coach, Age Group Coach, Assistant Coach
                    </FieldDescription>
                    <FieldError>{errors.coachTitle?.message}</FieldError>
                  </Field>
                </div>
              </FieldSet>
            ) : null}

            {stepId === "billing" ? (
              <FieldSet>
                <FieldLegend>Billing</FieldLegend>
                <FieldDescription>
                  Start free or upgrade when you create the team. You can change
                  plans later in settings.
                </FieldDescription>
                <Field data-invalid={!!errors.plan}>
                  <Controller
                    control={control}
                    name="plan"
                    render={({ field }) => (
                      <RadioGroup
                        value={field.value}
                        onValueChange={(v) => {
                          if (
                            v === "free" ||
                            v === "pro" ||
                            v === "enterprise"
                          ) {
                            field.onChange(v);
                          }
                        }}
                        className="grid gap-4 sm:grid-cols-3"
                      >
                        {PLAN_OPTIONS.map((option) => {
                          const selected = field.value === option.value;
                          const inputId = `plan-${option.value}`;
                          return (
                            <label
                              key={option.value}
                              htmlFor={inputId}
                              className={cn(
                                "border-border hover:border-primary/40 flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
                                selected &&
                                  "border-primary ring-primary/20 ring-2",
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium capitalize">
                                    {option.value}
                                  </p>
                                  <p className="text-muted-foreground text-sm">
                                    {option.price}
                                  </p>
                                </div>
                                <RadioGroupItem
                                  id={inputId}
                                  value={option.value}
                                />
                              </div>
                              <p className="text-muted-foreground text-sm text-pretty">
                                {option.blurb}
                              </p>
                            </label>
                          );
                        })}
                      </RadioGroup>
                    )}
                  />
                  <FieldError>{errors.plan?.message}</FieldError>
                </Field>
              </FieldSet>
            ) : null}

            <div className="flex justify-between gap-4">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={stepIndex === 0 || isSubmitting}
                onClick={goPrev}
              >
                <ArrowLeft data-icon="inline-start" />
                Previous
              </Button>
              {stepIndex < STEPS.length - 1 ? (
                <Button
                  key="next"
                  type="button"
                  size="lg"
                  disabled={isSubmitting}
                  onClick={goNext}
                >
                  Next
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : (
                <Button
                  key="submit"
                  type="submit"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Creating…" : "Create team"}
                  {!isSubmitting ? <ArrowRight data-icon="inline-end" /> : null}
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
      </div>
    </div>
  );
}
