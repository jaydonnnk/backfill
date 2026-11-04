"use client";

import { useActionState } from "react";
import { startWhatsappLink } from "./actions";
import { SubmitButton } from "./submit-button";

// Asks for a one-time link code and shows it in place, so it never travels in a URL. The owner
// sends "LINK <code>" from their phone to the Backfill WhatsApp number to bind that phone.
export function LinkWhatsapp({ linkedEnding, button }: { linkedEnding: string | null; button: string }) {
  const [state, action] = useActionState(startWhatsappLink, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {linkedEnding && <p className="small">WhatsApp is linked to the number ending {linkedEnding}. Linking again moves it to a new number.</p>}
      {state && (
        <p role="status" className="small">
          Send <span className="link-code">LINK {state.code}</span> from your phone to the Backfill WhatsApp number within 10 minutes.
        </p>
      )}
      <div>
        <SubmitButton className={button} pendingLabel="Getting a code…">
          {linkedEnding ? "Link a different number" : "Get a link code"}
        </SubmitButton>
      </div>
    </form>
  );
}
