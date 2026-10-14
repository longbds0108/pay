"use client";

import { AlertTriangle, CheckCircle2, Download, FileLock2, Loader2, Lock, Upload } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { Countdown, TimeNote } from "@/components/countdown";
import { BidRiskNotice } from "@/components/bid-risk-notice";
import { BuyerHistory } from "@/components/buyer-history";
import { WalletGate } from "@/components/gates";
import { PageHeader } from "@/components/page-header";
import { TenderShell } from "@/components/tender-shell";
import { TxStatus } from "@/components/tx-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AmountInput, FieldError, Label } from "@/components/ui/input";
import { computeCommitment, randomBytes32 } from "@/lib/commitment";
import { blindBidAddress, TenderState } from "@/lib/contracts";
import { encryptDocument, generateDocKey } from "@/lib/crypto";
import { formatBudget, formatNativeWei, isValidAmountInput, parseUsdc6, shortAddress } from "@/lib/format";
import { describeError, useBlindBidTx, useMyBid, type TenderRow } from "@/lib/hooks";
import { uploadJson } from "@/lib/ipfs";
import type { TenderMetadata } from "@/lib/metadata";
import { downloadTextFile, saveEntries, toBackupJson, type VaultEntry } from "@/lib/salt-vault";
import { cn } from "@/lib/utils";
import { chain } from "@/lib/wagmi";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export default function SubmitBidPage() {
  return (
    <TenderShell>
      {({ row, meta }) => (
        <>
          <PageHeader
            eyebrow={`Sealed bid · tender #${row.id}`}
            title={meta?.title ?? `Bid on tender #${row.id}`}
            description="Your price is sealed with a cryptographic commitment and your documents are encrypted in this browser."
          />
          <WalletGate message="Connect the wallet you will bid with.">
            <BidGuard row={row} meta={meta} />
          </WalletGate>
        </>
      )}
    </TenderShell>
  );
}

function BidGuard({ row, meta }: { row: TenderRow; meta?: TenderMetadata }) {
  const { address } = useAccount();
  const myBid = useMyBid(row.id);
  if (row.state !== TenderState.Open) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <span>
          Submissions for this tender are closed.{" "}
          <Link className="underline" href={`/tenders/${row.id}`}>
            Back to tender
          </Link>
        </span>
      </Alert>
    );
  }
  if (address?.toLowerCase() === row.tender.buyer.toLowerCase()) {
    return (
      <Alert variant="warning">
        <AlertTriangle />
        <span>You created this tender, so you cannot bid on it.</span>
      </Alert>
    );
  }
  if (myBid.isLoading) return <Loader2 className="animate-spin" />;
  const hasBid = !!myBid.data && myBid.data.commitment !== `0x${"0".repeat(64)}`;
  return <BidForm row={row} meta={meta} isUpdate={hasBid} onDone={() => void myBid.refetch()} />;
}

type Prepared = { entry: VaultEntry; commitment: Hex; encryptedDocURI: string };

