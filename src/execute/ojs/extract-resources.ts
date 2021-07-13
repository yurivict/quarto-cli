/*
* extract-resources.ts
*
* Copyright (C) 2021 by RStudio, PBC
*
*/

import { dirname, relative, resolve } from "path/mod.ts";
import { encode as base64Encode } from "encoding/base64.ts";
import { lookup } from "media_types/mod.ts";

import { parseModule } from "observablehq/parser";
import { parse as parseES6 } from "acorn/acorn";

import { esbuildCompile } from "../../core/esbuild.ts";
import { breakQuartoMd } from "../../core/break-quarto-md.ts";

import { parseError } from "./errors.ts";
import { ojsSimpleWalker } from "./ojs-tools.ts";

// ResourceDescription filenames are always project-relative
export interface ResourceDescription {
  filename: string;
  referent?: string;
  // import statements have importPaths, the actual in-ast name used.
  // we need that in case of self-contained files to build local resolvers
  // correctly.
  importPath?: string;
  pathType: "relative" | "root-relative";
  resourceType: "import" | "FileAttachment";
}

// resolves a ResourceDescription's filename to its absolute path
export function resolveResourceFilename(
  resource: ResourceDescription,
  rootDir: string,
): string {
  if (resource.pathType == "relative") {
    return resolve(rootDir, dirname(resource.referent!), resource.filename);
  } else if (resource.pathType === "root-relative") {
    return resolve(
      rootDir,
      dirname(resource.referent!),
      `.${resource.filename}`,
    );
  } else {
    throw new Error(`Unrecognized pathType ${resource.pathType}`);
  }
}

// drops resources with project-relative filenames
export function uniqueResources(
  resourceList: ResourceDescription[],
) {
  const result = [];
  const uniqResources = new Map<string, ResourceDescription>();
  for (const resource of resourceList) {
    if (!uniqResources.has(resource.filename)) {
      result.push(resource);
      uniqResources.set(resource.filename, resource);
    }
  }
  return result;
}

interface DirectDependency {
  resolvedImportPath: string;
  pathType: "relative" | "root-relative";
  importPath: string;
}

// Extracts the dependencies from a single js or ojs file
function directDependencies(
  source: string,
  fileDir: string,
  language: "js" | "ojs",
  projectRoot?: string,
): DirectDependency[] {
  interface ResolvedES6Path {
    pathType: "root-relative" | "relative";
    resolvedImportPath: string;
  }

  const resolveES6Path = (
    path: string,
    originDir: string,
    projectRoot?: string,
  ): ResolvedES6Path => {
    if (path.startsWith("/")) {
      if (projectRoot === undefined) {
        return {
          pathType: "root-relative",
          resolvedImportPath: resolve(originDir, `.${path}`),
        };
      } else {
        return {
          pathType: "root-relative",
          resolvedImportPath: resolve(projectRoot, `.${path}`),
        };
      }
    } else {
      // Here, it's always the case that path.startsWith('.')
      return {
        pathType: "relative",
        resolvedImportPath: resolve(originDir, path),
      };
    }
  };

  /*
  * localImports walks the AST of either OJS source code
  * or JS source code to extract local imports
  */
  // deno-lint-ignore no-explicit-any
  const localImports = (parse: any) => {
    const result: string[] = [];
    ojsSimpleWalker(parse, {
      // deno-lint-ignore no-explicit-any
      ImportDeclaration(node: any) {
        const source = node.source?.value as string;
        if (source.startsWith("/") || source.startsWith(".")) {
          result.push(source);
        }
      },
    });
    return result;
  };

  let ast;
  if (language === "js") {
    try {
      ast = parseES6(source, {
        ecmaVersion: "2020",
        sourceType: "module",
      });
    } catch (_e) {
      parseError(source);
      throw new Error();
    }
  } else {
    // language === "ojs"
    try {
      ast = parseModule(source);
    } catch (_e) {
      parseError(source);
      throw new Error();
    }
  }

  return localImports(ast).map((importPath) => {
    const { resolvedImportPath, pathType } = resolveES6Path(
      importPath,
      fileDir,
      projectRoot,
    );
    return {
      resolvedImportPath,
      pathType,
      importPath,
    };
  });
}

export function extractResolvedResourceFilenamesFromQmd(
  markdown: string,
  mdDir: string,
  projectRoot: string,
) {
  const pageResources = [];

  for (const cell of breakQuartoMd(markdown).cells) {
    if (
      cell.cell_type !== "markdown" &&
      cell.cell_type !== "raw" &&
      cell.cell_type !== "math" &&
      cell.cell_type?.language === "ojs"
    ) {
      const cellSrcStr = cell.source.join("");
      pageResources.push(...extractResourceDescriptionsFromOJSChunk(
        cellSrcStr,
        mdDir,
        projectRoot,
      ));
    }
  }

  // after converting root-relative and relative paths
  // all to absolute, we might once again have duplicates.
  // We need another uniquing pass here.
  const result = new Set<string>();
  for (const resource of uniqueResources(pageResources)) {
    result.add(resolveResourceFilename(resource, Deno.cwd()));
  }
  return Array.from(result);
}

