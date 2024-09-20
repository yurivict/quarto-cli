/*
 * types-from-schema.ts
 *
 * generates a typescript file with type definitions from our yaml schema definitions.
 *
 * Copyright (C) 2022 Posit Software, PBC
 */

/*

This file intentionally does not import from a number of quarto libraries
in order to minimize its dependencies.

We do this because you might need to run this file to regenerate quarto types,
and it's possible that you're doing it from a position where `quarto` doesn't
itself run.

*/

import { parse } from "yaml/mod.ts";
import { toCapitalizationCase } from "../lib/text.ts";
import { capitalizeWord as capitalize } from "../text.ts";
import { join } from "../../deno_ral/path.ts";

export function typeNameFromSchemaName(schemaName: string) {
  return capitalize(toCapitalizationCase(schemaName.replaceAll("/", "-")));
}

function fmtSource(source: string) {
  return Deno.run({
    cmd: [Deno.execPath(), "fmt", source],
  }).status();
}

export const generatedSrcMessage =
  `// This file is automatically generated by \`quarto build-js\`! Do not edit.",
//
// If you find yourself trying to rebuild types and \`quarto build-js\` won't run because
// of bad type definitions, run the following:
// $ cd $QUARTO_ROOT
// $ ./package/dist/bin/tools/deno run --importmap=./src/dev_import_map.json --allow-all ./package/src/common/create-schema-types.ts ./src/resources

export type MaybeArrayOf<T> = (T | T[]);
export type JsonObject = { [key: string]: unknown };
// export type SchemaObject = { [key: string]: string };

`;

export function schemaDefinitions(resourcePath: string) {
  const definitionsSchema = parse(
    Deno.readTextFileSync(join(resourcePath, "/schema/definitions.yml")),
    // deno-lint-ignore no-explicit-any
  ) as any;
  const projectSchema = parse(
    Deno.readTextFileSync(join(resourcePath, "/schema/project.yml")),
    // deno-lint-ignore no-explicit-any
  ) as any;

  // deno-lint-ignore no-explicit-any
  const schemas: { name: string; schema: any }[] = [];

  for (const definition of definitionsSchema) {
    schemas.push({
      name: typeNameFromSchemaName(definition.id),
      schema: definition,
    });
  }

  schemas.push(
    {
      name: "ProjectConfig",
      schema: projectSchema[0],
    },
    {
      name: "BookProject",
      schema: projectSchema[2],
    },
  );
  return schemas;
}

export async function generateTypesFromSchemas(resourcePath: string) {
  const schemas = schemaDefinitions(resourcePath);

  const autoGeneratedTypes: string[] = [
    generatedSrcMessage,
  ];

  for (const { name, schema } of schemas) {
    try {
      autoGeneratedTypes.push(`export type ${name} = ${schemaToType(schema)}`);
    } catch (e) {
      console.error(JSON.stringify(schema, null, 2));
      throw e;
    }
  }

  Deno.mkdirSync(join(resourcePath, "/types"), { recursive: true });
  Deno.writeTextFileSync(
    join(resourcePath, "/types/schema-types.ts"),
    autoGeneratedTypes.join("\n\n"),
  );

  await fmtSource(join(resourcePath, "/types/schema-types.ts"));
}

function yamlToTypeScriptKey(key: string) {
  // if the key isn't a valid typescript identifier, quote it
  if (!/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(key)) {
    return JSON.stringify(key);
  }
  return key;
}