function BidForm({ row, meta, isUpdate, onDone }: { row: TenderRow; meta?: TenderMetadata; isUpdate: boolean; onDone: () => void }) {
  const { id, tender } = row;
  const { address } = useAccount();
  const tx = useBlindBidTx();
  const [amountInput, setAmountInput] = useState("");
  const [file, setFile] = useState<File>();
  const fileRef = useRef<HTMLInputElement>(null);
  const [inputError, setInputError] = useState<string>();
  const [sealing, setSealing] = useState(false);
  const [prepared, setPrepared] = useState<Prepared>();
  const [backedUp, setBackedUp] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [localSaved, setLocalSaved] = useState<boolean>();
  // What the confirmed transaction did. `isUpdate` flips to true as soon as the new bid is refetched,
  // so the success screen must not read it.
  const [completed, setCompleted] = useState<"submitted" | "updated">();

  const amount6 = isValidAmountInput(amountInput) ? parseUsdc6(amountInput) : undefined;
  const outsideBudget = amount6 !== undefined && (amount6 < tender.budgetMin || amount6 > tender.budgetMax);

  function invalidate() {
    setPrepared(undefined);
    setBackedUp(false);
    setAcknowledged(false);
    tx.reset();
  }

  async function seal() {
    setInputError(undefined);
    if (!address || !blindBidAddress) return;
    if (amount6 === undefined || amount6 === 0n) return setInputError("Enter your bid amount in USDC (max 6 decimals).");
    if (!file) return setInputError("Attach your technical proposal.");
    if (file.size > MAX_FILE_BYTES) return setInputError("File is larger than 20 MB.");

    setSealing(true);
    try {
      const salt = randomBytes32();
      const docKey = generateDocKey();
      const envelope = await encryptDocument(
        { name: file.name, type: file.type || "application/octet-stream", bytes: new Uint8Array(await file.arrayBuffer()) },
        docKey,
      );
      // Only ciphertext leaves the browser.
      const encryptedDocURI = await uploadJson(envelope, "sealed-bid.json");
      const commitment = computeCommitment({ tenderId: id, bidder: address, amount6, salt, docKey });
      const entry: VaultEntry = {
        v: 1,
        chainId: chain.id,
        contract: blindBidAddress,
        tenderId: id.toString(),
        bidder: address,
        amount6: amount6.toString(),
        salt,
        docKey,
        encryptedDocURI,
        createdAt: Date.now(),
      };
      setLocalSaved(saveEntries([entry]));
      setPrepared({ entry, commitment, encryptedDocURI });
    } catch (e) {
      setInputError(describeError(e));
    } finally {
      setSealing(false);
    }
  }

  function downloadBackup() {
    if (!prepared || !address) return;
    downloadTextFile(`hedgora-tender-${id}-${shortAddress(address).replace("…", "-")}.json`, toBackupJson([prepared.entry]));
    setBackedUp(true);
  }

  async function submit() {
    if (!prepared) return;
    const wasUpdate = isUpdate;
    const receipt = wasUpdate
      ? await tx.send("updateBid", [id, prepared.commitment, prepared.encryptedDocURI])
      : await tx.send("submitBid", [id, prepared.commitment, prepared.encryptedDocURI], tender.bidBond);
    if (receipt) {
      setCompleted(wasUpdate ? "updated" : "submitted");
      onDone();
    }
  }

  if (tx.status === "success" && completed) {
    return (
      <Card>
        <CardContent className="space-y-4 py-10 text-center">
          <CheckCircle2 className="mx-auto size-10 text-success" />
          <p className="text-lg font-semibold">Sealed bid {completed}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Keep your backup file safe. When the reveal window opens (
            <Countdown className="inline-flex" deadline={tender.submissionDeadline} label="in" passedLabel="now" />) reveal from{" "}
            <Link href="/my/bids" className="underline">My Bids</Link>.
          </p>
          <TxStatus status={tx.status} hash={tx.hash} />
          <Button asChild variant="outline">
            <Link href={`/tenders/${id}`}>Back to tender</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <BidRiskNotice tender={tender} />
        {isUpdate && (
          <Alert variant="info">
            <Lock />
            <span>You already have a sealed bid. Submitting again replaces it — you must keep the <b>new</b> backup file.</span>
          </Alert>
        )}
        <Step n={1} title="Your offer" done={!!prepared} active={!prepared}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Bid amount (USDC)</Label>
              <AmountInput
                id="amount"
                placeholder="0.00"
                value={amountInput}
                onChange={(v) => {
                  setAmountInput(v);
                  invalidate();
                }}
              />
              {outsideBudget && (
                <p className="text-xs text-warning">Outside the expected budget ({formatBudget(tender.budgetMin, tender.budgetMax)}). You can still bid.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc">Technical proposal</Label>
              {/* Native file inputs are labelled in the browser's language; use our own English control. */}
              <div className="flex min-w-0 items-center gap-3 well rounded-full p-1.5 pr-4">
                <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload /> Choose file
                </Button>
                <span className={cn("truncate text-sm", !file && "text-muted-foreground")}>{file?.name ?? "No file chosen"}</span>
              </div>
              <input
                ref={fileRef}
                id="doc"
                type="file"
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  invalidate();
                }}
              />
              <p className="text-xs text-muted-foreground">Encrypted with AES-256-GCM in your browser before upload. Max 20 MB.</p>
            </div>
            <FieldError>{inputError}</FieldError>
            <Button onClick={seal} disabled={sealing || !!prepared}>
              {sealing ? <Loader2 className="animate-spin" /> : <FileLock2 />}
              {sealing ? "Encrypting & uploading…" : prepared ? "Sealed" : "Seal bid"}
            </Button>
          </div>
        </Step>

        <Step n={2} title="Back up your secrets (required)" done={backedUp} active={!!prepared && !backedUp}>
          <p className="mb-3 text-sm text-muted-foreground">
            The backup file holds your amount, salt and document key. Without it you cannot reveal — your bid is excluded
            {tender.bidBond > 0n ? ` and your ${formatNativeWei(tender.bidBond)} bond is forfeited` : ""}. A copy is also kept in this
            browser{localSaved === false ? " (failed: browser storage unavailable — the file is your only copy)" : ""}, but do not rely on it.
          </p>
          <Button variant={backedUp ? "outline" : "default"} disabled={!prepared} onClick={downloadBackup}>
            <Download /> {backedUp ? "Download again" : "Download backup file"}
          </Button>
        </Step>

        <Step n={3} title={isUpdate ? "Replace sealed bid" : "Submit sealed bid"} done={false} active={backedUp}>
          <label className="mb-4 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={acknowledged} disabled={!backedUp} onChange={(e) => setAcknowledged(e.target.checked)} />
            I read the reveal window and bond rules above, stored the backup file somewhere safe, and understand I must
            reveal between the submission and reveal deadlines.
          </label>
          <Button size="lg" disabled={!backedUp || !acknowledged || tx.busy} onClick={submit}>
            {tx.busy && <Loader2 className="animate-spin" />}
            {isUpdate ? "Replace sealed bid" : `Submit sealed bid${tender.bidBond > 0n ? ` + ${formatNativeWei(tender.bidBond)} bond` : ""}`}
          </Button>
          <div className="mt-3">
            <TxStatus status={tx.status} hash={tx.hash} error={tx.error} />
          </div>
        </Step>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle>{meta?.title ?? `Tender #${id}`}</CardTitle>
            <CardDescription>Expected budget {formatBudget(tender.budgetMin, tender.budgetMax)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Countdown deadline={tender.submissionDeadline} label="Submissions close in" />
            <p>Bid bond: {tender.bidBond > 0n ? formatNativeWei(tender.bidBond) : "none"}</p>
            <TimeNote />
          </CardContent>
        </Card>
        <Alert variant="info">
          <Lock />
          <span>
            Only <code>keccak256(tender, you, amount, salt, hash(docKey))</code> goes on-chain now. Nobody, including the
            buyer, can read your price until you reveal it.
          </span>
        </Alert>
        <BuyerHistory buyer={tender.buyer} />
      </div>
    </div>
  );
}

function Step({ n, title, done, active, children }: { n: number; title: string; done: boolean; active: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn(!done && !active && "opacity-60")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-7 place-items-center rounded-full border text-sm",
              done && "border-success bg-success text-white",
              active && "border-primary text-primary",
            )}
          >
            {done ? <CheckCircle2 className="size-4" /> : n}
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
