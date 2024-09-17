/*
 * smoke-all.test.ts
 *
 * Copyright (C) 2022 Posit Software, PBC
 *
 */

import { expandGlobSync } from "../../src/core/deno/expand-glob.ts";
import { initYamlIntelligenceResourcesFromFilesystem } from "../../src/core/schema/utils.ts";
import {
  initState,
  setInitializer,
} from "../../src/core/lib/yaml-validation/state.ts";
import { cleanoutput } from "../smoke/render/render.ts";
import { execProcess } from "../../src/core/process.ts";
import { quartoDevCmd } from "../utils.ts";
import { assert } from "testing/asserts.ts";

async function fullInit() {
  await initYamlIntelligenceResourcesFromFilesystem();
}

const globOutput = Deno.args.length
  ? expandGlobSync(Deno.args[0])
  : expandGlobSync(
    "docs/playwright/**/*.qmd",
  );

setInitializer(fullInit);
await initState();

// const promises = [];
const fileNames: string[] = [];

for (const { path: fileName } of globOutput) {
  const input = fileName;

  // sigh, we have a race condition somewhere in
  // mediabag inspection if we don't wait all renders
  // individually. This is very slow..
  await execProcess({
    cmd: [quartoDevCmd(), "render", input, "--to", "html"],
  });
  fileNames.push(fileName);
}

Deno.test("Playwright tests are passing", async () => {
  try {
    // run playwright
    const res = await execProcess({
      cmd: [Deno.build.os == "windows" ? "npx.cmd" : "npx", "playwright", "test"],
      cwd: "integration/playwright",
    });

    if (Deno.env.get("GITHUB_ACTIONS") && Deno.env.get("GITHUB_REPOSITORY") && Deno.env.get("GITHUB_RUN_ID")) {
      const runUrl = `https://github.com/${Deno.env.get("GITHUB_REPOSITORY")}/actions/runs/${Deno.env.get("GITHUB_RUN_ID")}`;
      console.log(`::error file=playwright-tests.test.ts, title=Playwright tests::Some tests failed. Download report uploaded as artifact at ${runUrl}`);
    }
    assert(
      res.success,
      "Failed tests with playwright. Look at playwright report for more details."
    );
  }finally {
    for (const fileName of fileNames) {
      cleanoutput(fileName, "html");
    }
  }
});
