# Vislang Specification 0.1

Status: normative  
Encoding of this specification version: `0.1`  
Document media type: `application/json`  
Reference implementation encoding: JSON only

This document is the normative definition of Vislang 0.1. A later JSON Schema, parser, validator, or CLI MUST implement this document. If a schema and this document disagree, this document wins.

The keywords MUST, MUST NOT, SHALL, SHALL NOT, REQUIRED, SHOULD, SHOULD NOT, and MAY are used as in RFC 2119.

Text marked **Non-normative** is explanatory and MUST NOT be treated as a conformance requirement.

---

## 1. What Vislang 0.1 is and is not

### 1.1 What it is

Vislang 0.1 is a Git-native constitution format for a product's **normative visual laws**.

A Vislang 0.1 document declares:

- document identity and constitution version
- semantic role bindings
- invariants and forbiddens
- named surfaces
- a closed set of predicates

A Vislang 0.1 implementation provides:

- `validate` - decide whether a document is a legal 0.1 constitution
- `diff` - classify the change from one legal constitution to another
- `init` - write a legal starter constitution

The core primitive is:

> a closed, versioned set of visual laws whose changes can be classified as breaking, additive, non-breaking, or unknown.

### 1.2 What it is not

Vislang 0.1 is not:

- a design-token format
- a replacement for the DTCG Design Tokens specification
- a visual-regression tool
- a screenshot or browser inspector
- a UI generator
- a component library
- an AI product
- a CSS, Tailwind, or Figma adapter
- an evidence-pack or `check` product

Those items are postponed. See section 16.

---

## 2. Conformance

A **document** is Vislang 0.1 conformant if and only if it satisfies sections 3 through 8.

A **tool** is a Vislang 0.1 implementation if and only if it implements `validate`, `diff`, and `init` as specified in sections 12 through 14.

A tool MAY implement additional commands. Additional commands MUST NOT change the meaning of `validate`, `diff`, or `init`.

---

## 3. Document identity and versioning

### 3.1 Spec version vs constitution version

A document contains two versions:

- `vislang`: version of this specification. The only legal value is the string `0.1`.
- `version`: SemVer 2.0.0 version of this constitution.

A 0.1 implementation MUST reject a document whose `vislang` field is not exactly `0.1`.

### 3.2 Identity

`id` identifies the constitution lineage.

- Two documents are comparable by `diff` if and only if their `id` values are equal.
- Changing `id` creates a different constitution. It is not a version bump.

`id` MUST match: `^[A-Za-z][A-Za-z0-9._-]{1,63}$`

`name` is a human label. Changing `name` is non-breaking.

### 3.3 Constitution SemVer

`version` MUST be a valid SemVer 2.0.0 string. Pre-release identifiers are allowed.

Normative bump rules are in section 11. `diff --require-semver` enforces them. `validate` MUST accept any syntactically valid SemVer in `version`. It MUST NOT require that `version` match the document's change history.

### 3.4 Status

`status` MUST be one of: `draft`, `stable`, `deprecated`.

`validate` MUST accept all three. Status changes are classified in section 10.

---

## 4. Constitution document structure

A Vislang 0.1 constitution is a single JSON object.

### 4.1 Root object

Required keys:

- `vislang` string MUST be `0.1`
- `id` string MUST match the id pattern
- `name` string length 1 to 128
- `version` string SemVer 2.0.0
- `status` string `draft` | `stable` | `deprecated`
- `binds` object section 5
- `invariants` array length >= 1

Optional keys and defaults:

- `forbiddens` array default `[]`
- `surfaces` array default `[]`
- `metadata` object default `{}`

Unknown top-level keys are illegal. `validate` MUST fail.

Unknown keys inside any object defined by this specification are illegal. `validate` MUST fail.

`metadata` is non-normative payload. `validate` MUST accept any JSON object as `metadata`. `diff` MUST ignore `metadata` except to classify a metadata-only change as non-breaking.

### 4.2 Arrays of named objects

- `binds.roles` identity field `role` MUST be unique
- `invariants` identity field `id` MUST be unique
- `forbiddens` identity field `id` MUST be unique
- `surfaces` identity field `id` MUST be unique

`invariants[].id`, `forbiddens[].id`, and `surfaces[].id` MUST match: `^[A-Za-z][A-Za-z0-9._-]{1,63}$`

An `invariants[].id` MUST NOT equal any `forbiddens[].id`.

### 4.3 Size limits

`validate` MUST fail if the input is not a single JSON object.

