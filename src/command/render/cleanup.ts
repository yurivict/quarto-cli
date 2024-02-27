/*
* renderCleanup.ts
*
* Copyright (C) 2020-2022 Posit Software, PBC
*
*/

import { existsSync } from "fs/mod.ts";
import { dirname, extname, isAbsolute, join } from "../../deno_ral/path.ts";

import * as ld from "../../core/lodash.ts";

import {
  normalizePath,
  removeIfEmptyDir,
  removeIfExists,
} from "../../core/path.ts";
import { figuresDir, inputFilesDir } from "../../core/render.ts";

import { Format } from "../../config/types.ts";
import { isHtmlFileOutput, isLatexOutput } from "../../config/format.ts";
import { kKeepMd, kKeepTex, kKeepTyp } from "../../config/constants.ts";

import { filesDirLibDir, filesDirMediabagDir } from "./render-paths.ts";

export function renderCleanup(
  input: string,
  output: string,
  format: Format,
  supporting?: string[],
  keepMd?: string,
) {
  // compute figure format
  const figureFormat = isLatexOutput(format.pandoc)
    ? extname(output).slice(1)
    : format.pandoc.to;

  // resolve output (could be either input relative or absolute)
  if (!isAbsolute(output)) {
    output = join(dirname(input), output);
  }

  // cleanup md if necessary
  if (keepMd && !format.execute[kKeepMd] && keepMd !== output) {
    removeIfExists(keepMd);
  }

  // if we aren't keeping the markdown or text and we are instructed to
  // clean supporting files then do it
  if (
    !format.execute[kKeepMd] &&
    !format.render[kKeepTex] &&
    !format.render[kKeepTyp] &&
    supporting
  ) {
    // ammend supporting with lib dir (if it exists) for html formats
    if (isHtmlFileOutput(format.pandoc)) {
      const libDir = join(
        dirname(input),
        filesDirLibDir(input),
      );
      if (existsSync(libDir)) {
        supporting.push(normalizePath(libDir));
      }
      // narrow supporting to figures dir for non-html formats
    } else {
      let filesDir = join(
        dirname(input),
        inputFilesDir(input),
      );
      if (existsSync(filesDir)) {
        filesDir = normalizePath(filesDir);
      }
      supporting = supporting.map((supportingDir) => {
        if (filesDir === supportingDir) {
          return join(filesDir, figuresDir(figureFormat));
        } else {
          return supportingDir;
        }
      });
    }

    // ammend supporting with mediabag if it exists
    // (we can always delete the mediabag because it is generated by filters)
    const mediabagDir = join(dirname(input), filesDirMediabagDir(input));
    if (existsSync(mediabagDir)) {
      supporting.push(mediabagDir);
    }

    // clean supporting
    ld.uniq(supporting).forEach((path) => {
      if (existsSync(path)) {
        Deno.removeSync(path, { recursive: true });
      }
    });
  }

  // remove empty files/lib dirs
  const filesDir = join(dirname(input), inputFilesDir(input));
  const figsDir = join(filesDir, figuresDir(figureFormat));
  const libDir = join(dirname(input), filesDirLibDir(input));
  const mediabagDir = join(dirname(input), filesDirMediabagDir(input));

  removeIfEmptyDir(figsDir);
  removeIfEmptyDir(libDir);
  removeIfEmptyDir(mediabagDir);
  removeIfEmptyDir(filesDir);
}
