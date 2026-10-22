"use client";

import { ApiRequestError, type BankAccountInput } from "@kedge/api";
import { COA_TEMPLATES, COA_TEMPLATE_KEYS, typeOfSubtype, type CoaTemplateKey } from "@kedge/core";
import { Alert, Button, Card, CardContent, cn, Field, Input, Select } from "@kedge/ui";
import { Check, Landmark, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { INDUSTRIES, NIGERIAN_BANKS } from "./banks";
import { OpeningBalancesForm } from "./opening-balances-form";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const STEPS = ["Business details", "Financial year", "Categories", "Bank accounts", "Opening balances", "Done"] as const;

export interface SetupWizardProps {
  /** Create a new business in this org… */
  orgId?: string;
  /** …or set up books for an existing (shell) entity. */
  entityId?: string;
  defaults?: { legalName?: string; tradingName?: string | null };
  /** Today in Africa/Lagos, YYYY-MM-DD (computed on the server). */
  today: string;
  /** Wording for firms adding a client. */
  noun?: "business" | "client";
  /** When set, the final step continues here instead of linking to the new books (firm wizard). */
  onComplete?: (entityId: string) => void;
}

interface Details {
  legalName: string;
  tradingName: string;
  rcNumber: string;
  tin: string;
  vatRegistered: boolean;
  industry: string;
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex items-center gap-1.5" aria-label="Set-up progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={i === step ? "step" : undefined}>
          <span className={cn("h-1.5 rounded-full", i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-subtle")} />
          <span className={cn("hidden truncate text-xs md:block", i === step ? "font-medium text-foreground" : "text-muted")}>{label}</span>
        </li>
      ))}
      <span className="sr-only">
        Step {step + 1} of {STEPS.length}: {STEPS[step]}
      </span>
    </ol>
  );
}

function StepCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer: ReactNode }) {
  return (
    <Card>
      <CardContent className="grid gap-5">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {children}
        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">{footer}</div>
      </CardContent>
    </Card>
  );
}

