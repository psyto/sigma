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
} from '@solana/spl-token';
import { WormholeClient, WORMHOLE_MAINNET_CONFIG, WORMHOLE_DEVNET_CONFIG, WormholeConfig } from '../cross-chain/wormhole';

/**
 * Supported source chains for cross-chain collateral
 */
export enum CollateralSource {
  Native = 0,
  Ethereum = 1,
  Arbitrum = 2,
  Cctp = 3,
}

/**
 * Chain IDs for Wormhole
 */
export const WORMHOLE_CHAIN_IDS = {
  SOLANA: 1,
  ETHEREUM: 2,
  ARBITRUM: 23,
} as const;

/**
 * EVM contract addresses for Wormhole Token Bridge
 */
const EVM_TOKEN_BRIDGE_ADDRESSES: Record<string, string> = {
  ethereum: '0x3ee18B2214AFF97000D974cf647E7C347E8fa585',
  arbitrum: '0x0b2402144Bb366A632D14B83F244D2e0e21bD39c',
};

/**
 * EVM contract addresses for CCTP Token Messenger
 */
const CCTP_TOKEN_MESSENGER_ADDRESSES: Record<string, string> = {
  ethereum: '0xBd3fa81B58Ba92a82136038B25aDec7066af3155',
  arbitrum: '0x19330d10D9Cc8751218eaf51E8885D058642E08A',
};

/**
 * CCTP domain identifiers
 */
const CCTP_DOMAINS: Record<string, number> = {
  ethereum: 0,
  arbitrum: 3,
  solana: 5,
};

/**
 * USDC contract addresses per chain
 */
const USDC_ADDRESSES: Record<string, string> = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
};

/**
 * Wormhole guardian API URL for fetching VAAs and transfer status
 */
const WORMHOLE_API_URL = process.env.WORMHOLE_API_URL || 'https://wormhole-v2-mainnet-api.certus.one';

/**
 * Circle attestation API URL for CCTP
 */
const CCTP_ATTESTATION_API_URL = process.env.CCTP_ATTESTATION_API_URL || 'https://iris-api.circle.com';

/**
 * Cross-chain transfer status
 */
export interface CrossChainTransferStatus {
  sourceChain: CollateralSource;
  sourceTxHash: string;
  amount: BN;
  status: 'pending' | 'bridged' | 'failed';
  vaaBytes?: Uint8Array;
  solanaSignature?: string;
}

/**
 * Client for handling cross-chain collateral via Wormhole and CCTP
 */
export class CrossChainClient {
  private connection: Connection;
  private wallet: Wallet;
  private wormholeClient: WormholeClient;

  // Wormhole Core Bridge address on Solana
  private static readonly WORMHOLE_CORE_BRIDGE = new PublicKey(
    'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MgjNMTth'
  );

  // Wormhole Token Bridge address on Solana
  private static readonly WORMHOLE_TOKEN_BRIDGE = new PublicKey(
    'wormDTUJ6AWPNvk59vGQbDvGJmqbDTdgWgAqcLBCgUb'
  );

  // Circle CCTP Message Transmitter on Solana
  private static readonly CCTP_MESSAGE_TRANSMITTER = new PublicKey(
    'CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd'
  );

  // Circle CCTP Token Messenger Minter on Solana
  private static readonly CCTP_TOKEN_MESSENGER_MINTER = new PublicKey(
    'CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3'
  );

  constructor(connection: Connection, wallet: Wallet, wormholeConfig?: WormholeConfig) {
    this.connection = connection;
    this.wallet = wallet;
    this.wormholeClient = new WormholeClient(connection, wallet, wormholeConfig);
  }

