import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wrapperPath = resolve(mobileRoot, "src/components/KeyboardDismissTextInput.tsx");
const appPath = resolve(mobileRoot, "src/App.tsx");
const conversationPath = resolve(mobileRoot, "src/components/ConversationPanel.tsx");

const wrapper = readFileSync(wrapperPath, "utf8");
const app = readFileSync(appPath, "utf8");
const conversation = readFileSync(conversationPath, "utf8");

for (const [name, source] of [["App", app], ["ConversationPanel", conversation]]) {
  const reactNativeImports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"react-native";/g)]
    .map((match) => match[1])
    .join(",");
  assert.match(
    source,
    /import \{ KeyboardDismissTextInput as TextInput \}/,
    `${name} must route TextInput through the shared keyboard-dismiss wrapper`,
  );
  assert.doesNotMatch(
    reactNativeImports,
    /(?:^|,)\s*TextInput\s*(?:,|$)/,
    `${name} must not import the raw TextInput value`,
  );
}

assert.match(wrapper, /Platform\.OS !== "ios"/, "The accessory must remain iOS-only");
assert.match(wrapper, /inputAccessoryViewID/, "The wrapper must preserve caller-provided accessory views");
assert.match(wrapper, /InputAccessoryView nativeID=\{accessoryId\}/, "Each input must own its accessory view");
assert.match(wrapper, /onPress=\{Keyboard\.dismiss\}/, "Done must only dismiss the keyboard");
assert.match(wrapper, /accessibilityLabel="Dismiss keyboard"/, "Done must expose an accessible label");
assert.match(wrapper, /useSafeAreaInsets\(\)/, "The toolbar must account for horizontal safe areas");
assert.match(wrapper, /PlatformColor\("secondarySystemBackground"\)/, "The toolbar must follow the iOS system theme");
assert.doesNotMatch(wrapper, /onSubmitEditing|submitBehavior/, "The wrapper must not alter submit semantics");
assert.doesNotMatch(wrapper, /onChangeText|\bvalue=/, "The wrapper must not own or mutate draft values");

console.log("keyboard-dismiss contract: pass");
