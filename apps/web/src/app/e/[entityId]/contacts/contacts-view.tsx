"use client";

import { ApiRequestError, type Contact, type ContactInput } from "@kedge/api";
import { Alert, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, EmptyState, Field, Input, Select } from "@kedge/ui";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable } from "@/components/data-table";
import { api } from "@/lib/api";

const KIND_LABEL = { customer: "Customer", supplier: "Supplier", both: "Customer & supplier", other: "Other" } as const;

const columns: ColumnDef<Contact, unknown>[] = [
  { accessorKey: "name", header: "Name", cell: (c) => <span className="font-medium">{c.row.original.name}</span> },
  { accessorKey: "kind", header: "Type", cell: (c) => <span className="text-muted">{KIND_LABEL[c.row.original.kind]}</span> },
  { accessorKey: "email", header: "Email", cell: (c) => <span className="text-muted">{c.row.original.email ?? "—"}</span> },
  { accessorKey: "phone", header: "Phone", cell: (c) => <span className="text-muted tabular">{c.row.original.phone ?? "—"}</span> },
  { accessorKey: "isActive", header: "", enableSorting: false, cell: (c) => (c.row.original.isActive ? null : <Badge>Inactive</Badge>) },
];

export function ContactForm({ initial, onSubmit, submitLabel }: { initial?: Partial<Contact>; onSubmit: (input: ContactInput) => Promise<void>; submitLabel: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return setError("Enter a name.");
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name,
        kind: String(f.get("kind")) as ContactInput["kind"],
        email: String(f.get("email") ?? "").trim() || null,
        phone: String(f.get("phone") ?? "").trim() || null,
        tin: String(f.get("tin") ?? "").trim() || null,
        address: String(f.get("address") ?? "").trim() || null,
      });
    } catch (err) {
      setError(err instanceof ApiRequestError ? (err.issues[0]?.path === "email" ? "Enter a valid email address." : err.message) : "We couldn't save the contact.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger" title={error} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="c-name" label="Name">
          <Input id="c-name" name="name" defaultValue={initial?.name ?? ""} autoFocus />
        </Field>
        <Field id="c-kind" label="Type">
          <Select id="c-kind" name="kind" defaultValue={initial?.kind ?? "customer"}>
            {Object.entries(KIND_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="c-email" label="Email (optional)">
          <Input id="c-email" name="email" type="email" defaultValue={initial?.email ?? ""} />
        </Field>
        <Field id="c-phone" label="Phone (optional)">
          <Input id="c-phone" name="phone" type="tel" defaultValue={initial?.phone ?? ""} />
        </Field>
        <Field id="c-tin" label="TIN (optional)">
          <Input id="c-tin" name="tin" defaultValue={initial?.tin ?? ""} />
        </Field>
        <Field id="c-address" label="Address (optional)">
          <Input id="c-address" name="address" defaultValue={initial?.address ?? ""} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ContactsView({ entityId, contacts, canEdit }: { entityId: string; contacts: Contact[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rows = q ? contacts.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : contacts;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input type="search" placeholder="Search contacts" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-64" aria-label="Search contacts" />
        {canEdit ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}>
              <Plus aria-hidden />
              Add contact
            </Button>
            <DialogContent className="max-w-xl">
              <DialogTitle>Add a contact</DialogTitle>
              <DialogDescription>Customers and suppliers appear on transactions and, later, invoices and bills.</DialogDescription>
              <ContactForm
                submitLabel="Add contact"
                onSubmit={async (input) => {
                  await api.createContact(entityId, input);
                  setOpen(false);
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
      <DataTable
        caption="Contacts"
        data={rows}
        columns={columns}
        rowHref={(c) => `/e/${entityId}/contacts/${c.id}`}
        empty={<EmptyState icon={<Users />} title={q ? "No contacts match" : "No contacts yet"} description={q ? undefined : "Contacts are also created when you type a new name in quick add."} />}
      />
    </div>
  );
}