// deno-lint-ignore no-explicit-any
export function schemaToType(schema: any): string {
  if ([true, false, null].indexOf(schema) !== -1) {
    return String(schema);
  }

  if (typeof schema === "string") {
    switch (schema) {
      case "any":
        return "unknown";
      case "number":
      case "boolean":
      case "string":
      case "null":
        return schema;
      case "path":
        return "string";
      case "object":
        return "JsonObject";
    }
    throw new Error(`Unimplemented: ${schema}`);
  }
  // deno-lint-ignore no-explicit-any
  const document = (schemaStr: string, entry: any) => {
    if (typeof entry.description === "string") {
      return `${schemaStr} /* ${entry.description.trim()} */`;
    } else if (typeof schema.description === "string") {
      return `${schemaStr} /* ${schema.description.trim()} */`;
    } else if (typeof entry.description === "object") {
      return `${schemaStr} /* ${entry.description.long.trim()} */`;
    } else if (typeof schema.description === "object") {
      return `${schemaStr} /* ${schema.description.long.trim()} */`;
    } else {
      return schemaStr;
    }
  };

  if (typeof schema === "object") {
    if (schema.schema) return schemaToType(schema.schema);
    if (schema.string) {
      return document("string", schema.string);
    }
    if (schema.number) {
      return document("number", schema.number);
    }
    if (schema.boolean) {
      return document("boolean", schema.boolean);
    }
    if (schema.path) {
      return document("string", schema.path);
    }
    if (schema.arrayOf) {
      return document(`(${schemaToType(schema.arrayOf)})[]`, schema.arrayOf);
    }
    if (schema.maybeArrayOf) {
      const t = schemaToType(schema.maybeArrayOf);
      return document(`MaybeArrayOf<${t}>`, schema.maybeArrayOf);
    }
    if (schema.record) {
      return document(
        "{" +
          Object.entries(schema.record).map(([key, value]) => {
            return `${yamlToTypeScriptKey(key)}: ${schemaToType(value)}`;
          }).join("; ") + "}",
        {},
      );
    }
    if (schema.enum) {
      // deno-lint-ignore no-explicit-any
      const doIt = (v: any) => {
        if (v.length === 1) {
          return JSON.stringify(v[0]);
        }
        return document(
          "(" + v.map((x: unknown) => JSON.stringify(x)).join(" | ") +
            ")",
          schema.enum,
        );
      };
      if (Array.isArray(schema.enum.values)) {
        return doIt(schema.enum.values);
      }
      if (!Array.isArray(schema.enum)) {
        throw new Error(`Unimplemented: ${JSON.stringify(schema)}`);
      }
      return doIt(schema.enum);
    }
    if (schema.ref) {
      return typeNameFromSchemaName(schema.ref);
    }
    if (schema.allOf) {
      if (!Array.isArray(schema.allOf)) {
        throw new Error(`Unimplemented: ${JSON.stringify(schema)}`);
      }
      return document(
        "(" + schema.allOf.map(schemaToType).join(" & ") + ")",
        schema.allOf,
      );
    }
    if (schema.anyOf) {
      if (!Array.isArray(schema.anyOf)) {
        throw new Error(`Unimplemented: ${JSON.stringify(schema)}`);
      }
      return document(
        "(" + schema.anyOf.map(schemaToType).join(" | ") + ")",
        schema.anyOf,
      );
    }
    if (schema.object) {
      let mainType: string = "";
      if (schema.object.properties) {
        mainType = "{" +
          Object.entries(schema.object.properties).map(([key, value]) => {
            const optionalFlag = schema.object.required === "all"
              ? false
              : (schema.object.required === undefined
                ? true
                : schema.object.required.indexOf(key) === -1);
            return `${yamlToTypeScriptKey(key)}${optionalFlag ? "?" : ""}: ${
              schemaToType(value)
            }`;
          }).sort(([k1, _v1], [k2, _v2]) => k1.localeCompare(k2)).join("; ") +
          "}";
      } else if (schema.object.additionalProperties) {
        mainType = "{ [key: string]: " +
          schemaToType(schema.object.additionalProperties) + " }";
      } else {
        mainType = "JsonObject";
      }
      if (schema.object?.super?.resolveRef) {
        return document(
          "(" + mainType + " & " +
            typeNameFromSchemaName(schema.object?.super?.resolveRef) + ")",
          schema.object,
        );
      } else {
        return document(mainType, schema.object);
      }
    }
  }
  throw new Error(`Unimplemented: ${JSON.stringify(schema)}`);
}

export async function generateSchemaTypes(resourcePath: string) {
  const schemaSchemas = parse(
    Deno.readTextFileSync(join(resourcePath, "/schema/schema.yml")),
    // deno-lint-ignore no-explicit-any
  ) as any;

  const strs: string[] = [generatedSrcMessage];
  for (const schema of schemaSchemas) {
    const schemaType = schemaToType(schema);
    const schemaName = typeNameFromSchemaName(schema.id);
    strs.push(`export type ${schemaName} = ${schemaType};\n`);
  }
  const schemaSchemaSourcePath = join(
    resourcePath,
    "/types/schema-schema-types.ts",
  );
  Deno.writeTextFileSync(schemaSchemaSourcePath, strs.join("\n"));
  await fmtSource(schemaSchemaSourcePath);
}
