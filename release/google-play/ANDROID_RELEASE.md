# QuestHat Android release

The Android app lives beside the iOS app in `apps/mobile` and uses the same React Native UI, Supabase project, auth redirect scheme, storage buckets, realtime subscriptions, and notification RPCs. It is built locally with Gradle; Expo's paid build service is not required.

## One-time external setup

These values cannot safely live in source control:

1. Keep the Firebase Android configuration at `apps/mobile/android/app/google-services.json`. It is intentionally ignored by Git. Keep the Firebase Admin service-account JSON out of the app and source control; the server credential belongs only in the Supabase function secret.
2. Create and securely back up an organization-owned Play upload keystore. Enroll the app in Play App Signing and never commit the keystore or passwords.
3. Add the Play App Signing SHA-256 certificate to `https://questhat.com/.well-known/assetlinks.json` for verified listing links.
4. Register package `com.questhat.app` in Google Play Console. Complete Data safety, content rating, app access, ads, privacy-policy, and account-deletion declarations accurately before review.
5. Confirm the Supabase redirect allowlist contains exactly the required callback, including `questhat://auth/callback`.
6. Verify Google, Facebook, and Apple OAuth production redirect URLs and deletion callbacks in their provider consoles.

QuestHat uses MapLibre with non-Google map tiles, so it does not require a Google Maps API key. Review the selected tile/geocoding provider's production usage and attribution terms before store release.

## Local verification

```sh
cd /path/to/sidequest
npm run mobile:typecheck
NODE_ENV=production \
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
apps/mobile/android/gradlew -p apps/mobile/android :app:assembleRelease
```

The locally installable test APK is written to `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`. It may use debug signing for local testing only and must not be submitted to Play.

## Store build

```sh
export QUESTHAT_UPLOAD_STORE_FILE=/absolute/path/to/questhat-upload.jks
export QUESTHAT_UPLOAD_STORE_PASSWORD='stored-in-your-password-manager'
export QUESTHAT_UPLOAD_KEY_ALIAS='questhat-upload'
export QUESTHAT_UPLOAD_KEY_PASSWORD='stored-in-your-password-manager'

NODE_ENV=production \
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
apps/mobile/android/gradlew -p apps/mobile/android :app:bundleRelease
```

The signed Android App Bundle is written to `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`. Upload it to an internal Play testing track first. Test email/password and Apple/Google/Facebook browser OAuth, listing deep links, location/map mode, create/edit with photo and trimmed video, join approvals, chat, push receipt/tap routing, notification permission on Android 13+, notification settings, reporting/blocking, profile changes, and permanent account deletion on physical devices.

Before each submission, confirm that the Play Data safety answers match the current privacy policy and actual behavior. A technical implementation cannot submit or legally attest to those console declarations for the account owner.