export function extractResourceDescriptionsFromOJSChunk(
  ojsSource: string,
  mdDir: string,
  projectRoot?: string,
) {
  /*
  * literalFileAttachments walks the AST to extract the filenames
  * in 'FileAttachment(string)' expressions
  */
  // deno-lint-ignore no-explicit-any
  const literalFileAttachments = (parse: any) => {
    const result: string[] = [];
    ojsSimpleWalker(parse, {
      // deno-lint-ignore no-explicit-any
      CallExpression(node: any) {
        if (node.callee?.type !== "Identifier") {
          return;
        }
        if (node.callee?.name !== "FileAttachment") {
          return;
        }
        // deno-lint-ignore no-explicit-any
        const args = (node.arguments || []) as any[];
        if (args.length < 1) {
          return;
        }
        if (args[0]?.type !== "Literal") {
          return;
        }
        result.push(args[0]?.value);
      },
    });
    return result;
  };

  let result: ResourceDescription[] = [];
  const handled: Set<string> = new Set();
  const imports: Map<string, ResourceDescription> = new Map();

  // FIXME get a uuid here
  const rootReferent = `${mdDir}/<<root>>.qmd`;

  // we're assuming that we always start in an {ojs} block.
  for (
    const { resolvedImportPath, pathType, importPath } of directDependencies(
      ojsSource,
      mdDir,
      "ojs",
      projectRoot,
    )
  ) {
    if (!imports.has(resolvedImportPath)) {
      const v: ResourceDescription = {
        filename: resolvedImportPath,
        referent: rootReferent,
        pathType,
        importPath,
        resourceType: "import",
      };
      result.push(v);
      imports.set(resolvedImportPath, v);
    }
  }

  while (imports.size > 0) {
    const [thisResolvedImportPath, _resource] = imports.entries().next().value;
    imports.delete(thisResolvedImportPath);
    if (handled.has(thisResolvedImportPath)) {
      continue;
    }
    handled.add(thisResolvedImportPath);
    const source = Deno.readTextFileSync(thisResolvedImportPath);

    let language;
    if (thisResolvedImportPath.endsWith(".js")) {
      language = "js";
    } else if (thisResolvedImportPath.endsWith(".ojs")) {
      language = "ojs";
    } else {
      throw new Error(`Unknown language in file ${thisResolvedImportPath}`);
    }

    for (
      const { resolvedImportPath, pathType, importPath } of directDependencies(
        source,
        dirname(thisResolvedImportPath),
        language as ("js" | "ojs"),
        projectRoot,
      )
    ) {
      if (!imports.has(resolvedImportPath)) {
        const v: ResourceDescription = {
          filename: resolvedImportPath,
          referent: thisResolvedImportPath,
          pathType,
          importPath,
          resourceType: "import",
        };
        result.push(v);
        imports.set(resolvedImportPath, v);
      }
    }
  }

  const fileAttachments = [];
  for (const importFile of result) {
    if (importFile.filename.endsWith(".ojs")) {
      const ast = parseModule(Deno.readTextFileSync(importFile.filename));
      for (const attachment of literalFileAttachments(ast)) {
        fileAttachments.push({
          filename: attachment,
          referent: importFile.filename,
        });
      }
    }
  }
  // also do it for the current .ojs chunk.
  const ast = parseModule(ojsSource);
  for (const attachment of literalFileAttachments(ast)) {
    fileAttachments.push({
      filename: attachment,
      referent: rootReferent,
    });
  }

  // convert relative resolved paths to relative paths
  result = result.map((description) => {
    const { referent, resourceType, importPath, pathType } = description;
    if (pathType === "relative") {
      let relName = relative(mdDir, description.filename);
      if (!relName.startsWith(".")) {
        relName = `./${relName}`;
      }
      return {
        filename: relName,
        referent,
        importPath,
        pathType,
        resourceType,
      };
    } else {
      return description;
    }
  });

  result.push(...fileAttachments.map(({ filename, referent }) => {
    let pathType;
    if (filename.startsWith("/")) {
      pathType = "root-relative";
    } else {
      pathType = "relative";
    }

    // FIXME why can't the TypeScript typechecker realize this cast is unneeded?
    // it complains about pathType and resourceType being strings
    // rather than one of their two respectively allowed values.
    return ({
      referent,
      filename,
      pathType,
      resourceType: "FileAttachment",
    }) as ResourceDescription;
  }));
  return result;
}

/* creates a list of [project-relative-name, data-url] values suitable
* for inclusion in self-contained files
*/
export async function makeSelfContainedResources(
  resourceList: ResourceDescription[],
  wd: string,
) {
  const asDataURL = (
    content: string,
    mimeType: string,
  ) => {
    const b64Src = base64Encode(content);
    return `data:${mimeType};base64,${b64Src}`;
  };

  const uniqResources = uniqueResources(resourceList);

  const jsFiles = uniqResources.filter((r) =>
    r.resourceType === "import" && r.filename.endsWith(".js")
  );
  const ojsFiles = uniqResources.filter((r) =>
    r.resourceType === "import" && r.filename.endsWith("ojs")
  );
  const attachments = uniqResources.filter((r) => r.resourceType !== "import");

  const jsModuleResolves = [];
  if (jsFiles.length > 0) {
    const bundleInput = jsFiles
      .map((r) => `export * from "${r.filename}";`)
      .join("\n");
    const es6BundledModule = await esbuildCompile(
      bundleInput,
      wd,
      ["--target=es2018"],
    );

    const jsModule = asDataURL(
      es6BundledModule as string,
      "application/javascript",
    );
    jsModuleResolves.push(...jsFiles.map((f) => [f.importPath, jsModule])); // inefficient but browser caching makes it correct
  }

  const result = [
    ...jsModuleResolves,
    ...ojsFiles.map(
      (f) => [
        // FIXME is this one also wrong?
        f.importPath,
        asDataURL(
          Deno.readTextFileSync(f.filename),
          "application/ojs-javascript",
        ),
      ],
    ),
    ...attachments.map(
      (f) => {
        const resolvedFileName = resolveResourceFilename(f, Deno.cwd());
        return [
          f.filename,
          asDataURL(
            Deno.readTextFileSync(resolvedFileName),
            lookup(resolvedFileName)!,
          ),
        ];
      },
    ),
  ];
  return result;
}
