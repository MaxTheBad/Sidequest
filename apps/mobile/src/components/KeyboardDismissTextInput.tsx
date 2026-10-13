import { forwardRef, useRef } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  PlatformColor,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

let nextAccessoryId = 0;

export const KeyboardDismissTextInput = forwardRef<TextInput, TextInputProps>(function KeyboardDismissTextInput(
  { inputAccessoryViewID, ...props },
  ref,
) {
  const insets = useSafeAreaInsets();
  const generatedAccessoryId = useRef<string | null>(null);

  if (generatedAccessoryId.current === null) {
    nextAccessoryId += 1;
    generatedAccessoryId.current = `questhat-keyboard-dismiss-${nextAccessoryId}`;
  }

  if (Platform.OS !== "ios" || inputAccessoryViewID) {
    return <TextInput ref={ref} inputAccessoryViewID={inputAccessoryViewID} {...props} />;
  }

  const accessoryId = generatedAccessoryId.current;

  return (
    <>
      <TextInput ref={ref} inputAccessoryViewID={accessoryId} {...props} />
      <InputAccessoryView nativeID={accessoryId} backgroundColor={PlatformColor("secondarySystemBackground")}>
        <View
          style={[
            styles.toolbar,
            {
              paddingLeft: Math.max(16, insets.left),
              paddingRight: Math.max(16, insets.right),
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
            accessibilityHint="Keeps your entered text"
            hitSlop={8}
            onPress={Keyboard.dismiss}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonText}>Done</Text>
          </Pressable>
        </View>
      </InputAccessoryView>
    </>
  );
});

const styles = StyleSheet.create({
  toolbar: {
    alignItems: "flex-end",
    backgroundColor: PlatformColor("secondarySystemBackground"),
    borderTopColor: PlatformColor("separator"),
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    minHeight: 44,
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 4,
  },
  buttonPressed: {
    opacity: 0.55,
  },
  buttonText: {
    color: PlatformColor("systemBlue"),
    fontSize: 17,
    fontWeight: "600",
  },
});
