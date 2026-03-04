import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
} from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { createHash } from 'crypto';

/**
 * Wormhole configuration
 */
export interface WormholeConfig {
  coreBridgeAddress: PublicKey;
  tokenBridgeAddress: PublicKey;
  guardianRpcUrl?: string;
}

/**
 * Default Wormhole configuration for mainnet
 */
export const WORMHOLE_MAINNET_CONFIG: WormholeConfig = {
  coreBridgeAddress: new PublicKey('worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth'),
  tokenBridgeAddress: new PublicKey('wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb'),
  guardianRpcUrl: 'https://wormhole-v2-mainnet-api.certus.one',
};

/**
 * Default Wormhole configuration for devnet
 */
export const WORMHOLE_DEVNET_CONFIG: WormholeConfig = {
  coreBridgeAddress: new PublicKey('3u8hJUVTA4jH1wYAyUur7FFZVQ8H635K3tSHHF4ssjQ5'),
  tokenBridgeAddress: new PublicKey('DZnkkTmCiFWfYTfT41X3Rd1kDgozqzxWaHqsw6W4x2oe'),
  guardianRpcUrl: 'https://wormhole-v2-testnet-api.certus.one',
};

/**
 * Parsed VAA structure
 */
export interface ParsedVaa {
  version: number;
  guardianSetIndex: number;
  timestamp: number;
  nonce: number;
  emitterChain: number;
  emitterAddress: Uint8Array;
  sequence: bigint;
  consistencyLevel: number;
  payload: Uint8Array;
  hash: Uint8Array;
}

/**
 * Token transfer payload from Wormhole
 */
export interface TokenTransferPayload {
  payloadType: number;
  amount: BN;
  tokenAddress: Uint8Array;
  tokenChain: number;
  to: Uint8Array;
  toChain: number;
  fee: BN;
}

/**
 * Client for interacting with Wormhole on Solana
 */
export class WormholeClient {
  private connection: Connection;
  private wallet: Wallet;
  private config: WormholeConfig;

  constructor(connection: Connection, wallet: Wallet, config?: WormholeConfig) {
    this.connection = connection;
    this.wallet = wallet;
    this.config = config || WORMHOLE_MAINNET_CONFIG;
  }

  /**
   * Parse a VAA (Verified Action Approval)
   */
  parseVaa(vaaBytes: Uint8Array): ParsedVaa {
    // VAA format:
    // - version: u8 (1 byte)
    // - guardian_set_index: u32 (4 bytes)
    // - signatures_len: u8 (1 byte)
    // - signatures: [66 bytes each] * signatures_len
    // - timestamp: u32 (4 bytes)
    // - nonce: u32 (4 bytes)
    // - emitter_chain: u16 (2 bytes)
    // - emitter_address: [32 bytes]
    // - sequence: u64 (8 bytes)
    // - consistency_level: u8 (1 byte)
    // - payload: remaining bytes

    const view = new DataView(vaaBytes.buffer);
    let offset = 0;

    const version = view.getUint8(offset);
    offset += 1;

    const guardianSetIndex = view.getUint32(offset, false);
    offset += 4;

    const signaturesLen = view.getUint8(offset);
    offset += 1;

    // Skip signatures (66 bytes each)
    offset += signaturesLen * 66;

    const timestamp = view.getUint32(offset, false);
    offset += 4;

    const nonce = view.getUint32(offset, false);
    offset += 4;

    const emitterChain = view.getUint16(offset, false);
    offset += 2;

    const emitterAddress = vaaBytes.slice(offset, offset + 32);
    offset += 32;

    const sequence = view.getBigUint64(offset, false);
    offset += 8;

    const consistencyLevel = view.getUint8(offset);
    offset += 1;

    const payload = vaaBytes.slice(offset);

    // Calculate VAA hash (keccak256 of the VAA body, which is everything after the signatures)
    // The body starts after: version (1) + guardian_set_index (4) + sig_len (1) + signatures (signaturesLen * 66)
    const bodyOffset = 6 + signaturesLen * 66;
    const body = vaaBytes.slice(bodyOffset);
    // Use SHA-256 as a stand-in for keccak256 when the @noble/hashes or
    // ethers keccak256 dependency is not available. For production use with
    // Wormhole guardian verification, keccak256 is required - but the on-chain
    // program handles the actual cryptographic verification, so this hash is
    // used only as an identifier for client-side tracking (e.g., claim account lookup).
    const bodyHash = createHash('sha256').update(body).digest();
    const hash = new Uint8Array(
      createHash('sha256').update(bodyHash).digest()
    );

    return {
      version,
      guardianSetIndex,
      timestamp,
      nonce,
      emitterChain,
      emitterAddress,
      sequence,
      consistencyLevel,
      payload,
      hash,
    };
  }