A 0.1 implementation MUST reject a document larger than 1048576 bytes.

A 0.1 implementation MUST reject JSON nesting deeper than 32 objects or arrays.

---

## 5. binds and optional DTCG relationship

### 5.1 binds object

Required keys: `tokens` object, `roles` array length >= 1.

### 5.2 binds.tokens

Required key `format` string: `dtcg-2025.10` or `none`.

If `format` is `dtcg-2025.10`:

- `path` is REQUIRED
- `path` MUST be a relative POSIX path string
- `path` MUST NOT be empty
- `path` MUST NOT be absolute
- after POSIX path normalization, `path` MUST NOT contain a `..` segment
- `path` MUST NOT start with `/`

If `format` is `none`:

- `path` MUST NOT be present

Unknown keys in `tokens` are illegal.

Non-normative: `format` names a token file convention. Vislang 0.1 does not implement the DTCG type system, aliases, or resolvers.

### 5.3 Role bindings

Each element of `binds.roles`:

- `role` string required, pattern `^[A-Za-z][A-Za-z0-9._-]{1,63}$`
- `required` boolean required
- `token` string conditionally required
- `fallback` string conditionally required

If `binds.tokens.format` is `dtcg-2025.10`:

- every role with `required` true MUST have `token`
- `fallback` MUST NOT be present
- `token`, when present, MUST match `^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$`

If `binds.tokens.format` is `none`:

- every role with `required` true MUST have `fallback`
- `token` MUST NOT be present
- `fallback`, when present, MUST be a string of length 1 to 256

Optional roles MAY omit both `token` and `fallback`.

### 5.4 DTCG path existence check

This check runs only during `validate`, and only when `format` is `dtcg-2025.10`.

Let C be the directory containing the constitution file. If the constitution is read from stdin, `validate` MUST fail with exit 2 because the path cannot be resolved.

Resolve `path` as join(C, path) after normalization.

`validate` MUST fail if:

- the resolved path is outside C or a subdirectory of C
- the file does not exist
- the file is not readable
- the file is not valid JSON
- the file is larger than 1048576 bytes

`validate` MUST NOT walk the DTCG token graph.
`validate` MUST NOT require that `token` pointers exist inside the DTCG file in v0.1.

Non-normative: pointer resolution is postponed. v0.1 only proves the referenced file exists and is JSON.

---

## 6. Invariants and forbiddens

### 6.1 Invariant object

- `id` string required
- `statement` string required length 1 to 512
- `severity` string required: `error` or `warning`
- `applies_to` array of Selector required length >= 1
- `predicate` object required, one of section 8
- `breaking_if_removed` boolean optional; default true if severity is error, else false

An error-severity invariant MAY set `breaking_if_removed` false explicitly. `validate` MUST accept that document. `validate` SHOULD emit warning code `W002`.

### 6.2 Forbidden object

- `id` string required
- `statement` string required
- `severity` string required
- `predicate` object required
- `applies_to` array of Selector optional, default `[{}]`
- `breaking_if_removed` boolean optional, same defaults as invariants

A forbidden is a named law with inverted intent. For validation and predicate legality it is identical to an invariant.

`diff` treats forbiddens as a separate collection.

### 6.3 applies_to

Each element is a Selector. If a selector names `surface`, that surface id MUST exist in `surfaces`.

---

## 7. Surfaces and selectors

### 7.1 Surface object

- `id` string required
- `kind` string required: `screen` | `component` | `region`
- `required` boolean required

Unknown keys are illegal.

### 7.2 Selector object

Optional keys only:

- `surface` string: a surface id
- `component` string pattern `^[A-Za-z][A-Za-z0-9._-]{1,63}$`
- `part` string same pattern
- `state` string: `default` | `hover` | `active` | `disabled` | `focus` | `loading`

An empty object `{}` is legal and means document-wide. Otherwise at least one key MUST be present.

Unknown keys are illegal.

Two selectors are equal if and only if they have the same keys and the same values. Missing key is not equal to empty string.

---

## 8. Allowed predicates

A predicate object MUST have a `kind` string equal to one of the seven kinds below. Additional keys not listed for that kind are illegal. A `kind` not listed here is illegal in a `vislang` `0.1` document.

### 8.1 role_bound

`{ "kind": "role_bound", "role": "<role>" }`

`role` MUST equal some `binds.roles[].role`.

Semantics: the named role is part of the constitution binding table.

`validate` only checks that `role` is bound. It does not inspect application source.

