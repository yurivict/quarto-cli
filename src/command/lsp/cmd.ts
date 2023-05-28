/*
 * cmd.ts
 *
 * Copyright (C) 2020-2022 Posit Software, PBC
 */

import { Command } from "cliffy/command/mod.ts";

import { quartoConfig } from "../../core/quarto.ts";
import { join, normalize } from "path/mod.ts";
import { existsSync } from "fs/mod.ts";

export const lspCommand = new Command()
  .name("lsp")
  .description(
    "Run the Quarto LSP Server.",
  )
  .hidden()
  .option(
    "--stdio",
    "Communicate with clients using stdio",
  )
  .option(
    "--socket <socket:number>",
    "Communicate with clients using a socket",
  )
  .option(
    "--pipe <pipe:string>",
    "Communicate with clients using a named pipe",
  )
  .option(
    "--node-ipc",
    "Communicate using Node IPC",
  )
  .option(
    "--lsp-dir <lsp-dir:string>",
    "Directory containing the LSP (auto-detect by default)",
  )
  .example(
    "Run the LSP, communicating using stdio",
    "quarto lsp --stdio",
  )
  .example(
    "Run the LSP, communicating using a socket",
    "quarto lsp --socket 4444",
  )
  .action(async (options) => {
    // currently only available in dev mode
    if (!quartoConfig.isDebug()) {
      throw new Error(
        `Quarto LSP is currently only available in development mode.`,
      );
    }

    // lsp must exist in a side-by-side directory
    const lspDir = options.lspDir || normalize(
      join(
        quartoConfig.sharePath(),
        "..",
        "..",
        "..",
        "quarto",
        "apps",
        "lsp",
        "dist",
      ),
    );
    if (!existsSync(lspDir)) {
      throw new Error(`Quarto LSP not found at ${lspDir}`);
    }

    // prepare args for lsp
    const args: string[] = ["lsp.js"];
    if (options.stdio) {
      args.push("--stdio");
    } else if (options.socket) {
      args.push(`--socket=${String(options.socket)}`);
    } else if (options.pipe) {
      args.push(`--pipe=${options.pipe}`);
    } else if (options.nodeIpc) {
      args.push("--node-ipc");
    } else {
      throw new Error(
        "You must specify a communication channel (--stdio, --socket <number>, --pipe <name>, or --node-ipc)",
      );
    }

    // add client process id
    args.push("--clientProcessId");
    args.push(String(Deno.pid));

    // run the lsp
    const lspCommand = new Deno.Command("node", {
      args,
      cwd: lspDir,
      stdin: "inherit",
      stderr: "inherit",
      stdout: "inherit",
    });
    const p = lspCommand.spawn();
    await p.status;
  });
