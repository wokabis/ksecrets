#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import Conf from "conf";
import { CreatePushSchema, type CreatePushInput, type PushKind } from "@ksecrets/types";
import { encryptWithMasterKey, decryptWithMasterKey, deserializeResult, serializationResult } from "@ksecrets/crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = new Conf({ projectName: "ksecrets-cli" });

interface CliConfig {
  apiUrl?: string;
  apiKey?: string;
  token?: string;
  masterKey?: string;
}

function getConfig(): CliConfig {
  return config.store as CliConfig;
}

function setConfig(key: keyof CliConfig, value: string) {
  config.set(key, value);
}

async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const cfg = getConfig();
  const baseUrl = cfg.apiUrl || "https://api.ksecrets.example.com";
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...options.headers as Record<string, string>,
  };

  if (cfg.apiKey) {
    headers["X-API-Key"] = cfg.apiKey;
  }
  if (cfg.token) {
    headers["Authorization"] = `Bearer ${cfg.token}`;
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(error.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

program
  .name("ksecrets")
  .description("KSecrets CLI - Securely share secrets from your terminal")
  .version("0.1.0");

program
  .command("config")
  .description("Configure CLI settings")
  .option("-u, --url <url>", "API base URL")
  .option("-k, --key <key>", "API key")
  .option("-m, --master-key <key>", "Master encryption key (hex)")
  .action((options) => {
    if (options.url) setConfig("apiUrl", options.url);
    if (options.key) setConfig("apiKey", options.key);
    if (options.masterKey) setConfig("masterKey", options.masterKey);
    console.log(chalk.green("Configuration saved"));
    const shown = { ...getConfig() };
    if (shown.apiKey) shown.apiKey = shown.apiKey.slice(0, 6) + "...";
    if (shown.token) shown.token = shown.token.slice(0, 6) + "...";
    if (shown.masterKey) shown.masterKey = shown.masterKey.slice(0, 6) + "...";
    console.log(chalk.gray(JSON.stringify(shown, null, 2)));
  });

program
  .command("push")
  .description("Create a new secure push")
  .option("-t, --type <type>", "Type: password, note, url, file", "password")
  .option("-p, --payload <payload>", "Secret payload (or - for stdin)")
  .option("-f, --file <path>", "File to upload")
  .option("--passphrase <passphrase>", "Optional passphrase")
  .option("--views <number>", "Expire after N views", "1")
  .option("--days <number>", "Expire after N days", "7")
  .option("--filename <name>", "Filename for file uploads")
  .option("--note <note>", "Note for recipient")
  .option("--email <email>", "Recipient email for audit")
  .option("-q, --quiet", "Output only the URL")
  .action(async (options) => {
    const spinner = ora("Creating push...").start();

    try {
      const cfg = getConfig();

      if (options.file) {
        const fileBuffer = readFileSync(options.file);
        const name = options.filename || options.file.split("/").pop() || "file";
        const form = new FormData();
        form.append("file", new Blob([fileBuffer as any]), name);
        if (options.passphrase) form.append("passphrase", options.passphrase);
        if (options.views) form.append("expiryViews", options.views);
        if (options.days) form.append("expiryDays", options.days);
        if (options.note) form.append("note", options.note);
        if (options.email) form.append("retrieverEmail", options.email);

        const data = await apiRequest("/api/v2/files", { method: "POST", body: form });
        spinner.succeed("File push created!");
        if (options.quiet) {
          console.log(data.secretUrl);
        } else {
          console.log(chalk.cyan("\nPreview URL:"), data.url);
          console.log(chalk.cyan("Secret URL:"), data.secretUrl);
          console.log(chalk.gray(`File: ${data.filename} (${data.size} bytes)`));
          console.log(chalk.gray(`Views: ${data.views}/${data.maxViews || "∞"}`));
          console.log(chalk.gray(`Expires: ${data.expiresAt || "Never"}`));
          if (data.hasPassphrase) console.log(chalk.yellow("Passphrase protected"));
        }
        return;
      }

      let payload = options.payload;
      const kind: PushKind = options.type as PushKind;
      const filename = options.filename;
      const contentType: string | undefined = undefined;
      const size: number | undefined = undefined;

      if (!payload) {
        spinner.fail("Payload required");
        process.exit(1);
      }

      if (payload === "-") {
        payload = readFileSync(0, "utf-8").trim();
      }

      const pushKey = randomBytes(32);
      const keyFragment = pushKey.toString("base64url");
      const result = await encryptWithMasterKey(payload!, new Uint8Array(pushKey), "web");
      const encryptedPayload = serializationResult(result);

      const input: CreatePushInput = {
        kind,
        payload: encryptedPayload,
        passphrase: options.passphrase,
        expiryViews: parseInt(options.views),
        expiryDays: parseInt(options.days),
        filename,
        contentType,
        size,
        note: options.note,
        retrieverEmail: options.email,
      };

      const parsed = CreatePushSchema.safeParse(input);
      if (!parsed.success) {
        spinner.fail("Validation failed: " + parsed.error.errors.map((e) => e.message).join(", "));
        process.exit(1);
      }

      const data = await apiRequest("/api/v2/pushes", {
        method: "POST",
        body: JSON.stringify(parsed.data),
      });

      spinner.succeed("Push created!");

      if (options.quiet) {
        console.log(`${data.secretUrl}#k=${keyFragment}`);
      } else {
        console.log(chalk.cyan("\nPreview URL:"), `${data.url}#k=${keyFragment}`);
        console.log(chalk.cyan("Secret URL:"), `${data.secretUrl}#k=${keyFragment}`);
        console.log(chalk.gray(`\nType: ${data.kind}`));
        console.log(chalk.gray(`Views: ${data.views}/${data.maxViews || "∞"}`));
        console.log(chalk.gray(`Expires: ${data.expiresAt || "Never"}`));
        if (data.hasPassphrase) console.log(chalk.yellow("Passphrase protected"));
      }
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed to create push");
      process.exit(1);
    }
  });

program
  .command("view <id>")
  .description("View a push by ID")
  .option("--passphrase <passphrase>", "Passphrase if required")
  .option("--key <key>", "Per-push decryption key (base64url, usually in the URL fragment)")
  .option("-o, --output <path>", "Write file push content to this path")
  .option("-q, --quiet", "Output only the payload or downloaded path")
  .action(async (id, options) => {
    const spinner = ora("Fetching push...").start();

    try {
      const keyMatch = /#k=([A-Za-z0-9_-]+)/.exec(id);
      const idMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(id);
      const pushId = idMatch ? idMatch[1] : id;
      const pushKeyValue = options.key || keyMatch?.[1];

      const data = await apiRequest("/api/v2/pushes/" + pushId, {
        method: "POST",
        body: JSON.stringify({ passphrase: options.passphrase }),
      });

      if (data.kind === "file" && data.downloadUrl) {
        const cfg = getConfig();
        const baseUrl = cfg.apiUrl || "https://api.ksecrets.example.com";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (cfg.apiKey) headers["X-API-Key"] = cfg.apiKey;
        if (cfg.token) headers["Authorization"] = `Bearer ${cfg.token}`;
        const fileRes = await fetch(`${baseUrl}${data.downloadUrl}`, {
          method: "POST",
          headers,
          body: JSON.stringify({ passphrase: options.passphrase }),
        });
        if (!fileRes.ok) {
          const err = await fileRes.json().catch(() => ({} as any));
          throw new Error(err.error?.message || `Download failed (HTTP ${fileRes.status})`);
        }
        const outPath = options.output || data.filename || "download";
        const buf = Buffer.from(await fileRes.arrayBuffer());
        writeFileSync(outPath, buf);
        spinner.succeed(`File downloaded to ${outPath} (${buf.length} bytes)`);
        if (options.quiet) console.log(outPath);
        return;
      }

      spinner.succeed("Push retrieved!");

      const cfg = getConfig();
      if (typeof data.payload === "string" && data.payload.startsWith("{\"c\":")) {
        const keyBytes = pushKeyValue
          ? new Uint8Array(Buffer.from(pushKeyValue, "base64url"))
          : cfg.masterKey
            ? new Uint8Array(Buffer.from(cfg.masterKey, "hex"))
            : null;
        if (!keyBytes) {
          throw new Error("This push is encrypted. Pass --key or use the full secret URL (with #k=...).");
        }
        const decrypted = await decryptWithMasterKey(deserializeResult(data.payload), keyBytes, "web");
        data.payload = new TextDecoder().decode(decrypted);
      }

      if (options.quiet) {
        console.log(data.payload);
      } else {
        console.log(chalk.cyan("\nType:"), data.kind);
        console.log(chalk.cyan("Payload:"), data.payload);
        console.log(chalk.gray(`Views: ${data.views}/${data.maxViews || "∞"}`));
        console.log(chalk.gray(`Expires: ${data.expiresAt || "Never"}`));
        if (data.filename) console.log(chalk.gray(`File: ${data.filename} (${data.contentType}, ${data.size} bytes)`));
        if (data.note) console.log(chalk.gray(`Note: ${data.note}`));
        if (data.retrieverEmail) console.log(chalk.gray(`For: ${data.retrieverEmail}`));
      }
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed to fetch push");
      process.exit(1);
    }
  });

program
  .command("audit")
  .description("View audit logs")
  .option("--push-id <id>", "Filter by push ID")
  .option("--action <action>", "Filter by action")
  .option("--limit <number>", "Number of results", "50")
  .option("--offset <number>", "Offset for pagination", "0")
  .action(async (options) => {
    const spinner = ora("Fetching audit logs...").start();

    try {
      const params = new URLSearchParams({
        limit: options.limit,
        offset: options.offset,
        ...(options.pushId && { pushId: options.pushId }),
        ...(options.action && { action: options.action }),
      });

      const data = await apiRequest(`/api/v2/audit?${params}`);

      spinner.succeed(`Found ${data.total} audit entries`);

      console.log("");
      data.items.forEach((item: any) => {
        const time = new Date(item.createdAt).toLocaleString();
        const actionColor = item.action === "viewed" ? chalk.green : item.action === "created" ? chalk.blue : item.action === "expired" ? chalk.yellow : chalk.red;
        console.log(`${chalk.gray(time)} ${actionColor(item.action.padEnd(18))} ${chalk.gray(item.pushId.slice(0, 8))} ${item.ip || ""} ${item.retrieverEmail || ""}`);
      });

      if (data.hasMore) {
        console.log(chalk.gray(`\n... and ${data.total - data.items.length} more (use --offset to paginate)`));
      }
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed to fetch audit logs");
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Authenticate with the API")
  .option("-e, --email <email>", "Email")
  .option("-p, --password <password>", "Password")
  .action(async (options) => {
    const spinner = ora("Authenticating...").start();

    try {
      const { email, password } = options;
      const data = await apiRequest("/api/v2/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!data.accessToken) {
        spinner.fail(data.mfaRequired ? "MFA is enabled. Use an API key instead." : "Login failed");
        process.exit(1);
      }
      setConfig("token", data.accessToken);
      spinner.succeed(`Authenticated as ${data.user.email}`);
      console.log(chalk.gray("Token stored locally. Set the API URL with: ksecrets config --url <url>"));
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Authentication failed");
      process.exit(1);
    }
  });

program.parse();