### 8.2 single_primary_action_role

`{ "kind": "single_primary_action_role", "role": "<role>" }`

`role` MUST equal some `binds.roles[].role`.

A document MUST contain at most one predicate of this kind across all invariants and forbiddens.

Semantics: the constitution names exactly one role as the primary action role.

### 8.3 forbidden_role_use

`{ "kind": "forbidden_role_use", "role": "<role>" }`

`role` MUST equal some `binds.roles[].role`.

Semantics: the named role MUST NOT be used in the selectors listed in `applies_to`. If `applies_to` is document-wide, the role MUST NOT be used anywhere the constitution governs.

### 8.4 nav_model

`kind` `nav_model`; `model` required: `bottom_tabs` | `side_rail` | `top_tabs` | `none`; `items` optional array.

If `items` is present:

- length >= 1
- each element matches `^[A-Za-z][A-Za-z0-9._-]{1,63}$`
- elements MUST be unique
- order is significant

Semantics: the constitution navigation model is `model`. If `items` is present, the ordered item list is part of the law.

### 8.5 selector_must_exist

`{ "kind": "selector_must_exist", "selector": { Selector } }`

`selector` MUST be a legal Selector. It MUST NOT be `{}`.

If `selector.surface` is present, that surface MUST exist.

Semantics: the constitution requires that selector to be a named locus of the product UI.

### 8.6 selector_must_not_exist

Same shape rules as 8.5.

Semantics: the constitution forbids that selector as a named locus.

### 8.7 max_accent_roles

`kind` `max_accent_roles`; `n` integer >= 1; `accent_roles` required array.

- `accent_roles` length >= 1
- each element MUST equal some `binds.roles[].role`
- elements MUST be unique
- `n` MUST be <= `accent_roles.length`

A document MUST contain at most one predicate of this kind across all invariants and forbiddens.

Semantics: the constitution accent-role set is exactly `accent_roles`. At most `n` of those roles MAY be used as accents under this law. `n` is an upper bound on simultaneous accent use among that listed set, not a guess from role-name prefixes.

---

## 9. Validation rules

### 9.1 Layer A syntax

MUST fail if the file cannot be read, is not UTF-8, is not a single JSON object, exceeds size or depth limits.

A UTF-8 BOM, if present, MUST be stripped before parse.

### 9.2 Layer B structure

MUST fail if any requirement in sections 3 through 8 fails.

### 9.3 Layer C binds file check

If `binds.tokens.format` is `dtcg-2025.10`, perform section 5.4. If `format` is `none`, skip 5.4.

### 9.4 Warnings

Warnings do not fail `validate`.

`W002`: error-severity law has `breaking_if_removed` false.

Implementations MAY emit additional warning codes starting with `W`. Additional codes MUST NOT change exit status.

### 9.5 validate JSON result

`{ "ok": true|false, "file": "<path or ->", "spec": "0.1", "errors": [], "warnings": [] }`

Each error or warning: `{ "code": string, "path": string, "message": string }`.

`path` SHOULD be a JSON Pointer RFC 6901 to the offending node when one exists.

---

## 10. Semantic diff

### 10.1 Preconditions

`diff` MUST parse and validate both documents. If either document is invalid, `diff` MUST exit 2 and MUST NOT classify changes.

If `old.id` is not equal to `new.id`, documents are incomparable. `diff` MUST exit 2.

### 10.2 Normalization

Before comparison an implementation MUST:

1. Apply omitted-field defaults from this specification.
2. Compare strings as exact UTF-8 code unit sequences after JSON parse. No Unicode normalization is required in v0.1.
3. Treat object key order as insignificant.
4. Treat array order as significant except where this section says otherwise.
5. Sort `applies_to` for equality by lexicographic JSON serialization of each selector with keys in the order `surface`, `component`, `part`, `state`, omitting missing keys.

### 10.3 Matching

Match roles by `role`, invariants by `id`, forbiddens by `id`, surfaces by `id`.

- in old not in new: removed
- in new not in old: added
- in both: compare normative fields

### 10.4 Normative fields for modified

- role: `required`, `token`, `fallback`
- invariant: `severity`, `applies_to`, `predicate`, `breaking_if_removed`
- forbidden: `severity`, `applies_to`, `predicate`, `breaking_if_removed`
- surface: `kind`, `required`

`statement` is not normative for equality. A statement-only change is non-breaking.

`name` and `metadata` are not normative for equality.

`version` is not a classified change. It is input to `--require-semver`.

