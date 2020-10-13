import { basename } from "path/mod.ts";

import { Command } from "cliffy/command/mod.ts";

import { mergeConfigs } from "../../config/merge.ts";

import { writeLine } from "../../core/console.ts";
import type { ProcessResult } from "../../core/process.ts";

import { formatForInputFile } from "../../config/format.ts";
import { postProcess, runComptations } from "./computation.ts";
import { runPandoc } from "./pandoc.ts";
import { fixupPandocArgs, parseRenderFlags, RenderFlags } from "./flags.ts";
import { cleanup } from "./cleanup.ts";

// TODO: generally, error handling for malformed input (e.g. yaml)

// TODO: generally correct handling of rendering outside of the working directory
// TODO: correct relative path for "Output created:" so the IDE will always be able to preview it

// TODO: should keep be a vector? or should keep_md be part of 'output'

// TODO: postprocessor / R and .py scripts become single script w/ "action", "params"
// TODO: html_preserve (either call R Markdown or substitute raw html blocks)

// TODO: internal version of Format w/ everything required
// TODO: fill out all the pandoc formats

// TODO: Run citeproc / crossref
// TODO: LaTeX w/ TinyTex

// TODO: shiny_prerendered and params may 'just work' (occur before pandoc). Need --params cli arg

// TODO: general code review of everything (constants, layering, etc.)

export interface RenderOptions {
  input: string;
  flags: RenderFlags;
  pandocArgs?: string[];
}

export async function render(options: RenderOptions): Promise<ProcessResult> {
  // alias quiet
  const quiet = options.flags.quiet;

  // derive format options (looks in file and at project level _quarto.yml)
  const format = await formatForInputFile(
    options.input,
    options.flags.to,
  );

  // run computations (if any)
  const computations = await runComptations({
    input: options.input,
    format,
    quiet,
  });

  // resolve output and args
  const { output, args } = resolveOutput(
    computations.output,
    format.output!.ext!,
    options.flags.output,
    options.pandocArgs,
  );

  // run pandoc conversion
  const result = await runPandoc({
    input: computations.output,
    format: mergeConfigs(format.pandoc!, computations.pandoc),
    args,
    quiet,
  });

  // run post processor
  const finalOutput = await postProcess({
    input: options.input,
    format,
    output,
    quiet,
  });

  // cleanup as necessary
  cleanup(options.flags, format, computations, finalOutput);

  // report
  if (result.success && !options.flags.quiet) {
    reportOutput(finalOutput);
  }

  // return result
  return result;
}

// resole output file and --output argument based on input, target ext, and any provided args
function resolveOutput(
  input: string,
  ext: string,
  output?: string,
  pandocArgs?: string[],
) {
  const args = pandocArgs || [];
  if (!output) {
    output = basename(input, ".quarto.md") + "." + ext;
    args.unshift("--output", output);
  }

  return {
    output,
    args,
  };
}

function reportOutput(output: string) {
  if (output !== "-") {
    writeLine("Output created: " + output + "\n");
  }
}

export const renderCommand = new Command()
  .name("render")
  .stopEarly()
  .arguments("<input:string> [...pandoc-args:string]")
  .description(
    "Render a file using the supplied target format and pandoc command line arguments.\n" +
      "See pandoc --help for documentation on all available options.",
  )
  .option("-t, --to [to:string]", "Specify output format (defaults to html).")
  .option(
    "-o, --output [output:string]",
    "Write output to FILE (use '--output -' for stdout).",
  )
  .option("--quiet [quiet:boolean]", "Suppress warning and other messages.")
  .option(
    "[...pandoc-args:string]",
    "Additional pandoc command line arguments.",
  )
  .example(
    "Render R Markdown",
    "quarto render notebook.Rmd\n" +
      "quarto render notebook.Rmd --to html\n" +
      "quarto render notebook.Rmd --to pdf --toc",
  )
  .example(
    "Render Jupyter Notebook",
    "quarto render notebook.ipynb\n" +
      "quarto render notebook.ipynb --to docx\n" +
      "quarto render notebook.ipynb --to docx --highlight-style=espresso\n",
  )
  .example(
    "Render to Standard Output",
    "quarto render notebook.Rmd --output -",
  )
  // deno-lint-ignore no-explicit-any
  .action(async (options: any, input: string, pandocArgs: string[]) => {
    try {
      // extract pandoc flags we know/care about (they will still go to pandoc)
      const flags = parseRenderFlags(pandocArgs);

      // fixup args as necessary
      pandocArgs = fixupPandocArgs(pandocArgs, flags);

      // run render
      const result = await render({ input, flags, pandocArgs });

      if (!result.success) {
        // error diagnostics already written to stderr
        Deno.exit(result.code);
      }
    } catch (error) {
      if (error) {
        writeLine(error.toString());
      }
      Deno.exit(1);
    }
  });
