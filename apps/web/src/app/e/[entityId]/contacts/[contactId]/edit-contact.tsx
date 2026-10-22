"use client";

import type { Contact } from "@kedge/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@kedge/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { ContactForm } from "../contacts-view";

export function EditContact({ contact }: { contact: Contact }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <DialogContent className="max-w-xl">
        <DialogTitle>Edit contact</DialogTitle>
        <DialogDescription>Changes apply everywhere this contact appears. Posted entries are not changed.</DialogDescription>
        <ContactForm
          initial={contact}
          submitLabel="Save"
          onSubmit={async (input) => {
            await api.updateContact(contact.id, input);
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
