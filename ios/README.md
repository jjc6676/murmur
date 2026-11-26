# Murmur for iPhone

Murmur runs English dictation on the iPhone (iOS 17 or later). The app owns the microphone and bundled Whisper model; the keyboard sends recording commands and inserts the result. No model download is needed on the phone.

## Install from Windows

1. In the repository's **Actions → Murmur iOS**, open a successful build. Download **Murmur-ios-unsigned** under **Artifacts** and extract the ZIP to get `Murmur-ios-unsigned.ipa`. Artifacts expire after 14 days; run the workflow again if necessary. The IPA has no Apple developer signature or provisioning profile. It won't install just by tapping it.
2. Install [Sideloadly for Windows](https://sideloadly.io/) and Apple's device drivers. Sideloadly recommends the **web installers for iTunes and iCloud** linked on its download page, not their Microsoft Store versions. If the iPhone is visible in Apple Devices but not in Sideloadly, use Sideloadly's recommended drivers and restart Windows.
3. Connect the unlocked iPhone over USB. Tap **Trust This Computer** and enter the iPhone passcode. Go to **Settings → Privacy & Security → Developer Mode**, turn it on, restart, and confirm. If the switch isn't visible yet, attempt the installation once, then look again.
4. Open Sideloadly, select the iPhone, and drag in the **IPA**, not the artifact ZIP. Use **Apple ID Sideload**. In **Advanced Options**, keep the original bundle ID (disable automatic bundle-ID changes if offered) and **keep app extensions**. Removing plug-ins removes the Murmur keyboard. See the App Group note below before changing identifiers.
5. Enter your Apple ID in Sideloadly, click **Start**, and complete Apple's sign-in and two-factor prompts. On the phone go to **Settings → General → VPN & Device Management**, select your developer account and trust it. Open Murmur and grant microphone access when prompted.
6. **Free Apple IDs must re-sign every seven days.** Reinstall over the existing app with the same Apple ID and bundle IDs, or configure [Sideloadly auto-refresh](https://sideloadly.io/faq) and keep the PC available via USB or paired Wi-Fi. Don't delete the app just to refresh it; that can remove local data.

### App Group: an install alone is not enough

Sideloadly provisions identifiers for **your Apple team**, not the team that built the IPA. Apple [lists App Groups for free Apple Developer accounts](https://developer.apple.com/help/account/reference/supported-capabilities-ios/), but the signing tool must register or reuse the group on that team and authorize it for **both** the app (`com.jjc6676.murmur`) and the keyboard (`com.jjc6676.murmur.keyboard`). Both signed entitlements and both profiles must allow `group.com.jjc6676.murmur`; this is the container Murmur opens. The IPA carries the requested entitlements in identity-free ad-hoc signatures so the signer can read them. It cannot grant them.

If the app opens but the keyboard never sees its session, first check **Allow Full Access** below. Then check Sideloadly's signing log for removed extensions or missing, renamed, or unavailable identifiers. **Keep bundle ID** is not a guarantee that App Groups were preserved. If the group belongs to another team or the signer renames it, changing the app's bundle ID alone won't fix sharing. Rebuild with an available app/extension ID pair and the **same team-owned group string** in `MurmurIPC.appGroup` and both `.entitlements` files, then provision and sign both targets with that group. If Sideloadly cannot provision it, use Xcode signing with the App Groups capability for both targets. Do not strip the entitlement to get past an install error.

## Enable and use the keyboard

1. On iPhone open **Settings → General → Keyboard → Keyboards → Add New Keyboard… → Murmur**. Select **Murmur** in the list and enable **Allow Full Access**. iOS requires this for the keyboard to share state with the app; it does not grant microphone access to the keyboard.
2. Open Murmur, start a session, and allow microphone access. Return to a text field in Notes or another app. Long-press the globe key and select **Murmur**. Secure text fields and apps that prohibit custom keyboards use the system keyboard instead.
3. Tap the mic, dictate, then tap **✓** to insert the text or **×** to discard. If the session has expired, use the keyboard's start-session action or open Murmur manually, start a new session, and switch back. Leave Murmur running in the background while using the keyboard.

## Build on macOS

From `ios/`, run `brew install xcodegen`, `bash scripts/fetch-deps.sh`, then `xcodegen generate`. The script verifies the size and SHA-256 of the pinned whisper.cpp XCFramework archive and `ggml-base.en.bin`, including cached copies. Open `Murmur.xcodeproj` with Xcode 16 or later. The **MurmurCoreTests** scheme runs on an iPhone simulator without an Apple ID. Use the **Murmur** scheme for the app and keyboard. For a device build in Xcode, select your team and configure signing and the shared App Group on both targets. The [GitHub Actions workflow](../.github/workflows/ios.yml) builds and packages without developer credentials.
