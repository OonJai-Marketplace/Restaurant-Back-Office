# Oon Jai POS native device build

This project packages the company's existing cashier engine separately from the
Restaurant back office, with Android, iPad/iPhone and desktop targets. The launch
screen offers **Cashier POS** and **Customer display**. The display is read-only;
it is not a second till or a kitchen ticket queue.

## Device connection

1. Join both devices to the same shop Wi-Fi (a router is required; internet is
   not required for the display connection). Guest Wi-Fi that isolates clients
   will not work. Keep both applications open and devices awake during service.
2. On the cashier, sign in and open the POS. Select **Customer display**.
3. On the iPad, choose **Customer display → Connect to cashier → Scan QR code**.
   A pairing code can also be pasted. Allow camera and local-network permission.
4. Add/remove/change an item at the cashier. Check that the iPad shows the same
   items, quantities, discount and total. Disconnect internet while keeping Wi-Fi
   connected and repeat. The display must continue updating.
5. If Wi-Fi or the cashier app is lost, the display clears the old order and shows
   a reconnect message. It reconnects automatically at the saved local address.
   Pair again after the router changes the cashier's IP address.

Only a sanitized current-sale projection is exchanged. No names, phone numbers,
account tokens, inventory costs, bank details or transaction commands are sent.
The random 256-bit pairing secret stays in the two devices. AES-GCM authenticates
and encrypts messages; request nonces prevent accepting a stale reply. Rotating
the cashier's code disconnects previously paired screens. The native transport
accepts only private IPv4 addresses, bounds message sizes and times out peers.

## Offline data and limitations

**Download POS data** saves the current catalog/records using the existing POS
snapshot store. Existing queued sales remain in the same on-device IndexedDB and
sync through the existing server RPCs. Prepare the shift online before service.
The display connection works without internet independently of the backend.

This is a **device-testing build**, not a production release. Cold-start cashier
authentication still requires internet; an already signed-in cashier can use its
cached catalog offline. Promotions/vouchers and other online-only features retain
their existing restrictions. A customer display does not confirm payment: the
cashier remains the source of truth. Native receipt printer/payment-terminal
integrations and a full physical Android-to-iPad test are outstanding.

Do not uninstall or clear app data while unsynced sales exist. Web-installed POS
data does not automatically move into a native app. Sync the web installation
before switching devices/apps.

## Build and verify

Node 22+ / JDK 21 / current Android SDK; Xcode 26+ on macOS for iOS.

```sh
npm ci
npm test
npm run build
npm run android
cd android && ./gradlew assembleDebug assembleRelease
```

On a fresh macOS checkout, run `npm run ios`, then open the generated Xcode project.
The configuration script adds local-network/camera usage text and registers the
local transport plugin. Generated platform projects are ignored; changes belong
in `native/`, `tools/` or Capacitor configuration.

Desktop uses Electron with a secure local protocol, isolated renderer, no renderer
Node access and a narrow IPC bridge. Run `npm run desktop` or
`npm run package:windows` after building. Allow the app on the private network in
the desktop firewall. Its wire protocol matches Android and iOS.

## Distribution and updates

The workflow creates an Android **debug/device-test APK**, an unsigned iOS archive
and a Windows test installer. The unsigned iOS archive cannot be installed on an
iPad: company Apple signing/provisioning and distribution are required. Debug APK
keys can change between CI runs; these APKs are not a production update channel.

Before production, configure persistent company signing keys and monotonically
increasing Android version codes, Apple signing/distribution, Windows signing,
and an update channel. Updates must preserve application identity and local data.
The app explicitly reports that automatic update distribution is not configured.
Never present this source tree or an unsigned archive as a ready iPad download.