  /**
   * Estimate gas/fees for bridging from source chain
   *
   * @param sourceChain - The source chain
   * @param amount - Amount to bridge
   */
  async estimateBridgeFees(
    sourceChain: CollateralSource,
    amount: BN
  ): Promise<{
    sourceChainFee: string;
    solanaFee: number;
    estimatedTime: string;
  }> {
    // Solana fee is the transaction fee (base 5000 lamports) plus rent for any
    // new accounts that may be created during redemption
    const solanaBaseFee = 5000;
    const rentEstimate = await this.connection.getMinimumBalanceForRentExemption(165); // Token account size
    const solanaFee = solanaBaseFee + rentEstimate;

    switch (sourceChain) {
      case CollateralSource.Ethereum:
        return {
          sourceChainFee: '0.005 ETH',
          solanaFee,
          estimatedTime: '15-20 minutes',
        };
      case CollateralSource.Arbitrum:
        return {
          sourceChainFee: '0.0002 ETH',
          solanaFee,
          estimatedTime: '10-15 minutes',
        };
      case CollateralSource.Cctp:
        return {
          sourceChainFee: '0.002 ETH',
          solanaFee,
          estimatedTime: '5-10 minutes',
        };
      default:
        throw new Error(`Unsupported source chain: ${sourceChain}`);
    }
  }

  /**
   * Generate bridge instructions for Ethereum -> Solana via Wormhole
   *
   * Produces the EVM calldata for the Wormhole Token Bridge transferTokens function.
   * The user must execute this transaction on Ethereum, then wait for guardian
   * attestation, and finally call completeWormholeTransfer on Solana.
   *
   * @param tokenAddress - Token address on Ethereum (0x-prefixed hex)
   * @param amount - Amount to bridge (in token's smallest unit)
   */
  async generateEthereumBridgeInstructions(
    tokenAddress: string,
    amount: BN
  ): Promise<{
    ethereumCalldata: string;
    recipientAddress: string;
    instructions: string[];
  }> {
    const recipientAddress = this.wallet.publicKey.toBase58();
    const recipientBytes = this.wallet.publicKey.toBytes();

    // Encode the Wormhole Token Bridge transferTokens calldata
    // Function selector: transferTokens(address,uint256,uint16,bytes32,uint256,uint32)
    // selector = keccak256("transferTokens(address,uint256,uint16,bytes32,uint256,uint32)")[:4]
    const functionSelector = '0x0f5287b0';
    const tokenAddressPadded = tokenAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    const amountHex = amount.toString(16).padStart(64, '0');
    const recipientChain = WORMHOLE_CHAIN_IDS.SOLANA.toString(16).padStart(64, '0');
    const recipientHex = Buffer.from(recipientBytes).toString('hex').padStart(64, '0');
    const arbiterFee = '0'.padStart(64, '0');
    const nonce = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(64, '0');

    const ethereumCalldata = `${functionSelector}${tokenAddressPadded}${amountHex}${recipientChain}${recipientHex}${arbiterFee}${nonce}`;

    const tokenBridgeAddress = EVM_TOKEN_BRIDGE_ADDRESSES['ethereum'];

    return {
      ethereumCalldata,
      recipientAddress,
      instructions: [
        `1. Approve ${tokenBridgeAddress} (Wormhole Token Bridge) to spend ${amount.toString()} of token ${tokenAddress}`,
        `2. Send transaction to ${tokenBridgeAddress} with calldata: ${ethereumCalldata}`,
        '3. Wait for Wormhole guardians to sign the VAA (~15 minutes for finality)',
        `4. Retrieve the signed VAA from the Wormhole guardian network`,
        '5. Call completeWormholeTransfer(vaaBytes) on this client to redeem tokens on Solana',
      ],
    };
  }

  /**
   * Generate bridge instructions for Arbitrum -> Solana via Wormhole
   *
   * @param tokenAddress - Token address on Arbitrum (0x-prefixed hex)
   * @param amount - Amount to bridge (in token's smallest unit)
   */
  async generateArbitrumBridgeInstructions(
    tokenAddress: string,
    amount: BN
  ): Promise<{
    arbitrumCalldata: string;
    recipientAddress: string;
    instructions: string[];
  }> {
    const recipientAddress = this.wallet.publicKey.toBase58();
    const recipientBytes = this.wallet.publicKey.toBytes();

    // Same ABI encoding as Ethereum - Wormhole Token Bridge uses the same interface
    const functionSelector = '0x0f5287b0';
    const tokenAddressPadded = tokenAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    const amountHex = amount.toString(16).padStart(64, '0');
    const recipientChain = WORMHOLE_CHAIN_IDS.SOLANA.toString(16).padStart(64, '0');
    const recipientHex = Buffer.from(recipientBytes).toString('hex').padStart(64, '0');
    const arbiterFee = '0'.padStart(64, '0');
    const nonce = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(64, '0');

    const arbitrumCalldata = `${functionSelector}${tokenAddressPadded}${amountHex}${recipientChain}${recipientHex}${arbiterFee}${nonce}`;

    const tokenBridgeAddress = EVM_TOKEN_BRIDGE_ADDRESSES['arbitrum'];

    return {
      arbitrumCalldata,
      recipientAddress,
      instructions: [
        `1. Approve ${tokenBridgeAddress} (Wormhole Token Bridge) to spend ${amount.toString()} of token ${tokenAddress}`,
        `2. Send transaction to ${tokenBridgeAddress} with calldata: ${arbitrumCalldata}`,
        '3. Wait for Wormhole guardians to sign the VAA (~10 minutes for Arbitrum finality)',
        `4. Retrieve the signed VAA from the Wormhole guardian network`,
        '5. Call completeWormholeTransfer(vaaBytes) on this client to redeem tokens on Solana',
      ],
    };
  }

