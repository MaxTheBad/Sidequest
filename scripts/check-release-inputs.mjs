// Shipping-build preflight only; never reads/moves local saved credentials or
// prints values. Offline checks may use the ordinary build/typecheck commands.
export function missingReleaseInputs(kind, env) {
  const names = kind === "native"
    ? ["EXPO_PUBLIC_POSTHOG_KEY", "SENTRY_AUTH_TOKEN"]
    : ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN"];
  const missing = names.filter(name => !env[name]?.trim() || env[name].trim().startsWith("$"));
  for (const name of ["SENTRY_DISABLE_AUTO_UPLOAD", "SENTRY_DISABLE_XCODE_DEBUG_UPLOAD", "SENTRY_ALLOW_FAILURE"])
    if (env[name] === "true") missing.push(`${name}=true blocks verified shipping`);
  if (env.SENTRY_ORG && env.SENTRY_ORG !== "anlvio-llc") missing.push("SENTRY_ORG target mismatch");
  if (env.SENTRY_PROJECT && env.SENTRY_PROJECT !== "questhat") missing.push("SENTRY_PROJECT target mismatch");
  return missing;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const kind = process.argv.includes("--native") ? "native" : "web";
  const missing = missingReleaseInputs(kind, process.env);
  if (missing.length) { console.error(`Shipping preflight blocked: ${missing.join(", ")}`); process.exitCode = 1; }
  else console.log(`${kind}_shipping_inputs=present; values not printed; credential scopes still require owner review`);
}
