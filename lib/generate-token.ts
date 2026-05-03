import "server-only";
import { randomInt } from "node:crypto";

// Visually unambiguous alphabet — drops I, l, O, 0 so a candidate who
// has to read or retype the token from an email doesn't get stuck on
// a 1/l or O/0 confusion.
const CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// 12 chars from a 56-char alphabet ≈ 70 bits of entropy. crypto-secure
// PRNG (not Math.random) because the token is the entire auth credential
// for a candidate's portal — guessing one means impersonating them.
export function generateToken(brandSlug: string): string {
  const prefix = brandSlug === "hounds-town-usa" ? "ht" : "ct";
  let random = "";
  for (let i = 0; i < 12; i++) {
    random += CHARSET[randomInt(0, CHARSET.length)];
  }
  return `${prefix}-${random}`;
}
