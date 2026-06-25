export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string) {
  const normalized = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username must be 3-30 characters and use only letters, numbers, or underscores.";
  }
  return "";
}

export function usernameErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("profiles_username_lower_unique") || lower.includes("duplicate key")) {
    return "That username is already taken.";
  }
  if (lower.includes("once every 24 hours")) {
    return "You can only change your username once every 24 hours.";
  }
  return message;
}
