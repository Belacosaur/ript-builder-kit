import { readFileSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import {
  verifyAcceptance,
  type AcceptanceRun,
  type AcceptanceRequirements,
} from "../shared/evidence.js";
import { clientBuild } from "../server/build.js";
import { sanitize } from "../shared/sanitize.js";
export function verifyRecordedRun(
  run: AcceptanceRun,
  requirements: AcceptanceRequirements,
) {
  const structural = verifyAcceptance(run, requirements);
  return {
    ...structural,
    ok: false,
    structuralEvidenceComplete: structural.ok,
    independentChainAttestation: false,
    failures: [
      ...structural.failures,
      "independent-chain-and-ecvrf-attestation-required",
    ],
  };
}
export async function main(args = process.argv.slice(2)) {
  const file = args.find((a) => a.startsWith("--file="))?.slice(7);
  if (!file)
    throw new Error(
      "Use npm run acceptance:verify -- --file=<exported-run.json>; start the local app first.",
    );
  if (statSync(file).size > 2_000_000)
    throw new Error("evidence_file_too_large");
  const run = JSON.parse(readFileSync(file, "utf8")) as AcceptanceRun;
  if (!["sandbox", "live"].includes(run.scope?.environment))
    throw new Error("invalid_evidence_environment");
  const response = await fetch(
    "http://127.0.0.1:4315/api/network/" + run.scope.environment,
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw new Error("network_metadata_unavailable");
  const network = (await response.json()) as any;
  const reveal = run.steps?.find((e) => e.operation === "reveal");
  const orderId = run.steps
    ?.map((e) => e.details?.orderId)
    .find((id) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id));
  const result = verifyRecordedRun(run, {
    scope: { ...run.scope, chain: network.chain },
    mint: network.token,
    clientVersion: clientBuild(),
    quantity: reveal?.details?.cards?.length ?? 0,
    orderId,
    operations: [
      "payment",
      "fulfilment",
      "reveal",
      "proof",
      "keep",
      "sellback",
    ],
  });
  console.log(
    JSON.stringify(sanitize({ gate: "real-acceptance", ...result }), null, 2),
  );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main()
    .then((r) => {
      if (!r.ok) process.exitCode = 1;
    })
    .catch((e) => {
      console.error(e instanceof Error ? e.message : "verification_failed");
      process.exitCode = 1;
    });
