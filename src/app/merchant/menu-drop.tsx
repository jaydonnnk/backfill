"use client";

import { useState } from "react";
import { uploadMenu } from "./actions";
import { SubmitButton } from "./submit-button";

// The file input covers the whole zone, so dropping a photo works without any drag handling.
export function MenuDrop({ large = false }: { large?: boolean }) {
  const [name, setName] = useState("");
  return (
    <form action={uploadMenu} className={`menu-drop ${large ? "large" : ""}`}>
      <div className={`drop-zone ${name ? "chosen" : ""}`}>
        <input type="file" name="photo" aria-label="Menu photo" accept="image/jpeg,image/png,image/webp" required onChange={event => setName(event.target.files?.[0]?.name ?? "")} />
        <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 5h26v38H11zM17 13h14M17 21h14M17 29h8" /></svg>
        <strong>{name || "Drop a menu photo"}</strong>
        <span>{name ? "Ready to read" : "or tap to choose one"}</span>
      </div>
      <SubmitButton className="button primary" pendingLabel="Reading menu…">Read menu</SubmitButton>
    </form>
  );
}
