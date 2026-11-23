// StrykerJS settings for the `mutation` step (G8, scripts/mutation.ts). The step runs Stryker in a temporary copy of
// the tracked files (inPlace rewrites every file it can reach, so never in a checkout) and passes the changed ranges as
// JSON in STRYKER_MUTATE. It judges the JSON report itself, so no score threshold is set here.
if (!process.env.STRYKER_MUTATE)
  throw new Error("STRYKER_MUTATE lists the ranges to mutate; run the step");

export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  inPlace: true,
  mutate: JSON.parse(process.env.STRYKER_MUTATE),
  reporters: ["json"],
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  coverageAnalysis: "perTest",
};
