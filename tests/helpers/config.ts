import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";

const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/**
 * Create a program's admin config PDA if it does not exist yet, with the
 * provider wallet (the local upgrade authority) as admin. Returns the PDA.
 */
export async function ensureConfig(
  program: Program<any>,
  seed: string,
  method: string,
): Promise<PublicKey> {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from(seed)], program.programId);
  const existing = await program.provider.connection.getAccountInfo(config);
  if (!existing) {
    const [programData] = PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      BPF_UPGRADEABLE_LOADER,
    );
    const payer = program.provider.publicKey!;
    await (program.methods as any)[method](payer)
      .accounts({
        payer,
        config,
        program: program.programId,
        programData,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
  return config;
}
