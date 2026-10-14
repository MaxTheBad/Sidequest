import {missingReleaseInputs} from "../../../scripts/check-release-inputs.mjs";
if (process.env.EAS_BUILD_PROFILE === "production") {
  const missing=missingReleaseInputs("native",process.env);
  if(missing.length){console.error(`Production native preflight blocked: ${missing.join(", ")}`);process.exitCode=1;}
  else console.log("Production native shipping inputs present; no values printed.");
}