### 10.5 Classification

If multiple rows match one change, highest severity wins: breaking > unknown > additive > nonbreaking.

Roles:

- add optional or required role: additive
- remove optional role not referenced by remaining predicates: additive
- remove role referenced by remaining predicates: breaking
- remove required role: breaking
- change token or fallback of required role: breaking
- change token or fallback of optional role: additive
- required false to true: additive
- required true to false: breaking

Referenced means the role string appears in any remaining predicate field `role` or in `accent_roles`.

Invariants and forbiddens:

- add severity warning: additive
- add severity error: breaking
- remove and breaking_if_removed true: breaking
- remove and breaking_if_removed false: additive
- change predicate: breaking
- change applies_to: breaking
- change severity warning to error: breaking
- change severity error to warning: breaking
- breaking_if_removed true to false: breaking
- breaking_if_removed false to true: additive
- change only statement: nonbreaking

Surfaces:

- add optional or required surface: additive
- remove optional surface not named by remaining selectors: additive
- remove surface named by remaining selectors: breaking
- remove required surface: breaking
- change kind: breaking
- required true to false: breaking
- required false to true: additive

max_accent_roles when id unchanged:

- n increases: additive
- n decreases: breaking
- accent_roles set gains a name: additive
- accent_roles set loses a name: breaking
- accent_roles order changes, set unchanged: nonbreaking

nav_model when id unchanged:

- model changes: breaking
- items omitted to present, present to omitted, membership or order changes: breaking

single_primary_action_role when id unchanged: role change is breaking.

Document-level:

- name, metadata: nonbreaking
- status draft to stable, stable to deprecated, draft to deprecated, deprecated to stable: additive
- status stable to draft, deprecated to draft: breaking
- binds.tokens.format changes: breaking
- binds.tokens.path changes: additive

### 10.6 Aggregate

- any breaking -> aggregate breaking
- else any unknown -> aggregate unknown
- else any additive -> aggregate additive
- else nonbreaking

A 0.1 implementation MUST classify every detected change using the tables above. If a change is detected that those tables do not cover, its class is unknown.

### 10.7 Diff JSON result

`old`, `new`, `id`, `aggregate`, arrays `breaking`, `additive`, `nonbreaking`, `unknown`, and `semver_ok`.

Each item: `collection`, `id`, `op` add|remove|modify, `class`, optional `field`, `message`.

`semver_ok` is true when `--require-semver` is not set, or when it is set and section 11 passes.

---

## 11. SemVer rules

These rules apply only to `diff --require-semver`.

If either version is unparsable, `semver_ok` is false and `diff` exits 3.

- nonbreaking: any version greater than or equal to old is acceptable, including equal
- additive: new MUST be greater than old and MUST increase minor or major; patch-only is not enough
- breaking: new major MUST be greater than old major
- unknown: treat as breaking for SemVer

0.x constitutions: a breaking aggregate still requires a major increase. `0.3.0` to `0.4.0` is NOT sufficient for breaking.

If the required bump did not happen, `semver_ok` is false and exit code is 3.

---

## 12. CLI behavior

Binary name: `vislang`.

Global flags: `--json`, `--quiet`, `--no-color` plus `NO_COLOR`, `--help` / `-h`.

When `--json` is present, stdout is only the JSON result object. Other diagnostics go to stderr.

A path argument of `-` means stdin. At most one operand per invocation may be `-`.

### 12.1 vislang validate <file>

`file` is REQUIRED. Behavior: section 9.

### 12.2 vislang diff <old> <new>

Both operands REQUIRED. Flags: `--require-semver`, `--allow-unknown`, `--json`.

`--allow-unknown`: unknown items do not force aggregate unknown for the exit code. They remain in the unknown array. Aggregate used for exit and `--require-semver` becomes the next-highest class after removing unknown items. If only unknown items exist, aggregate for exit becomes nonbreaking.

### 12.3 vislang init [dir]

Flags: `--id`, `--name`, `--force`, `--json`.

`dir` defaults to `.`.

MUST write exactly one file: `<dir>/vislang.json`.

MUST NOT write evidence files, workflows, token files, or README files.

MUST refuse to overwrite `<dir>/vislang.json` unless `--force`.

The written document MUST pass validate Layers A-B with `binds.tokens.format` equal to `none`.

Default document:

