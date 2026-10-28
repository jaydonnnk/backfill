import { z } from "zod";

// Money is always Singapore dollars in whole cents, so no price is ever a float.
export const Cents = z.int().nonnegative();

// Covers are seats or servings; a commitment or a pool always has at least one.
export const Covers = z.int().positive();

// Discounts are basis points (2500 is 25%), so every discount is a whole number.
export const BASIS_POINTS = 10_000;

// A rule's terms version, starting at 1; every commitment and clearing result names one.
export const TermsVersion = z.int().positive();
