export async function persistSettingsPreferences({
  storage,
  updateAccount,
  themePref,
  publicLocationWarningEnabled,
  marketingOptIn,
  now = Date.now,
}) {
  const { error } = await updateAccount({
    marketing_opt_in: marketingOptIn,
    theme_pref: themePref,
    public_location_warning_enabled: publicLocationWarningEnabled,
  });
  if (error) throw new Error(error.message || "Could not save preferences.");

  await storage.setItem("sidequest_theme_pref", themePref);
  if (publicLocationWarningEnabled) {
    await storage.removeItem("sidequest_public_location_warning_muted_until");
  } else {
    await storage.setItem(
      "sidequest_public_location_warning_muted_until",
      String(now() + 30 * 24 * 60 * 60 * 1000),
    );
  }
}
