import { PublicKey } from "@solana/web3.js";
import type { ServiceCall } from "./inventory.js";
import type {
  CaptureRequest,
  CollectionQuery,
  WalletVerification,
  PhotoRequest,
  ResolutionRequest,
} from "../../shared/collector-contract.js";
import { privateAssetUrl } from "../../shared/private-assets.js";
export function walletIsLinked(data: any, wallet: string) {
  return !!data?.wallets?.some(
    (w: any) =>
      w.pubkey === wallet &&
      w.verifiedAt &&
      Number.isFinite(Date.parse(w.verifiedAt)),
  );
}
export function createCollectorClient(
  call: ServiceCall,
  now: () => number = Date.now,
) {
  const photos = new Map<string, { url: string; expires: number }>();
  const get = (id: string) => call("get", { id });
  return {
    wallets: () => call("wallets", {}),
    challenge: (pubkey: string) => call("challenge", {}, { pubkey }),
    verify: (body: WalletVerification) => call("verify", {}, body),
    capabilities: () => call("capabilities", {}),
    list: (q: CollectionQuery = {}) =>
      call(
        "collection",
        Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])),
      ),
    get,
    async followCapture(
      id: string,
      revision: number,
      ports: {
        deadline: number;
        check: () => void;
        sleep: (ms: number) => Promise<void>;
        observe: (row: any) => void;
      },
    ) {
      while (now() < ports.deadline) {
        ports.check();
        const row = await get(id);
        ports.check();
        if (row.revision !== revision) throw new Error("stale_revision_result");
        ports.observe(row);
        if (
          ["complete", "failed", "cancelled", "awaiting_photo"].includes(
            row.jobStatus,
          )
        )
          return row;
        await ports.sleep(Math.min(1000, Math.max(0, ports.deadline - now())));
      }
      throw new Error("identification_pending_deadline");
    },
    async capture(body: CaptureRequest) {
      const row = await call("sync", {}, body);
      if (row.revision !== body.revision || row.captureId !== body.captureId)
        throw new Error("stale_capture_result");
      return row;
    },
    presignPhoto: (id: string, side: "front" | "back", body: PhotoRequest) =>
      call("photoPresign", { id, side }, body),
    attachPhoto: (id: string, side: "front" | "back", body: PhotoRequest) =>
      call("photoComplete", { id, side }, body),
    retry: (id: string) => call("retry", { id }, {}),
    resolve: (id: string, body: ResolutionRequest) =>
      call("resolve", { id }, body),
    submitForSale: (id: string, revision: number) =>
      call("submit", { id }, { revision, confirmed: true }),
    async linkWallet(
      pubkey: string,
      current: () => string,
      sign: (
        bytes: Uint8Array,
      ) => Promise<Uint8Array | { signature: Uint8Array }>,
    ) {
      const check = () => {
        if (current() !== pubkey) throw new Error("scope_changed");
      };
      check();
      const challenge = await call("challenge", {}, { pubkey });
      check();
      const escaped = pubkey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (
        typeof challenge.message !== "string" ||
        !new RegExp(
          "^Sign this message to link wallet: pp:[0-9a-f-]{36}:" +
            escaped +
            ":[0-9a-f]{32}$",
        ).test(challenge.message) ||
        Date.parse(challenge.expiresAt) <= now() ||
        !Number.isFinite(Date.parse(challenge.expiresAt))
      )
        throw new Error("wallet_challenge_invalid");
      const returned = await sign(new TextEncoder().encode(challenge.message));
      check();
      const signature =
        returned instanceof Uint8Array ? returned : returned.signature;
      if (signature.length !== 64 || signature.every((v) => v === 0))
        throw new Error("wallet_signature_invalid");
      const key = await crypto.subtle.importKey(
        "raw",
        new Uint8Array(new PublicKey(pubkey).toBytes()).buffer,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
      if (
        !(await crypto.subtle.verify(
          "Ed25519",
          key,
          new Uint8Array(signature).buffer,
          new TextEncoder().encode(challenge.message),
        ))
      )
        throw new Error("wallet_signature_invalid");
      check();
      await call(
        "verify",
        {},
        {
          pubkey,
          message: challenge.message,
          signature: btoa(
            Array.from(signature, (c) => String.fromCharCode(c)).join(""),
          ),
        },
      );
      check();
      const linked = await call("wallets", {});
      check();
      if (!walletIsLinked(linked, pubkey))
        throw new Error("collector_wallet_not_verified");
      return linked;
    },
    async photo(id: string, side: "front" | "back") {
      const key = id + ":" + side,
        cached = photos.get(key);
      if (cached && cached.expires > now()) return cached.url;
      const data = await call("photo", { id, side });
      const url = privateAssetUrl(data.url);
      if (!Number.isFinite(data.expiresIn) || data.expiresIn <= 0)
        throw new Error("private_asset_expiry_invalid");
      photos.set(key, {
        url,
        expires: now() + Math.max(0, data.expiresIn * 1000 - 100),
      });
      return url;
    },
    async uploadPhoto(
      id: string,
      side: "front" | "back",
      revision: number,
      file: File,
      check: () => void,
    ) {
      if (file.size < 4 || file.size > 25 * 1024 * 1024)
        throw new Error("jpeg_size_invalid");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes[0] !== 255 || bytes[1] !== 216)
        throw new Error("jpeg_required");
      const sha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      check();
      const receipt = await call(
        "photoPresign",
        { id, side },
        { revision, sha256, bytes: file.size },
      );
      check();
      const url = privateAssetUrl(receipt.uploadUrl);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(receipt.headers ?? {})) {
        if (k.toLowerCase() === "content-length") {
          if (v !== String(file.size))
            throw new Error("private_upload_length_mismatch");
          continue;
        }
        if (
          !["content-type", "x-amz-checksum-sha256", "cache-control"].includes(
            k.toLowerCase(),
          ) ||
          typeof v !== "string"
        )
          throw new Error("private_upload_headers_invalid");
        headers[k] = v;
      }
      const response = await fetch(url, {
        method: "PUT",
        headers,
        body: file,
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      check();
      if (!response.ok) throw new Error("private_photo_upload_failed");
      const result = await call(
        "photoComplete",
        { id, side },
        { revision, sha256 },
      );
      check();
      if (result.revision !== revision)
        throw new Error("stale_revision_result");
      return result;
    },
  };
}
