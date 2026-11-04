"use client";

import { useEffect, useRef, useState } from "react";
import { offerPriceCents } from "@/domain/offers/evaluate";

const money = (cents: number) => `S$${(cents / 100).toFixed(2)}`;

// Reads the surrounding form so the owner sees the buyer's price as they change the terms.
export function OfferPreview({ listPriceCents, initialDiscount, initialFloorCents }: { listPriceCents: number; initialDiscount: number; initialFloorCents: number }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [terms, setTerms] = useState({ discount: initialDiscount, floor: initialFloorCents });
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const read = () => {
      const data = new FormData(form);
      setTerms({ discount: Number(data.get("discountPercent")), floor: Math.round(Number(data.get("floorDollars")) * 100) });
    };
    form.addEventListener("input", read);
    return () => form.removeEventListener("input", read);
  }, []);
  const valid = Number.isInteger(terms.discount) && terms.discount >= 1 && terms.discount <= 99;
  const price = valid ? offerPriceCents({ listPriceCents, terms: { discountBps: terms.discount * 100 } }) : null;
  return (
    <div ref={anchor} className="offer-preview">
      <p className="offer-preview-label">Buyers see</p>
      <p className="offer-preview-price"><s>{money(listPriceCents)}</s> {price === null ? "-" : money(price)}</p>
      {price !== null && terms.floor > price && <p className="bad small">Below your floor. No buyer could get this deal.</p>}
    </div>
  );
}
