import { z } from 'zod';

/*
 * Funding the wallet by bank transfer. Each user gets ONE static bank account (PocketFi, via Paga). Money sent to it is
 * credited to their wallet by PocketFi's webhook: the page only ever shows the account and the history.
 */
/**
 * The name sent to PocketFi is the user's USERNAME, for both first and last name: nobody types a name. PocketFi only takes letters, so
 * everything else in the username (digits, underscores, dots) is dropped, and a username with fewer than 2 letters left uses "NumVex".
 * ("ada_obi99" -> "AdaObi"... first letter capital: "bob_x" -> "Bobx"; "x1" -> "NumVex".)
 */
export function accountNameFromUsername(username: string): string {
  const letters = username.replace(/[^A-Za-z]/g, '').slice(0, 40);
  return letters.length >= 2 ? letters.charAt(0).toUpperCase() + letters.slice(1) : 'NumVex'; // first letter capital, like everywhere else
}

export interface VirtualAccount {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface WalletDeposit {
  id: string;
  /** What reached the wallet, in kobo. */
  amountKobo: number;
  createdAt: string;
}
