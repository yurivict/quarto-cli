// This file is automatically generated by `quarto build-js`! Do not edit.",
//
// If you find yourself trying to rebuild types and `quarto build-js` won't run because
// of bad type definitions, run the following:
// $ cd $QUARTO_ROOT
// $ ./package/dist/bin/tools/deno run --importmap=./src/dev_import_map.json --allow-all ./package/src/common/create-schema-types.ts ./src/resources

export type MaybeArrayOf<T> = T | T[];
export type JsonObject = { [key: string]: string };

export type SchemaScalar = number | boolean | string | null;

export type SchemaDescription = string | { long?: string; short?: string };

export type SchemaBase = {
  additionalCompletions?: (string)[];
  completions?: (string)[];
  description?: SchemaDescription;
  default?: unknown;
  errorDescription?: string;
  hidden?: boolean;
  id?: string;
  tags?: JsonObject;
};

export type SchemaEnum = {
  enum: (SchemaScalar)[] | ({ values?: (SchemaScalar)[] } & SchemaBase);
} & SchemaBase;

export type SchemaNull = "null" | { null: SchemaBase };

export type SchemaExplicitSchema = { schema: SchemaSchema } & SchemaBase;

export type SchemaString =
  | ("string" | "path")
  | ({ pattern: string } & SchemaBase)
  | ({ path: SchemaSchema } & SchemaBase)
  | ({ string: SchemaSchema } & SchemaBase);

export type SchemaNumber = "number" | ({ number: SchemaSchema } & SchemaBase);

export type SchemaBoolean =
  | "boolean"
  | ({ boolean?: SchemaSchema } & SchemaBase);

export type SchemaResolveRef = { resolveRef?: string };

export type SchemaRef = { description?: SchemaDescription; ref: string };

export type SchemaMaybeArrayOf = { maybeArrayOf: SchemaSchema } & SchemaBase;

export type SchemaArrayOf = {
  arrayOf:
    | SchemaSchema
    | ({ length?: number; schema?: SchemaSchema } & SchemaBase);
} & SchemaBase;

export type SchemaAllOf = {
  allOf: (SchemaSchema)[] | ({ schemas?: (SchemaSchema)[] } & SchemaBase);
} & SchemaBase;

export type SchemaAnyOf = {
  anyOf: (SchemaSchema)[] | ({ schemas?: (SchemaSchema)[] } & SchemaBase);
} & SchemaBase;

export type SchemaRecord = {
  record: JsonObject | ({ properties: JsonObject } & SchemaBase);
} & SchemaBase;

export type SchemaObject = {
  object: {
    additionalProperties?: SchemaSchema;
    closed?: boolean;
    completions?: (string)[];
    description?: SchemaDescription;
    namingConvention?:
      | "ignore"
      | ((
        | "camelCase"
        | "camel-case"
        | "camel_case"
        | "capitalizationCase"
        | "capitalization-case"
        | "capitalization_case"
        | "underscoreCase"
        | "underscore-case"
        | "underscore_case"
        | "snakeCase"
        | "snake-case"
        | "snake_case"
        | "dashCase"
        | "dash-case"
        | "dash_case"
        | "kebabCase"
        | "kebab-case"
        | "kebab_case"
      ))[];
    properties?: JsonObject;
    patternProperties?: JsonObject;
    propertyNames?: SchemaSchema;
    required?: "all" | (string)[];
    super?: MaybeArrayOf<SchemaSchema>;
  } & SchemaBase;
} & SchemaBase;

export type SchemaSchema =
  | SchemaEnum
  | SchemaNull
  | SchemaExplicitSchema
  | SchemaString
  | SchemaNumber
  | SchemaBoolean
  | SchemaRef
  | SchemaResolveRef
  | SchemaAnyOf
  | SchemaArrayOf
  | SchemaMaybeArrayOf
  | SchemaAllOf
  | SchemaRecord
  | SchemaObject
  | (
    | "number"
    | "boolean"
    | "path"
    | "string"
    | null
    | "object"
    | "any"
  ) /* be a yaml schema */;

export type SchemaSchemaField = {
  alias?: string;
  disabled?: MaybeArrayOf<string>;
  description: SchemaDescription;
  enabled?: MaybeArrayOf<string>;
  errorMessage?: string;
  hidden?: boolean;
  name: string;
  schema: SchemaSchema;
  tags?: JsonObject;
};