  /**
   * Generate CCTP transfer instructions for native USDC
   *
   * Produces the EVM calldata for Circle's TokenMessenger depositForBurn function,
   * which burns USDC on the source chain and mints native USDC on Solana.
   *
   * @param sourceChain - Source chain (ethereum or arbitrum)
   * @param amount - Amount of USDC to bridge (6 decimals)
   */
  async generateCctpInstructions(
    sourceChain: 'ethereum' | 'arbitrum',
    amount: BN
  ): Promise<{
    sourceChainCalldata: string;
    recipientAddress: string;
    instructions: string[];
  }> {
    const recipientAddress = this.wallet.publicKey.toBase58();
    const recipientBytes = this.wallet.publicKey.toBytes();

    // Encode depositForBurn(uint256,uint32,bytes32,address)
    // selector = keccak256("depositForBurn(uint256,uint32,bytes32,address)")[:4]
    const functionSelector = '0x6fd3504e';
    const amountHex = amount.toString(16).padStart(64, '0');
    const destinationDomain = CCTP_DOMAINS['solana'].toString(16).padStart(64, '0');
    const mintRecipient = Buffer.from(recipientBytes).toString('hex').padStart(64, '0');
    const burnToken = USDC_ADDRESSES[sourceChain].replace('0x', '').padStart(64, '0');

    const sourceChainCalldata = `${functionSelector}${amountHex}${destinationDomain}${mintRecipient}${burnToken}`;

    const tokenMessengerAddress = CCTP_TOKEN_MESSENGER_ADDRESSES[sourceChain];
    const usdcAddress = USDC_ADDRESSES[sourceChain];

    return {
      sourceChainCalldata,
      recipientAddress,
      instructions: [
        `1. Approve ${tokenMessengerAddress} (CCTP Token Messenger) to spend ${amount.toString()} USDC (${usdcAddress})`,
        `2. Send transaction to ${tokenMessengerAddress} with calldata: ${sourceChainCalldata}`,
        '3. Wait for Circle attestation (~5-10 minutes)',
        `4. Fetch attestation from ${CCTP_ATTESTATION_API_URL}/attestations/{messageHash}`,
        '5. Call completeCctpTransfer(message, attestation) on this client to mint USDC on Solana',
      ],
    };
  }

  /**
   * Complete a Wormhole transfer on Solana
   *
   * Posts the signed VAA to the Wormhole Core Bridge for verification, then
   * calls completeTransfer on the Token Bridge to mint/release tokens to the
   * recipient's associated token account.
   *
   * @param vaaBytes - The signed VAA from Wormhole guardians
   */
  async completeWormholeTransfer(vaaBytes: Uint8Array): Promise<{
    signature: string;
    receivedAmount: BN;
    tokenMint: PublicKey;
  }> {
    // Step 1: Post VAA to Wormhole Core Bridge for on-chain verification
    await this.wormholeClient.postVaa(vaaBytes);

    // Step 2: Parse VAA to extract transfer details
    const parsedVaa = this.wormholeClient.parseVaa(vaaBytes);
    const transferPayload = this.wormholeClient.parseTokenTransferPayload(parsedVaa.payload);

    // Step 3: Complete the transfer via Token Bridge
    const result = await this.wormholeClient.completeTransfer(vaaBytes);

    return {
      signature: result.signature,
      receivedAmount: result.amount,
      tokenMint: result.mint,
    };
  }

