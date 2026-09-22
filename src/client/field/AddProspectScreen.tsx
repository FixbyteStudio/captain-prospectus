/**
 * A place the agent found that the base does not have —
 * docs/domains/field-operations.md#field-prospects.
 *
 * Name and type are required; the position defaults to the current reading.
 * The row goes into the outbox and appears on the round immediately, before
 * any sync, so an agent can add a food truck and visit it on the spot.
 *
 * It sends only what `fieldProspectSchema` declares. `source`, `status` and
 * ownership are the server's (INVARIANT 2): it forces source = field, status =
 * assigned, and assigns it to the verified identity that sent it.
 */
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { BackLink } from "./BackLink";
import { buttonVariants } from "@/ui/button-variants";
import { cn } from "../lib/utils";
import { FieldRadioGroup, FieldRadioOption } from "@/ui/field-controls";
import { Input } from "@/ui/input";
import { copy, TYPE_LABELS } from "../copy";
import { PROSPECT_TYPES, type ProspectType } from "../../shared/constants";
import { fieldProspectSchema } from "../../shared/schemas";
import { fieldDb } from "./db";
import { useAgentPosition } from "./useAgentPosition";
import { useSyncState } from "./useSync";

export function AddProspectScreen() {
  const navigate = useNavigate();
  const { syncNow } = useSyncState();
  const { point, locating, refresh } = useAgentPosition();

  const [name, setName] = useState("");
  const [type, setType] = useState<ProspectType>("restaurant");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  /**
   * Which control the shared schema refused. Every field has its own cap, and
   * marking the name because the address is too long sends the agent to fix
   * the one thing that was already right.
   */
  const [errors, setErrors] = useState<{ name?: true; address?: true; phone?: true }>({});
  const [saving, setSaving] = useState(false);
  /** The outbox write itself failed, so nothing is queued. */
  const [saveFailed, setSaveFailed] = useState(false);

  // Minted once: the client id is the idempotency key (INVARIANT 4).
  const [prospectId] = useState(() => crypto.randomUUID());

  const save = useCallback(async () => {
    if (saving) return;

    const parsed = fieldProspectSchema.safeParse({
      id: prospectId,
      name,
      type,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      address: address.trim() || null,
      phone: phone.trim() || null,
      createdAt: Date.now(),
    });

    if (!parsed.success) {
      const next: { name?: true; address?: true; phone?: true } = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "address") next.address = true;
        else if (field === "phone") next.phone = true;
        // Anything else is the name or a field with no control of its own (the
        // id, the position, the timestamp) — none of which the agent typed, so
        // the name is where a message can still be acted on.
        else next.name = true;
      }
      setErrors(next);
      return;
    }

    setSaving(true);
    setErrors({});
    setSaveFailed(false);

    try {
      await fieldDb.outboxProspects.add(parsed.data);
    } catch {
      // Same rule as the visit form: the outbox row is the only copy of this
      // prospect, so a failed write is reported rather than navigated past.
      setSaving(false);
      setSaveFailed(true);
      return;
    }

    void syncNow();
    await navigate("/tournee", { replace: true, state: { added: true } });
  }, [address, name, navigate, phone, point, prospectId, saving, syncNow, type]);

  return (
    <section className="pb-24">
      <header>
        <BackLink />
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.005em]">
          {copy.fieldProspect.title}
        </h2>
      </header>

      <div className="mt-6">
        <label htmlFor="name" className="text-base font-medium">
          {copy.fieldProspect.name}
        </label>
        <Input
          id="name"
          touch
          className="mt-1.5"
          value={name}
          placeholder={copy.fieldProspect.namePlaceholder}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && (
          <p role="alert" className="text-destructive mt-1.5 text-sm">
            {copy.fieldProspect.nameRequired}
          </p>
        )}
      </div>

      <div className="mt-5">
        <p className="mb-3 font-medium">{copy.fieldProspect.type}</p>
        <FieldRadioGroup label={copy.fieldProspect.type}>
          {PROSPECT_TYPES.map((t) => (
            <FieldRadioOption
              key={t}
              name="type"
              value={t}
              checked={type === t}
              onSelect={(value) => setType(value as ProspectType)}
            >
              {TYPE_LABELS[t]}
            </FieldRadioOption>
          ))}
        </FieldRadioGroup>
      </div>

      <div className="border-border mt-6 border-t pt-4">
        <p className="font-medium">{copy.fieldProspect.position}</p>
        <div className="mt-1.5 flex items-center justify-between gap-4">
          {point ? (
            <span className="tnum text-muted-foreground text-sm">
              {copy.fieldProspect.positionSet(point.lat.toFixed(4), point.lng.toFixed(4))}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">
              {locating ? copy.today.locating : copy.fieldProspect.positionNone}
            </span>
          )}
          <button
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={refresh}
            disabled={locating}
          >
            {point ? copy.fieldProspect.positionRefresh : copy.fieldProspect.useMyPosition}
          </button>
        </div>
      </div>

      <div className="mt-5">
        <label htmlFor="address" className="text-base font-medium">
          {copy.fieldProspect.address}{" "}
          <span className="text-muted-foreground font-normal">({copy.fieldProspect.optional})</span>
        </label>
        <Input
          id="address"
          touch
          className="mt-1.5"
          value={address}
          aria-invalid={errors.address ? true : undefined}
          onChange={(e) => setAddress(e.target.value)}
        />
        {errors.address && (
          <p role="alert" className="text-destructive mt-1.5 text-sm">
            {copy.fieldProspect.addressTooLong}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="phone" className="text-base font-medium">
          {copy.fieldProspect.phone}{" "}
          <span className="text-muted-foreground font-normal">({copy.fieldProspect.optional})</span>
        </label>
        <Input
          id="phone"
          type="tel"
          touch
          className="mt-1.5"
          value={phone}
          aria-invalid={errors.phone ? true : undefined}
          onChange={(e) => setPhone(e.target.value)}
        />
        {errors.phone && (
          <p role="alert" className="text-destructive mt-1.5 text-sm">
            {copy.fieldProspect.phoneTooLong}
          </p>
        )}
      </div>

      <div className="safe-bottom bg-background border-border fixed inset-x-0 bottom-0 border-t px-4 py-3">
        {saveFailed && (
          <p role="alert" className="text-destructive mb-2 text-sm">
            {copy.fieldProspect.saveFailed}
          </p>
        )}
        <button
          type="button"
          className={cn(buttonVariants({ size: "touch" }), "w-full")}
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? copy.fieldProspect.saving : copy.fieldProspect.save}
        </button>
      </div>
    </section>
  );
}
