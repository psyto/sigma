/**
 * FundingSwapClient must call the funding-swap program's instructions with the
 * program's names, argument counts and accounts. Checked against the program
 * source (programs/funding-swap/src/lib.rs) and, when built, its IDL.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const PROGRAM_SRC = readFileSync(join(ROOT, "programs/funding-swap/src/lib.rs"), "utf8");
const SDK_SRC = readFileSync(join(__dirname, "..", "funding-swap.ts"), "utf8");
const IDL_PATH = join(ROOT, "target/idl/funding_swap.json");

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toCamel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Anchor's default instruction discriminator */
function discriminator(ixName: string): number[] {
  return [...createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8)];
}

/** Split on commas that are not inside (), <>, [] or {} */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if ("(<[{".includes(ch)) depth++;
    if (")>]}".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter((x) => x.length > 0);
}

interface ProgramIx {
  args: string[];
  accounts: string[];
}

/** Instructions of the `#[program]` module: snake name -> arg names, account fields */
function programInstructions(): Map<string, ProgramIx> {
  const structs = new Map<string, string[]>();
  const structRe = /#\[derive\(Accounts\)\][\s\S]*?pub struct (\w+)<'info> \{([\s\S]*?)\n\}/g;
  for (const m of PROGRAM_SRC.matchAll(structRe)) {
    structs.set(m[1], [...m[2].matchAll(/^\s*pub (\w+):/gm)].map((f) => f[1]));
  }
  const ixs = new Map<string, ProgramIx>();
  const fnRe = /pub fn (\w+)\(\s*ctx: Context<(\w+)>,?([^)]*)\)/g;
  for (const m of PROGRAM_SRC.matchAll(fnRe)) {
    const accounts = structs.get(m[2]);
    if (!accounts) throw new Error(`no Accounts struct ${m[2]} for ${m[1]}`);
    const args = splitTopLevel(m[3]).map((a) => a.split(":")[0].trim());
    ixs.set(m[1], { args, accounts });
  }
  return ixs;
}

interface SdkCall {
  method: string;
  argCount: number;
  accounts: string[];
}

/** Every `.methods.<name>(...).accounts({...})` call in the SDK client */
function sdkCalls(): SdkCall[] {
  const re = /\.methods\s*\.(\w+)\(([^)]*)\)\s*\.accounts\(\{([\s\S]*?)\}\)/g;
  return [...SDK_SRC.matchAll(re)].map((m) => ({
    method: m[1],
    argCount: splitTopLevel(m[2]).length,
    accounts: splitTopLevel(m[3]).map((a) => a.split(":")[0].trim()),
  }));
}

const PROGRAM = programInstructions();

const PINNED_DISCRIMINATORS: Record<string, number[]> = {
  initialize_pool: [0x5f, 0xb4, 0x0a, 0xac, 0x54, 0xae, 0xe8, 0x28],
  open_receiver: [0xca, 0x85, 0x3f, 0x48, 0xd2, 0x9c, 0xcf, 0xb7],
  open_payer: [0x77, 0xf5, 0xd0, 0x59, 0x8c, 0xe5, 0xd1, 0xd1],
  process_funding_period: [0x92, 0xcc, 0x49, 0x9d, 0x42, 0xc0, 0x40, 0x5a],
};
const CALLS = sdkCalls();

describe("FundingSwapClient matches programs/funding-swap", () => {
  it("parses the program and the client", () => {
    expect(PROGRAM.size).toBeGreaterThanOrEqual(13);
    expect(CALLS.length).toBeGreaterThanOrEqual(13);
  });

  it("calls the instructions the program defines, including open/process", () => {
    const called = new Set(CALLS.map((c) => toSnake(c.method)));
    for (const name of ["initialize_pool", "open_receiver", "open_payer", "process_funding_period"]) {
      expect(called.has(name)).toBe(true);
    }
    for (const c of CALLS) {
      expect(PROGRAM.has(toSnake(c.method))).toBe(true);
    }
  });

  it.each(CALLS.map((c) => [c.method, c] as const))("%s passes the program's args and accounts", (_, c) => {
    const ix = PROGRAM.get(toSnake(c.method))!;
    expect(c.argCount).toBe(ix.args.length);
    expect(c.accounts).toEqual(ix.accounts.map(toCamel));
  });

  it("open_receiver / open_payer / process_funding_period have the expected shape", () => {
    expect(PROGRAM.get("open_receiver")!.args).toEqual(["notional", "duration_periods", "max_fixed_rate_bps"]);
    expect(PROGRAM.get("open_payer")!.args).toEqual(["notional", "duration_periods", "min_fixed_rate_bps"]);
    expect(PROGRAM.get("process_funding_period")!.args).toEqual([]);
    expect(PROGRAM.get("open_receiver")!.accounts).toContain("swap");
  });

  it("uses the program's discriminators (no overrides in the source)", () => {
    expect(PROGRAM_SRC).not.toMatch(/#\[instruction\(discriminator/);
    // Pinned; programs/funding-swap/tests/sdk_instructions.rs checks the
    // program's generated discriminators against the same bytes
    for (const [name, bytes] of Object.entries(PINNED_DISCRIMINATORS)) {
      expect(PROGRAM.has(name)).toBe(true);
      expect(discriminator(name)).toEqual(bytes);
    }
  });

  it("initializePool passes every PoolParams field", () => {
    const body = /pub struct PoolParams \{([\s\S]*?)\n\}/.exec(PROGRAM_SRC)![1];
    const fields = [...body.matchAll(/^\s*pub (\w+):/gm)].map((f) => toCamel(f[1]));
    const iface = /export interface FundingPoolParams \{([\s\S]*?)\n\}/.exec(SDK_SRC)![1];
    const sdkFields = [...iface.matchAll(/^\s*(\w+):/gm)].map((f) => f[1]);
    expect(["marketSymbol", ...sdkFields].sort()).toEqual([...fields].sort());
    expect(SDK_SRC).toMatch(/\.initializePool\(\{ marketSymbol, \.\.\.params \}\)/);
  });

  (existsSync(IDL_PATH) ? it : it.skip)("matches the built IDL", () => {
    const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
    for (const c of CALLS) {
      const ix = idl.instructions.find((i: any) => i.name === toSnake(c.method));
      expect(ix).toBeDefined();
      expect(ix.discriminator).toEqual(discriminator(ix.name));
      expect(ix.args.length).toBe(c.argCount);
      expect(c.accounts).toEqual(ix.accounts.map((a: any) => toCamel(a.name)));
    }
  });
});
