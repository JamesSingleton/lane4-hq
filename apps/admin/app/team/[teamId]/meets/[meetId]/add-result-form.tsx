"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { isRelayStroke } from "@lane4hq/swim-core/entry-limits";
import {
  RELAY_PRIMARY_LEG_COUNT,
  RELAY_TEAM_LETTERS,
  relayLegRoleLabel,
} from "@lane4hq/swim-core/relay-legs";
import { formatTypedSwimTime } from "@lane4hq/swim-core/times";
import { Button } from "@lane4hq/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lane4hq/ui/components/card";
import { Checkbox } from "@lane4hq/ui/components/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@lane4hq/ui/components/field";
import { Input } from "@lane4hq/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lane4hq/ui/components/select";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { LabeledCombobox } from "@/components/labeled-combobox";
import { addRelayResultAction, addResultAction } from "../actions";

export type ResultEventOption = {
  id: string;
  label: string;
  stroke: string;
  eventKey: string;
  distance: number;
};

export type ResultSwimmerOption = {
  swimmerId: string;
  membershipId: string;
  name: string;
};

export type RelayLineupPrefill = {
  meetEventId: string;
  relayLetter: string;
  legOrder: number;
  membershipId: string;
};

const ROUND_OPTIONS = [
  { value: "", label: "—" },
  { value: "prelim", label: "Prelim" },
  { value: "swimoff", label: "Swim-off" },
  { value: "finals", label: "Finals" },
] as const;

const addResultSchema = z
  .object({
    swimmerId: z.string(),
    membershipId: z.string(),
    meetEventId: z.string().min(1, "Select an event"),
    time: z.string().trim().min(1, "Time is required"),
    round: z.enum(["", "prelim", "swimoff", "finals"]),
    heat: z.string(),
    lane: z.string(),
    exhibition: z.boolean(),
    dqCode: z.string(),
    relayLetter: z.enum(["A", "B", "C"]),
    legOrder: z.string(),
    splitTime: z.string(),
  })
  .superRefine((values, ctx) => {
    const membershipId = values.membershipId.trim();
    const splitTime = values.splitTime.trim();
    if (membershipId && !splitTime) {
      ctx.addIssue({
        code: "custom",
        message: "Enter the swimmer's split",
        path: ["splitTime"],
      });
    }
    if (splitTime && !membershipId) {
      ctx.addIssue({
        code: "custom",
        message: "Select a swimmer for the split",
        path: ["membershipId"],
      });
    }
  });

type AddResultValues = z.infer<typeof addResultSchema>;

function optionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export function AddResultForm({
  teamId,
  meetId,
  events,
  swimmers,
  relayLineup,
}: {
  teamId: string;
  meetId: string;
  events: ResultEventOption[];
  swimmers: ResultSwimmerOption[];
  relayLineup: RelayLineupPrefill[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    register,
    handleSubmit,
    resetField,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddResultValues>({
    resolver: zodResolver(addResultSchema),
    defaultValues: {
      meetEventId: "",
      swimmerId: "",
      membershipId: "",
      time: "",
      round: "",
      heat: "",
      lane: "",
      exhibition: false,
      dqCode: "",
      relayLetter: "A",
      legOrder: "1",
      splitTime: "",
    },
  });

  const meetEventId = useWatch({ control, name: "meetEventId" });
  const relayLetter = useWatch({ control, name: "relayLetter" });
  const legOrder = useWatch({ control, name: "legOrder" });
  const membershipId = useWatch({ control, name: "membershipId" });

  const selectedEvent = events.find((event) => event.id === meetEventId);
  const isRelay = selectedEvent
    ? isRelayStroke(selectedEvent.stroke, selectedEvent.eventKey)
    : false;

  const eventItems = useMemo(
    () => events.map((event) => ({ value: event.id, label: event.label })),
    [events],
  );
  const swimmerItems = useMemo(
    () =>
      swimmers.map((swimmer) => ({
        value: isRelay ? swimmer.membershipId : swimmer.swimmerId,
        label: swimmer.name,
      })),
    [isRelay, swimmers],
  );

  const legItems = useMemo(() => {
    const stroke = selectedEvent?.stroke ?? "free_relay";
    return Array.from({ length: RELAY_PRIMARY_LEG_COUNT }, (_, index) => {
      const order = index + 1;
      return {
        value: String(order),
        label: `${order} · ${relayLegRoleLabel(stroke, order)}`,
      };
    });
  }, [selectedEvent?.stroke]);

  useEffect(() => {
    if (!isRelay) return;
    const order = Number.parseInt(legOrder, 10);
    const match = relayLineup.find(
      (slot) =>
        slot.meetEventId === meetEventId &&
        slot.relayLetter === relayLetter &&
        slot.legOrder === order,
    );
    if (match) {
      setValue("membershipId", match.membershipId);
    }
  }, [isRelay, meetEventId, relayLetter, legOrder, relayLineup, setValue]);

  if (events.length === 0 || swimmers.length === 0) {
    return null;
  }

  async function onSubmit(values: AddResultValues) {
    setError(null);
    const round =
      values.round === ""
        ? null
        : (values.round as "prelim" | "swimoff" | "finals");
    const meta = {
      round,
      heat: optionalInt(values.heat),
      lane: optionalInt(values.lane),
      exhibition: values.exhibition,
      dqCode: values.dqCode.trim() || null,
    };
    try {
      if (isRelay) {
        await addRelayResultAction(teamId, meetId, {
          meetEventId: values.meetEventId,
          relayLetter: values.relayLetter,
          overallTime: values.time,
          ...meta,
          membershipId: values.membershipId.trim() || null,
          legOrder: optionalInt(values.legOrder),
          splitTime: values.splitTime.trim() || null,
        });
        resetField("time");
        resetField("splitTime");
        resetField("heat");
        resetField("lane");
        resetField("dqCode");
      } else {
        if (!values.swimmerId) {
          setError("Select a swimmer");
          return;
        }
        await addResultAction(
          teamId,
          meetId,
          values.meetEventId,
          values.swimmerId,
          values.time,
          meta,
        );
        resetField("time");
        resetField("heat");
        resetField("lane");
        resetField("dqCode");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add time</CardTitle>
        <CardDescription>
          {isRelay
            ? "Team time is upserted for this letter and round. A named split is optional; only a lead-off (leg 1) counts as an official individual time."
            : "Record a hand-timed individual result, including an exhibition swim that was not included in the meet file. Saving twice adds another row."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup className="sm:flex-row sm:flex-wrap sm:items-end">
            <Controller
              name="meetEventId"
              control={control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  className="min-w-40 flex-1"
                >
                  <FieldLabel htmlFor="result-event">Event</FieldLabel>
                  <LabeledCombobox
                    id="result-event"
                    items={eventItems}
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      setValue("swimmerId", "");
                      setValue("membershipId", "");
                    }}
                    placeholder="Search events…"
                    emptyText="No events found."
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
            {isRelay ? (
              <>
                <Controller
                  name="relayLetter"
                  control={control}
                  render={({ field }) => (
                    <Field className="w-24">
                      <FieldLabel htmlFor="result-letter">Team</FieldLabel>
                      <Select
                        items={[...RELAY_TEAM_LETTERS].map((letter) => ({
                          value: letter,
                          label: letter,
                        }))}
                        value={field.value}
                        onValueChange={(value) => {
                          if (value === "A" || value === "B" || value === "C") {
                            field.onChange(value);
                          }
                        }}
                      >
                        <SelectTrigger id="result-letter" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {RELAY_TEAM_LETTERS.map((letter) => (
                              <SelectItem key={letter} value={letter}>
                                {letter}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <Field data-invalid={!!errors.time} className="w-32">
                  <FieldLabel htmlFor="result-time">Team time</FieldLabel>
                  <Input
                    id="result-time"
                    className="font-timing"
                    placeholder="1:42.10"
                    aria-invalid={!!errors.time}
                    {...register("time")}
                    onChange={(event) =>
                      setValue(
                        "time",
                        formatTypedSwimTime(event.target.value),
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        },
                      )
                    }
                  />
                  <FieldError errors={[errors.time]} />
                </Field>
                <Controller
                  name="membershipId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="min-w-40 flex-1"
                    >
                      <FieldLabel htmlFor="result-split-swimmer">
                        Split swimmer
                      </FieldLabel>
                      <LabeledCombobox
                        id="result-split-swimmer"
                        items={swimmerItems}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Optional…"
                        emptyText="No swimmers found."
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Controller
                  name="legOrder"
                  control={control}
                  render={({ field }) => (
                    <Field className="w-36">
                      <FieldLabel htmlFor="result-leg">Leg</FieldLabel>
                      <Select
                        items={legItems}
                        value={field.value}
                        onValueChange={(value) => {
                          if (value != null) field.onChange(value);
                        }}
                      >
                        <SelectTrigger id="result-leg" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {legItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />
                <Field data-invalid={!!errors.splitTime} className="w-32">
                  <FieldLabel htmlFor="result-split">Split</FieldLabel>
                  <Input
                    id="result-split"
                    className="font-timing"
                    placeholder={membershipId ? "24.19" : "—"}
                    aria-invalid={!!errors.splitTime}
                    {...register("splitTime")}
                    onChange={(event) =>
                      setValue(
                        "splitTime",
                        formatTypedSwimTime(event.target.value),
                        { shouldDirty: true, shouldValidate: true },
                      )
                    }
                  />
                  <FieldError errors={[errors.splitTime]} />
                </Field>
              </>
            ) : (
              <>
                <Controller
                  name="swimmerId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field
                      data-invalid={fieldState.invalid}
                      className="min-w-40 flex-1"
                    >
                      <FieldLabel htmlFor="result-swimmer">Swimmer</FieldLabel>
                      <LabeledCombobox
                        id="result-swimmer"
                        items={swimmerItems}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Search swimmers…"
                        emptyText="No swimmers found."
                      />
                      <FieldError errors={[fieldState.error]} />
                    </Field>
                  )}
                />
                <Field data-invalid={!!errors.time} className="w-32">
                  <FieldLabel htmlFor="result-time">Time</FieldLabel>
                  <Input
                    id="result-time"
                    className="font-timing"
                    placeholder="1:02.45"
                    aria-invalid={!!errors.time}
                    {...register("time")}
                    onChange={(event) =>
                      setValue(
                        "time",
                        formatTypedSwimTime(event.target.value),
                        {
                          shouldDirty: true,
                          shouldValidate: true,
                        },
                      )
                    }
                  />
                  <FieldError errors={[errors.time]} />
                </Field>
              </>
            )}
            <Controller
              name="round"
              control={control}
              render={({ field }) => (
                <Field className="w-28">
                  <FieldLabel htmlFor="result-round">Round</FieldLabel>
                  <Select
                    items={[...ROUND_OPTIONS]}
                    value={field.value}
                    onValueChange={(value) => {
                      if (value != null) field.onChange(value);
                    }}
                  >
                    <SelectTrigger id="result-round" className="w-full">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ROUND_OPTIONS.map((opt) => (
                          <SelectItem
                            key={opt.value || "none"}
                            value={opt.value}
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
            <Field className="w-20">
              <FieldLabel htmlFor="result-heat">Heat</FieldLabel>
              <Input
                id="result-heat"
                inputMode="numeric"
                placeholder="—"
                {...register("heat")}
              />
            </Field>
            <Field className="w-20">
              <FieldLabel htmlFor="result-lane">Lane</FieldLabel>
              <Input
                id="result-lane"
                inputMode="numeric"
                placeholder="—"
                {...register("lane")}
              />
            </Field>
            <Controller
              name="exhibition"
              control={control}
              render={({ field }) => (
                <Field orientation="horizontal" className="w-auto pb-1">
                  <Checkbox
                    id="result-exhibition"
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  <FieldLabel
                    htmlFor="result-exhibition"
                    className="font-normal"
                  >
                    Exhibition (excluded from scoring)
                  </FieldLabel>
                </Field>
              )}
            />
            <Field className="w-24">
              <FieldLabel htmlFor="result-dq">DQ code</FieldLabel>
              <Input id="result-dq" placeholder="—" {...register("dqCode")} />
            </Field>
            <Field className="w-auto">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving…"
                  : isRelay
                    ? "Save relay"
                    : "Save time"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {error ? (
          <p className="text-destructive mt-2 text-sm">{error}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
