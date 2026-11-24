#!/usr/bin/env node

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import Conf from "conf";
import { CreatePushSchema, type CreatePushInput, type PushKind } from "@pwpush/types";
import { encrypt, serializationResult } from "@pwpush/crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = new Conf({ projectName: "pwpush-cli" });

interface CliConfig {
  apiUrl?: string;
  apiKey?: string;
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
  const baseUrl = cfg.apiUrl || "https://api.pwpush.example.com";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options.headers as Record<string, string>,
  };

  if (cfg.apiKey) {
    headers["X-API-Key"] = cfg.apiKey;
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
  .name("pwpush")
  .description("Password Pusher CLI - Securely share secrets from your terminal")
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
    console.log(chalk.gray(JSON.stringify(getConfig(), null, 2)));
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
      if (!cfg.masterKey) {
        spinner.fail("Master key not configured. Run: pwpush config --master-key <hex>");
        process.exit(1);
      }

      let payload = options.payload;
      let kind: PushKind = options.type as PushKind;
      let filename = options.filename;
      let contentType: string | undefined;
      let size: number | undefined;

      if (options.file) {
        kind = "file";
        const fileBuffer = readFileSync(options.file);
        payload = fileBuffer.toString("base64");
        filename = filename || options.file.split("/").pop();
        contentType = "application/octet-stream";
        size = fileBuffer.length;
      }

      if (!payload && !options.file) {
        spinner.fail("Payload or file required");
        process.exit(1);
      }

      if (payload === "-") {
        payload = readFileSync(0, "utf-8").trim();
      }

      const masterKey = Buffer.from(cfg.masterKey, "hex");
      const result = await encrypt(payload!, masterKey);
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
        console.log(data.secretUrl);
      } else {
        console.log(chalk.cyan("\nPreview URL:"), data.url);
        console.log(chalk.cyan("Secret URL:"), data.secretUrl);
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
  .option("-q, --quiet", "Output only the payload")
  .action(async (id, options) => {
    const spinner = ora("Fetching push...").start();

    try {
      const data = await apiRequest("/api/v2/pushes/" + id, {
        method: "POST",
        body: JSON.stringify({ passphrase: options.passphrase }),
      });

      spinner.succeed("Push retrieved!");

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
      // In a real implementation, this would call the auth endpoint
      spinner.succeed("Authentication not yet implemented - use API key for now");
      console.log(chalk.gray("Configure API key with: pwpush config --key <key>"));
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Authentication failed");
      process.exit(1);
    }
  });

program.parse();