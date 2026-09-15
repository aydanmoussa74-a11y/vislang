# Vislang

<p align="center">
  <strong>Git-native visual constitutions for software interfaces.</strong>
</p>

<p align="center">
  Define visual laws. Validate them. Diff them.<br />
  Classify what changed. Keep the constitution next to the code.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="MIT License"></a>
  <a href="spec/0.1/SPEC.md"><img src="https://img.shields.io/badge/spec-0.1-informational" alt="Vislang spec 0.1"></a>
  <a href="spec/0.1/SPEC.md"><img src="https://img.shields.io/badge/status-release--ready-lightgrey" alt="v0.1 release-ready"></a>
</p>

## Demo

<!-- Demo GIF will be added in the next release-polish slice. -->

## What is Vislang?

Vislang is a small format and reference tool for declaring a **closed set of visual laws** for a product interface, then deciding how those laws changed.

A constitution is a JSON document in the repository. The tool answers two questions:

1. Is this document a legal Vislang 0.1 constitution?
2. If two legal constitutions share an identity, what did the change mean?

```
constitution
     ↓
  validate
     ↓
    diff
     ↓
semantic class
     ↓
Git / review
```

V0.1 classifies constitution changes as `nonbreaking`, `additive`, `unknown`, or `breaking`.

## Why?

A design system can already hold tokens, components, styles, and written guidelines.

Those artifacts do not automatically give you a compact, versioned, **normative** statement of the visual laws a product is expected to keep. Reviewers then argue about screenshots and taste instead of about whether a law changed.

Vislang 0.1 is that normative layer only. It does not render UI, inspect browsers, or replace tokens.

## The constitution

`vislang init` writes `vislang.json`. This is a legal 0.1 document:

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
      {
        "role": "action.primary",
        "required": true,
        "fallback": "#000000"
      }
    ]
  },
  "invariants": [
    {
      "id": "INV-PRIMARY-01",
      "statement": "One primary action role is bound.",
      "severity": "error",
      "applies_to": [{}],
      "predicate": {
        "kind": "single_primary_action_role",
        "role": "action.primary"
      }
    }
  ]
}
```

| Field | Role |
| --- | --- |
| `id` | Lineage. `diff` only compares documents with the same `id`. |
| `version` | Constitution SemVer. Used by `diff --require-semver`. |
| `binds.roles` | Semantic roles (required/optional, token or fallback). |
| `invariants` / `forbiddens` | Named laws plus a predicate. |
| `surfaces` | Optional named screens, components, or regions. |
| `applies_to` | Selectors that scope a law. `{}` means document-wide. |
| `status` | `draft`, `stable`, or `deprecated`. |

Optional token binding: `binds.tokens.format` is `"none"` or `"dtcg-2025.10"`. In 0.1 the tool only checks that a referenced DTCG file exists, is readable, and is JSON. It does not resolve token pointers.

## Semantic diff

A textual JSON diff tells you that a file changed.

Vislang asks what the change **means** for the constitution.

```
old constitution
        ↓
       diff
        ↓
required role removed
        ↓
     BREAKING
```

```
new optional role
        ↓
     ADDITIVE
```

v0.1 classes:

- `nonbreaking` — name, metadata, statement-only edits, some reorderings
- `additive` — new optional structure, some relaxations
- `unknown` — detected but not safely classifiable (for example a DTCG path change)
- `breaking` — removed required structure, tightened laws, incompatible status moves

Aggregate precedence:

```
breaking > unknown > additive > nonbreaking
```

`diff` validates both documents first. Different `id` values are incomparable.

## Git-native

The constitution is an ordinary file. It moves with:

```
commit → branch → review → merge → revert
```

The reference tool does not open pull requests or attach itself to GitHub Actions. You can call it from a hook or workflow if you want that.

## Installation

Nothing is published to npm yet. Use the repository.

Requires **Node.js 22+**.

```bash
git clone https://github.com/aydanmoussa74-a11y/vislang.git
cd vislang
npm install
```

Run the CLI from the repo:

```bash
npm run vislang -- --help
# or
node --experimental-strip-types src/cli.ts --help
```

## Quick start

```bash
npm run vislang -- init
npm run vislang -- validate vislang.json
npm run vislang -- diff old.json new.json
```

Useful exits:

| Code | Meaning |
| --- | --- |
| 0 | Success (`diff` additive/nonbreaking, SemVer ok when requested) |
| 1 | `validate`: document is not a legal constitution |
| 2 | I/O, parse, UTF-8, or incomparable ids |
| 3 | `diff`: breaking/unknown aggregate, or `--require-semver` failed |
| 64 | Usage error |

## CLI

```
vislang validate <file>
vislang diff <old> <new>
vislang init [dir]
```

`<file>`, `<old>`, and `<new>` may be `-` for stdin. At most one operand may be stdin.

| Flag | Where | Effect |
| --- | --- | --- |
| `--json` | all | JSON result on stdout |
| `--quiet` | all | Suppress normal success prose |
| `--no-color` | all | No ANSI color; also honors `NO_COLOR` |
| `--help`, `-h` | all | Help, exit 0 |
| `--require-semver` | `diff` | Enforce constitution SemVer against the effective class |
| `--allow-unknown` | `diff` | Keep unknown rows in the report; exclude them from aggregate / exit / SemVer |
| `--id`, `--name` | `init` | Override identity fields |
| `--force` | `init` | Overwrite an existing `vislang.json` |

`init` writes only `<dir>/vislang.json` and validates that document before treating the write as success.

## Specification

The language is defined by:

- [spec/0.1/SPEC.md](spec/0.1/SPEC.md) — normative
- [spec/0.1/schema.json](spec/0.1/schema.json) — structural contract

If schema and spec disagree, the spec wins. The TypeScript tool in `src/` is the reference implementation of 0.1.

## What Vislang is not

V0.1 is **not**:

- a design-token format, or a replacement for DTCG
- a screenshot / visual-regression system
- a browser inspector
- a UI generator
- a component library
- an AI product
- a Figma, CSS, or Tailwind adapter
- an evidence-pack or `check` product
- a hosted service

Those items are postponed on purpose.

## Current scope

Seven predicates:

| Predicate | Constitution meaning |
| --- | --- |
| `role_bound` | Named role exists in `binds.roles` |
| `single_primary_action_role` | One named primary action role |
| `forbidden_role_use` | Bound role must not be used in the selected scope |
| `nav_model` | Navigation model, optional ordered items |
| `selector_must_exist` | Named UI locus is required |
| `selector_must_not_exist` | Named UI locus is forbidden |
| `max_accent_roles` | Accent-role set and upper bound `n` |

`validate` checks document legality. It does not inspect application source, pixels, or a running UI.

## Design constraints

v0.1 stays:

- JSON only
- deterministic
- local (no network I/O)
- free of plugins, eval, and constitution-as-code
- strict at the byte boundary (valid UTF-8, 1 MiB, depth limit)
- explicit about `unknown` when a change cannot be classified safely

## Project status

- **Spec version:** `0.1`
- **Engineering scope:** frozen
- **Status:** release-ready

The next useful signal is use on real repositories, not a larger language.

## Next

Future work should follow actual use: constitutions that exist, diffs that were wrong or incomplete, and review pain that the current contract does not cover.

Postponed areas stay postponed until there is a reason to open them.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

v0.1 language changes and implementation bug fixes are different kinds of work. Changing `SPEC.md` is a specification change.

## Security

See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

<p align="center">Build. Validate. Diff. Understand.</p>

<p align="right"><a href="#vislang">↑ Back to top</a></p>
