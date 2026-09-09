// This list is the canonical gate order, shared by execution and focused tests.
export const STAGES = [
  { name: "Formatting", args: ["run", "format:check"] },
  { name: "Lint and style", args: ["run", "lint"] },
  { name: "Compiler and types", args: ["run", "typecheck"] },
  { name: "Static bug analysis", args: ["run", "analyze"] },
  { name: "Automated tests", args: ["run", "test:all"] },
  { name: "Dependency tree", args: ["ls", "--all"] },
  { name: "Vulnerability audit", args: ["audit", "--audit-level=low"] },
  { name: "Secret scan", args: ["run", "secrets"] },
  { name: "Package integrity", args: ["run", "package:check"] },
  { name: "Static package build", args: ["run", "build:check"] },
];