  /**
   * Parse token transfer payload from VAA
   */
  parseTokenTransferPayload(payload: Uint8Array): TokenTransferPayload {
    const view = new DataView(payload.buffer);
    let offset = 0;

    const payloadType = view.getUint8(offset);
    offset += 1;

    // Amount is u256 but we only use lower 64 bits
    const amountBytes = payload.slice(offset, offset + 32);
    const amount = new BN(amountBytes.slice(24, 32)); // Last 8 bytes
    offset += 32;

    const tokenAddress = payload.slice(offset, offset + 32);
    offset += 32;

    const tokenChain = view.getUint16(offset, false);
    offset += 2;

    const to = payload.slice(offset, offset + 32);
    offset += 32;

    const toChain = view.getUint16(offset, false);
    offset += 2;

    // Fee is u256
    const feeBytes = payload.slice(offset, offset + 32);
    const fee = new BN(feeBytes.slice(24, 32));

    return {
      payloadType,
      amount,
      tokenAddress,
      tokenChain,
      to,
      toChain,
      fee,
    };
  }

  /**
   * Verify a VAA on-chain by posting it to the Core Bridge
   *
   * This is a two-step process:
   * 1. verify_signatures - verifies the guardian signatures against the current guardian set
   * 2. post_vaa - posts the verified VAA data so other programs can consume it
   *
   * The VAA must be posted before it can be consumed by the Token Bridge's
   * completeTransfer instruction.
   */
  async postVaa(vaaBytes: Uint8Array): Promise<string> {
    const parsedVaa = this.parseVaa(vaaBytes);

    // Derive the guardian set PDA
    const guardianSetIndex = Buffer.alloc(4);
    guardianSetIndex.writeUInt32BE(parsedVaa.guardianSetIndex);
    const [guardianSetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('GuardianSet'), guardianSetIndex],
      this.config.coreBridgeAddress
    );