/** SPEC §6.2 business set-up wizard; firms run the same steps for a client. */
export function SetupWizard({ orgId, entityId: existingEntityId, defaults, today, noun = "business", onComplete }: SetupWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState<Details>({
    legalName: defaults?.legalName ?? "",
    tradingName: defaults?.tradingName ?? "",
    rcNumber: "",
    tin: "",
    vatRegistered: false,
    industry: "",
  });
  const [startMonth, setStartMonth] = useState(1);
  const [goLive, setGoLive] = useState(`${today.slice(0, 7)}-01`);
  const [template, setTemplate] = useState<CoaTemplateKey>("general_sme");
  const [banks, setBanks] = useState<BankAccountInput[]>([{ bankName: "", accountName: "", accountNumber: "", kind: "current" }]);
  const [entityId, setEntityId] = useState<string | null>(existingEntityId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [obChoice, setObChoice] = useState<"manual" | null>(null);

  const back = (
    <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
      Back
    </Button>
  );

  async function createBooks() {
    setPending(true);
    setError(null);
    const body = {
      legalName: details.legalName.trim(),
      tradingName: details.tradingName.trim() || null,
      rcNumber: details.rcNumber.trim() || null,
      tin: details.tin.trim() || null,
      vatRegistered: details.vatRegistered,
      industry: details.industry || null,
      fiscalYearStartMonth: startMonth,
      goLiveDate: goLive,
      coaTemplate: template,
      bankAccounts: banks
        .filter((b) => b.bankName.trim() && b.accountName.trim())
        .map((b) => ({ ...b, bankName: b.bankName.trim(), accountName: b.accountName.trim(), accountNumber: b.accountNumber?.trim() || null })),
    };
    try {
      const entity = existingEntityId ? await api.setUpEntityBooks(existingEntityId, body) : await api.createEntityWithBooks(orgId as string, body);
      setEntityId(entity.id);
      setStep(4);
      // The shell's business list comes from the server; refresh it now the books exist.
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.issues[0] ? `${err.message}: ${err.issues[0].message}` : err.message) : "We couldn't set up the books. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const preview = COA_TEMPLATES[template].accounts.filter((a) => !a.systemKey && !a.parentCode);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Stepper step={step} />
      {error ? <Alert tone="danger" title={error} className="mb-4" /> : null}

      {step === 0 ? (
        <StepCard
          title={noun === "client" ? "About this client" : "About your business"}
          description="These details appear on reports and statements."
          footer={
            <>
              {back}
              <Button
                onClick={() => {
                  if (!details.legalName.trim()) return setError("Enter the registered name.");
                  setError(null);
                  setStep(1);
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="legalName" label="Registered name" hint="As on the CAC certificate.">
              <Input id="legalName" value={details.legalName} onChange={(e) => setDetails({ ...details, legalName: e.target.value })} autoFocus />
            </Field>
            <Field id="tradingName" label="Trading name (optional)">
              <Input id="tradingName" value={details.tradingName} onChange={(e) => setDetails({ ...details, tradingName: e.target.value })} />
            </Field>
            <Field id="rcNumber" label="RC number (optional)">
              <Input id="rcNumber" value={details.rcNumber} onChange={(e) => setDetails({ ...details, rcNumber: e.target.value })} placeholder="RC 1234567" />
            </Field>
            <Field id="tin" label="TIN (optional)">
              <Input id="tin" value={details.tin} onChange={(e) => setDetails({ ...details, tin: e.target.value })} />
            </Field>
            <Field id="industry" label="Industry">
              <Select id="industry" value={details.industry} onChange={(e) => setDetails({ ...details, industry: e.target.value })}>
                <option value="">Choose…</option>
                {INDUSTRIES.map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </Select>
            </Field>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Registered for VAT?</legend>
              <div className="grid grid-cols-2 gap-2">
                {[true, false].map((v) => (
                  <label
                    key={String(v)}
                    className={cn(
                      "cursor-pointer rounded-md border px-3 py-2 text-center text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                      details.vatRegistered === v ? "border-primary bg-accent text-accent-foreground" : "border-border-strong",
                    )}
                  >
                    <input type="radio" name="vat" className="sr-only" checked={details.vatRegistered === v} onChange={() => setDetails({ ...details, vatRegistered: v })} />
                    {v ? "Yes" : "No"}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </StepCard>
      ) : null}

      {step === 1 ? (
        <StepCard
          title="Your financial year"
          description="Most businesses use January to December. Your go-live date is the first day you will record here."
          footer={
            <>
              {back}
              <Button onClick={() => setStep(2)} disabled={!goLive}>
                Continue
              </Button>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="startMonth" label="Financial year starts in">
              <Select id="startMonth" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="goLive" label="Go-live date" hint="Usually the first day of a month. Opening balances are as at the day before.">
              <Input id="goLive" type="date" value={goLive} onChange={(e) => setGoLive(e.target.value)} />
            </Field>
          </div>
        </StepCard>
      ) : null}

      {step === 2 ? (
        <StepCard
          title="Choose your categories"
          description="Start from a template. You can rename, add or switch off categories at any time."
          footer={
            <>
              {back}
              <Button onClick={() => setStep(3)}>Continue</Button>
            </>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chart of accounts template">
            {COA_TEMPLATE_KEYS.map((k) => (
              <label
                key={k}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                  template === k ? "border-primary bg-accent" : "border-border-strong hover:bg-subtle",
                )}
              >
                <input type="radio" name="template" className="sr-only" checked={template === k} onChange={() => setTemplate(k)} />
                <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", template === k ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                  {template === k ? <Check aria-hidden className="size-3" /> : null}
                </span>
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{COA_TEMPLATES[k].name}</span>
                  <span className="text-xs text-muted">{COA_TEMPLATES[k].description}</span>
                </span>
              </label>
            ))}
          </div>
          <details className="rounded-lg border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Preview {preview.length} categories</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(["income", "expense", "asset", "liability", "equity"] as const).map((type) => (
                <div key={type}>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">
                    {{ income: "Money in", expense: "Money out", asset: "Owned", liability: "Owed", equity: "Owners" }[type]}
                  </p>
                  <ul className="grid gap-0.5">
                    {preview
                      .filter((a) => typeOfSubtype(a.subtype) === type)
                      .map((a) => (
                        <li key={a.code}>{a.name}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </StepCard>
      ) : null}

      {step === 3 ? (
        <StepCard
          title="Your bank accounts"
          description="Add the accounts and wallets the business uses. Cash on hand is added for you."
          footer={
            <>
              {back}
              <Button onClick={createBooks} disabled={pending}>
                {pending ? "Setting up your books…" : "Set up books"}
              </Button>
            </>
          }
        >
          <datalist id="banks">
            {NIGERIAN_BANKS.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <ul className="grid gap-3">
            {banks.map((b, i) => (
              <li key={i} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Field id={`bank-${i}`} label="Bank">
                  <Input id={`bank-${i}`} list="banks" value={b.bankName} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, bankName: e.target.value } : x)))} placeholder="GTBank" />
                </Field>
                <Field id={`acct-${i}`} label="Account name">
                  <Input id={`acct-${i}`} value={b.accountName} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, accountName: e.target.value } : x)))} placeholder="Current account" />
                </Field>
                <div className="flex items-end">
                  <Button variant="ghost" size="icon" aria-label="Remove this account" onClick={() => setBanks(banks.filter((_, j) => j !== i))}>
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <Field id={`num-${i}`} label="Account number (optional)" hint="Stored encrypted; only the last 4 digits are shown.">
                  <Input
                    id={`num-${i}`}
                    inputMode="numeric"
                    value={b.accountNumber ?? ""}
                    onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, accountNumber: e.target.value.replace(/\D/g, "") } : x)))}
                  />
                </Field>
                <Field id={`kind-${i}`} label="Type">
                  <Select id={`kind-${i}`} value={b.kind} onChange={(e) => setBanks(banks.map((x, j) => (j === i ? { ...x, kind: e.target.value as BankAccountInput["kind"] } : x)))}>
                    <option value="current">Current</option>
                    <option value="savings">Savings</option>
                    <option value="wallet">Wallet / POS</option>
                    <option value="card">Card</option>
                  </Select>
                </Field>
              </li>
            ))}
          </ul>
          <Button variant="secondary" className="w-fit" onClick={() => setBanks([...banks, { bankName: "", accountName: "", accountNumber: "", kind: "current" }])}>
            <Plus aria-hidden />
            Add another account
          </Button>
        </StepCard>
      ) : null}

      {step === 4 && entityId ? (
        <StepCard
          title="What did you have on day one?"
          description="Opening balances carry your history in. You can do this later from the set-up checklist."
          footer={
            <>
              <span />
              <Button variant="ghost" onClick={() => setStep(5)}>
                Skip for now
              </Button>
            </>
          }
        >
          {obChoice === "manual" ? (
            <OpeningBalancesForm entityId={entityId} goLiveDate={goLive} simple={noun === "business"} onDone={() => setStep(5)} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => setObChoice("manual")} className="rounded-lg border border-border-strong p-3 text-left hover:bg-subtle">
                <span className="block text-sm font-medium">Enter them now</span>
                <span className="text-xs text-muted">Type in your balances</span>
              </button>
              <button type="button" onClick={() => setStep(5)} className="rounded-lg border border-border-strong p-3 text-left hover:bg-subtle">
                <span className="block text-sm font-medium">Start from zero</span>
                <span className="text-xs text-muted">A brand-new business</span>
              </button>
              <div className="rounded-lg border border-dashed border-border p-3 text-left opacity-70" aria-disabled="true">
                <span className="block text-sm font-medium">Upload a trial balance</span>
                <span className="text-xs text-muted">Coming soon</span>
              </div>
            </div>
          )}
        </StepCard>
      ) : null}

      {step === 5 && entityId ? (
        <Card>
          <CardContent className="grid justify-items-start gap-4">
            <span className="grid size-12 place-items-center rounded-full bg-success-subtle text-success">
              <Landmark aria-hidden className="size-6" />
            </span>
            <div className="grid gap-1">
              <h2 className="text-xl font-semibold tracking-tight">{noun === "client" ? "The client's books are ready" : "Your books are ready"}</h2>
              <p className="text-sm text-muted">Record your first money in or money out, or finish the set-up checklist.</p>
            </div>
            {onComplete ? (
              <Button onClick={() => onComplete(entityId)}>Continue</Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`/e/${entityId}/dashboard`}>Go to dashboard</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link href={`/e/${entityId}/setup`}>Set-up checklist</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {STEPS[step]}
      </span>
    </div>
  );
}