```json
{
  "vislang": "0.1",
  "id": "example",
  "name": "Example",
  "version": "0.1.0",
  "status": "draft",
  "binds": {
    "tokens": { "format": "none" },
    "roles": [
      { "role": "action.primary", "required": true, "fallback": "#000000" }
    ]
  },
  "invariants": [
    {
      "id": "INV-PRIMARY-01",
      "statement": "One primary action role is bound.",
      "severity": "error",
      "applies_to": [{}],
      "predicate": { "kind": "single_primary_action_role", "role": "action.primary" }
    }
  ]
}
```

If `--id` or `--name` is supplied, those fields replace the defaults. `--id` MUST match the id pattern or `init` exits 64.

JSON result: `{ "ok": true, "file": "<written path>" }`.

---

## 13. Exit-code contract

- 0 success
- 1 validate: document invalid
- 2 I/O, parse, incomparable ids, or usage that is not 64
- 3 diff: breaking aggregate, or `--require-semver` failed
- 64 usage error

`diff` exit 0 if aggregate is nonbreaking or additive, and `semver_ok` is true.
`diff` exit 3 if aggregate is breaking or unknown unless `--allow-unknown` reduced it, or `semver_ok` is false.

`init` exit 0 on write. Exit 2 if the target cannot be written or the file exists without `--force`. Exit 64 on bad flags.

Implementations MUST NOT use exit 4 in 0.1.

---

## 14. Determinism

Given identical inputs, flags, and readable filesystem state:

- JSON stdout MUST be semantically identical across runs. Implementations SHOULD emit keys in the order shown in this specification.
- Classification of a given old/new pair MUST be identical.
- `init` output document MUST be semantically identical for the same flags.

Implementations MUST NOT read the network.
Implementations MUST NOT execute constitution contents as code.

---

## 15. Security and non-goals

Normative security rules:

- MUST NOT evaluate expressions, templates, or plugins from a constitution.
- MUST NOT follow `binds.tokens.path` outside the constitution directory.
- MUST NOT write files except `init` writing `vislang.json`.
- MUST reject documents over 1 MiB or deeper than 32 levels.
- MUST parse JSON with a parser that does not execute code.

A 0.1 implementation MUST NOT:

- accept YAML constitutions
- fetch URLs
- inspect browsers, pixels, or screenshots
- generate UI
- call a language model
- load adapter plugins
- implement `check` or evidence packs as a supported command

---

## 16. Postponed functionality

Out of Vislang 0.1. A 0.1 tool MUST reject documents that use later fields or predicate kinds.

- YAML encoding
- evidence packs and `vislang check`
- adapters
- DTCG token-pointer resolution and `$value` comparison
- predicates: contrast, spacing, typography, radius, card anatomy, `role_equals`
- `permissions` object
- hosted registry or service
- AI-specific fields
- spec versions other than `0.1`

---

## 17. Example (non-normative)

```json
{
  "vislang": "0.1",
  "id": "workout-pwa",
  "name": "Workout PWA",
  "version": "0.1.0",
  "status": "draft",
  "binds": {
    "tokens": { "format": "none" },
    "roles": [
      { "role": "action.primary", "required": true, "fallback": "#FFB000" },
      { "role": "action.secondary", "required": false, "fallback": "#5F6368" }
    ]
  },
  "surfaces": [
    { "id": "home", "kind": "screen", "required": true },
    { "id": "library", "kind": "screen", "required": true }
  ],
  "invariants": [
    {
      "id": "INV-PRIMARY-01",
      "statement": "Exactly one primary action role.",
      "severity": "error",
      "applies_to": [{}],
      "predicate": { "kind": "single_primary_action_role", "role": "action.primary" }
    },
    {
      "id": "INV-NAV-01",
      "statement": "Bottom navigation with five items.",
      "severity": "error",
      "applies_to": [{}],
      "predicate": {
        "kind": "nav_model",
        "model": "bottom_tabs",
        "items": ["home", "train", "progress", "library", "media"]
      }
    },
    {
      "id": "INV-ACCENT-01",
      "statement": "At most one accent from the listed set.",
      "severity": "error",
      "applies_to": [{}],
      "predicate": {
        "kind": "max_accent_roles",
        "n": 1,
        "accent_roles": ["action.primary", "action.secondary"]
      }
    }
  ],
  "forbiddens": [
    {
      "id": "FORB-SECONDARY-HOME",
      "statement": "Secondary action role is not used as a primary CTA on home.",
      "severity": "error",
      "applies_to": [{ "surface": "home", "part": "cta" }],
      "predicate": { "kind": "forbidden_role_use", "role": "action.secondary" }
    }
  ]
}
```