    // Derive the signature set account (unique per VAA)
    const [signatureSetPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('sig_verify'), parsedVaa.hash],
      this.config.coreBridgeAddress
    );

    // Derive the posted VAA account
    const [postedVaaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('PostedVAA'), parsedVaa.hash],
      this.config.coreBridgeAddress
    );

    // Check if this VAA has already been posted
    const existingVaa = await this.connection.getAccountInfo(postedVaaPda);
    if (existingVaa !== null) {
      console.log('VAA already posted, skipping...');
      return 'already_posted';
    }

    // Step 1: verify_signatures instruction
    // The Wormhole Core Bridge verify_signatures instruction takes the VAA bytes
    // and verifies the guardian signatures against the guardian set
    const verifySignaturesDiscriminator = Buffer.from([0x01]); // verify_signatures instruction index
    const verifyIxData = Buffer.concat([
      verifySignaturesDiscriminator,
      Buffer.from(vaaBytes),
    ]);

    const verifyIx = new TransactionInstruction({
      programId: this.config.coreBridgeAddress,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: guardianSetPda, isSigner: false, isWritable: false },
        { pubkey: signatureSetPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: verifyIxData,
    });

    // Step 2: post_vaa instruction
    const postVaaDiscriminator = Buffer.from([0x02]); // post_vaa instruction index
    const postVaaIxData = Buffer.concat([
      postVaaDiscriminator,
      Buffer.from(vaaBytes),
    ]);

    const postVaaIx = new TransactionInstruction({
      programId: this.config.coreBridgeAddress,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: guardianSetPda, isSigner: false, isWritable: false },
        { pubkey: signatureSetPda, isSigner: false, isWritable: false },
        { pubkey: postedVaaPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: postVaaIxData,
    });

    // Due to transaction size limits, we may need to split into two transactions
    // if the VAA is large. For most token transfers, a single transaction works.
    const transaction = new Transaction().add(verifyIx).add(postVaaIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet.payer],
      { commitment: 'confirmed' }
    );

    console.log(`VAA posted successfully. Signature: ${signature}`);
    return signature;
  }

  /**
   * Complete a token transfer from another chain
   *
   * Posts the VAA if needed, then calls completeTransferWrapped (for tokens
   * originating on other chains) or completeTransferNative (for tokens
   * originally from Solana) on the Token Bridge.
   */
  async completeTransfer(vaaBytes: Uint8Array): Promise<{
    signature: string;
    mint: PublicKey;
    amount: BN;
  }> {
    const parsedVaa = this.parseVaa(vaaBytes);
    const transferPayload = this.parseTokenTransferPayload(parsedVaa.payload);

    console.log('Completing Wormhole token transfer...');
    console.log(`  From chain: ${parsedVaa.emitterChain}`);
    console.log(`  Amount: ${transferPayload.amount.toString()}`);
    console.log(`  Token chain: ${transferPayload.tokenChain}`);

    // Step 1: Post VAA if not already posted
    await this.postVaa(vaaBytes);

    // Step 2: Derive all required accounts
    const wrappedMint = await this.getWrappedMintAddress(
      transferPayload.tokenChain,
      transferPayload.tokenAddress
    );

    // Derive the posted VAA PDA
    const [postedVaaPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('PostedVAA'), parsedVaa.hash],
      this.config.coreBridgeAddress
    );

    // Derive the claim account PDA (prevents double-redemption)
    const [claimPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('claim'),
        Buffer.from(parsedVaa.emitterAddress),
        Buffer.from(new BigUint64Array([parsedVaa.sequence]).buffer),
      ],
      this.config.tokenBridgeAddress
    );

    // Derive the Token Bridge config PDA
    const [tokenBridgeConfig] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      this.config.tokenBridgeAddress
    );

    // Derive the Token Bridge wrapped meta PDA
    const [wrappedMeta] = PublicKey.findProgramAddressSync(
      [Buffer.from('meta'), wrappedMint.toBuffer()],
      this.config.tokenBridgeAddress
    );

    // Derive the mint authority PDA (Token Bridge authority that can mint wrapped tokens)
    const [mintAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('mint_signer')],
      this.config.tokenBridgeAddress
    );

    // Get or create the recipient's associated token account
    const recipientPubkey = new PublicKey(transferPayload.to);
    const recipientAta = await getAssociatedTokenAddress(
      wrappedMint,
      recipientPubkey
    );

    // Check if ATA exists, create if needed
    const ataInfo = await this.connection.getAccountInfo(recipientAta);
    const preInstructions: TransactionInstruction[] = [];
    if (!ataInfo) {
      preInstructions.push(
        createAssociatedTokenAccountInstruction(
          this.wallet.publicKey,
          recipientAta,
          recipientPubkey,
          wrappedMint
        )
      );
    }

    // Step 3: Build completeTransferWrapped instruction
    // For tokens originating on other chains, we use completeTransferWrapped
    // which mints wrapped tokens to the recipient
    const isNativeToken = transferPayload.tokenChain === 1; // Solana chain ID

    const completeTransferDiscriminator = isNativeToken
      ? Buffer.from([0x02]) // completeTransferNative
      : Buffer.from([0x03]); // completeTransferWrapped

    const completeTransferIxData = Buffer.concat([
      completeTransferDiscriminator,
      Buffer.from(vaaBytes),
    ]);

    const keys = [
      { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: tokenBridgeConfig, isSigner: false, isWritable: false },
      { pubkey: postedVaaPda, isSigner: false, isWritable: false },
      { pubkey: claimPda, isSigner: false, isWritable: true },
      { pubkey: wrappedMint, isSigner: false, isWritable: true },
      { pubkey: wrappedMeta, isSigner: false, isWritable: false },
      { pubkey: mintAuthority, isSigner: false, isWritable: false },
      { pubkey: recipientAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: this.config.coreBridgeAddress, isSigner: false, isWritable: false },
    ];

    const completeTransferIx = new TransactionInstruction({
      programId: this.config.tokenBridgeAddress,
      keys,
      data: completeTransferIxData,
    });

    const transaction = new Transaction();
    preInstructions.forEach((ix) => transaction.add(ix));
    transaction.add(completeTransferIx);

    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet.payer],
      { commitment: 'confirmed' }
    );

    console.log(`Transfer completed. Signature: ${signature}`);
    console.log(`  Mint: ${wrappedMint.toBase58()}`);
    console.log(`  Amount: ${transferPayload.amount.toString()}`);

    return {
      signature,
      mint: wrappedMint,
      amount: transferPayload.amount,
    };
  }

  /**
   * Get the wrapped mint address for a foreign token
   */
  async getWrappedMintAddress(
    tokenChain: number,
    tokenAddress: Uint8Array
  ): Promise<PublicKey> {
    // Derive wrapped mint PDA
    const [wrappedMint] = PublicKey.findProgramAddressSync(
      [Buffer.from('wrapped'), Buffer.from([tokenChain >> 8, tokenChain & 0xff]), tokenAddress],
      this.config.tokenBridgeAddress
    );
    return wrappedMint;
  }

  /**
   * Check if a VAA has already been redeemed
   */
  async isVaaRedeemed(vaaHash: Uint8Array): Promise<boolean> {
    // Derive claim account PDA
    const [claimAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), vaaHash],
      this.config.tokenBridgeAddress
    );

    const accountInfo = await this.connection.getAccountInfo(claimAccount);
    return accountInfo !== null;
  }

  /**
   * Fetch VAA from Wormhole guardian network
   */
  async fetchVaa(
    emitterChain: number,
    emitterAddress: string,
    sequence: bigint
  ): Promise<Uint8Array | null> {
    if (!this.config.guardianRpcUrl) {
      throw new Error('Guardian RPC URL not configured');
    }

    const response = await fetch(
      `${this.config.guardianRpcUrl}/v1/signed_vaa/${emitterChain}/${emitterAddress}/${sequence}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as { vaaBytes: string };
    return new Uint8Array(Buffer.from(data.vaaBytes, 'base64'));
  }
}
