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

Vislang 0.1 is a Git-native constitution format for a product’s **normative visual laws**.

A Vislang 0.1 document declares:

- document identity and constitution version
- semantic role bindings
- invariants and forbiddens
- named surfaces
- a closed set of predicates

A Vislang 0.1 implementation provides:

- `validate` — decide whether a document is a legal 0.1 constitution
- `diff` — classify the change from one legal constitution to another
- `init` — write a legal starter constitution

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

Those items are postponed. See §16.