  /**
   * Complete a CCTP transfer on Solana
   *
   * Calls receiveMessage on the CCTP Message Transmitter program with the
   * original message bytes and Circle's attestation. Native USDC is minted
   * to the recipient's associated token account.
   *
   * @param message - The CCTP message bytes from the source chain burn event
   * @param attestation - Circle's attestation signature bytes
   */
  async completeCctpTransfer(
    message: Uint8Array,
    attestation: Uint8Array
  ): Promise<{
    signature: string;
    receivedAmount: BN;
  }> {
    // Parse the CCTP message to extract the amount and recipient
    // CCTP message format:
    // - version: 4 bytes
    // - sourceDomain: 4 bytes
    // - destinationDomain: 4 bytes
    // - nonce: 8 bytes
    // - sender: 32 bytes
    // - recipient: 32 bytes
    // - destinationCaller: 32 bytes
    // - messageBody: remaining bytes
    //   - burnToken: 32 bytes, mintRecipient: 32 bytes, amount: 32 bytes, messageSender: 32 bytes
    const messageView = new DataView(message.buffer, message.byteOffset, message.byteLength);

    const nonce = messageView.getBigUint64(12, false);

    // messageBody starts at offset 116 (4+4+4+8+32+32+32)
    // amount is at messageBody offset 64 (after burnToken[32] + mintRecipient[32])
    const amountOffset = 116 + 64;
    // Read the last 8 bytes of the u256 amount (sufficient for USDC amounts)
    const amountHigh = messageView.getUint32(amountOffset + 24, false);
    const amountLow = messageView.getUint32(amountOffset + 28, false);
    const receivedAmount = new BN(amountHigh).shln(32).or(new BN(amountLow));

    // Derive the PDAs needed for the CCTP receiveMessage instruction
    const [messageTransmitterAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('message_transmitter_authority')],
      CrossChainClient.CCTP_MESSAGE_TRANSMITTER
    );

