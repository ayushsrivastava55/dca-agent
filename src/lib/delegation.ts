export type DelegationParams = {
  router: `0x${string}` | string;
  spendCap: string;
  expiry: string;
};

export type DelegationReceipt = {
  id: string;
  params: DelegationParams;
};

export async function createDelegation(params: DelegationParams): Promise<DelegationReceipt> {
  await new Promise((r) => setTimeout(r, 400));
  return { id: `dlg_${Date.now()}`, params };
}

export async function revokeDelegation(id: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 200));
}