    const nonceBytes = Buffer.alloc(8);
    nonceBytes.writeBigUInt64BE(nonce);
    const [usedNoncesAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from('used_nonces'), nonceBytes],
      CrossChainClient.CCTP_MESSAGE_TRANSMITTER
    );

    // Build the receiveMessage instruction
    // Discriminator for receiveMessage
    const discriminator = Buffer.from([0x57, 0xb5, 0x0a, 0x69, 0x91, 0x66, 0x10, 0xa3]);
    const instructionData = Buffer.concat([
      discriminator,
      Buffer.from(new Uint32Array([message.length]).buffer), // message length prefix
      Buffer.from(message),
      Buffer.from(new Uint32Array([attestation.length]).buffer), // attestation length prefix
      Buffer.from(attestation),
    ]);

    const receiveMessageIx = new TransactionInstruction({
      programId: CrossChainClient.CCTP_MESSAGE_TRANSMITTER,
      keys: [
        { pubkey: this.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: messageTransmitterAuthority, isSigner: false, isWritable: false },
        { pubkey: usedNoncesAccount, isSigner: false, isWritable: true },
        { pubkey: CrossChainClient.CCTP_TOKEN_MESSENGER_MINTER, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    const transaction = new Transaction().add(receiveMessageIx);
    const signature = await sendAndConfirmTransaction(
      this.connection,
      transaction,
      [this.wallet.payer],
      { commitment: 'confirmed' }
    );

    return {
      signature,
      receivedAmount,
    };
  }

  /**
   * Check status of a pending bridge transfer
   *
   * Queries the Wormhole guardian API or Circle attestation API to determine
   * whether a cross-chain transfer has been attested and is ready for
   * redemption on Solana.
   *
   * @param sourceTxHash - Transaction hash on source chain
   * @param sourceChain - The source chain
   */
  async checkTransferStatus(
    sourceTxHash: string,
    sourceChain: CollateralSource
  ): Promise<CrossChainTransferStatus> {
    if (sourceChain === CollateralSource.Cctp) {
      return this.checkCctpTransferStatus(sourceTxHash);
    }

    // For Wormhole transfers, query the guardian API
    const emitterChain = sourceChain === CollateralSource.Ethereum
      ? WORMHOLE_CHAIN_IDS.ETHEREUM
      : WORMHOLE_CHAIN_IDS.ARBITRUM;

    try {
      const response = await fetch(
        `${WORMHOLE_API_URL}/v1/signed_vaa/${emitterChain}/${sourceTxHash}`
      );

      if (!response.ok) {
        // VAA not yet available - transfer is still pending guardian attestation
        return {
          sourceChain,
          sourceTxHash,
          amount: new BN(0),
          status: 'pending',
        };
      }

      const data = await response.json() as { vaaBytes: string };
      const vaaBytes = new Uint8Array(Buffer.from(data.vaaBytes, 'base64'));

      // Parse the VAA to get the transfer amount
      const parsedVaa = this.wormholeClient.parseVaa(vaaBytes);
      const transferPayload = this.wormholeClient.parseTokenTransferPayload(parsedVaa.payload);

      return {
        sourceChain,
        sourceTxHash,
        amount: transferPayload.amount,
        status: 'bridged',
        vaaBytes,
      };
    } catch (error) {
      return {
        sourceChain,
        sourceTxHash,
        amount: new BN(0),
        status: 'pending',
      };
    }
  }

  /**
   * Check status of a CCTP transfer via Circle's attestation API
   */
  private async checkCctpTransferStatus(
    sourceTxHash: string
  ): Promise<CrossChainTransferStatus> {
    try {
      const response = await fetch(
        `${CCTP_ATTESTATION_API_URL}/attestations/${sourceTxHash}`
      );

      if (!response.ok) {
        return {
          sourceChain: CollateralSource.Cctp,
          sourceTxHash,
          amount: new BN(0),
          status: 'pending',
        };
      }

      const data = await response.json() as { status: string; attestation?: string };

      if (data.status === 'complete' && data.attestation) {
        return {
          sourceChain: CollateralSource.Cctp,
          sourceTxHash,
          amount: new BN(0), // Amount is in the original message, not the attestation response
          status: 'bridged',
        };
      }

      return {
        sourceChain: CollateralSource.Cctp,
        sourceTxHash,
        amount: new BN(0),
        status: 'pending',
      };
    } catch (error) {
      return {
        sourceChain: CollateralSource.Cctp,
        sourceTxHash,
        amount: new BN(0),
        status: 'pending',
      };
    }
  }

  /**
   * Get the wrapped token mint on Solana for a token from another chain
   *
   * Derives the wrapped mint PDA from the Wormhole Token Bridge using the
   * origin chain ID and origin token address as seeds.
   *
   * @param originChain - The origin chain
   * @param originAddress - The token address on origin chain (0x-prefixed hex for EVM)
   */
  async getWrappedMint(
    originChain: CollateralSource,
    originAddress: string
  ): Promise<PublicKey | null> {
    const chainId = this.getWormholeChainId(originChain);
    if (chainId === null) {
      return null;
    }

    // Convert EVM address to 32-byte format (left-padded with zeros)
    const addressBytes = new Uint8Array(32);
    const cleanAddress = originAddress.replace('0x', '');
    const addressBuffer = Buffer.from(cleanAddress, 'hex');
    addressBytes.set(addressBuffer, 32 - addressBuffer.length);

    const wrappedMint = await this.wormholeClient.getWrappedMintAddress(chainId, addressBytes);
    // Verify the mint account actually exists on-chain
    const accountInfo = await this.connection.getAccountInfo(wrappedMint);
    return accountInfo !== null ? wrappedMint : null;
  }

  /**
   * Check if a VAA has already been redeemed on Solana
   *
   * Looks up the claim account PDA in the Wormhole Token Bridge. If the
   * account exists, the VAA has already been processed.
   *
   * @param vaaHash - Hash of the VAA (32 bytes)
   */
  async isVaaRedeemed(vaaHash: Uint8Array): Promise<boolean> {
    return this.wormholeClient.isVaaRedeemed(vaaHash);
  }

  /**
   * Map CollateralSource enum to Wormhole chain ID
   */
  private getWormholeChainId(source: CollateralSource): number | null {
    switch (source) {
      case CollateralSource.Ethereum:
        return WORMHOLE_CHAIN_IDS.ETHEREUM;
      case CollateralSource.Arbitrum:
        return WORMHOLE_CHAIN_IDS.ARBITRUM;
      default:
        return null;
    }
  }
}
