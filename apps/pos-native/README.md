# Oon Jai POS native device build

This project packages the company's existing cashier engine separately from the
Restaurant back office, with Android, iPad/iPhone and desktop targets. Every device offers **Main POS**
and **Kitchen / Ticket Receiver**. Either platform can take either role. An
optional **Customer display** remains a separate third mode.

## Device connection

1. Join both devices to the same shop Wi-Fi. The local connection does not need
   internet. Guest Wi-Fi that isolates devices will not work.
2. Choose **Main POS** on the front-counter device and sign in. Choose **Kitchen /
   Ticket Receiver** on the kitchen device. Android and iPad can take either role;
   the same choices are available on Windows.
3. On the main device, select **Pair ticket receiver**. On the receiver select
   **Connect to main POS** and scan or paste its pairing code. Allow local-network
   and camera access when needed. Each kitchen pairing has one main and one receiver.
4. Save an order or record payment at the main POS. Its saved order becomes a
   durable kitchen ticket. The receiver shows items, quantities, options and notes.
   Delivery is acknowledged only after the receiver has persisted the ticket.
   Pending tickets retry after reconnect; repeated delivery does not create duplicates.
5. Mark prepared tickets **Done** on the receiver. Changed orders create a new
   revision and reopen the ticket; cancellations are shown explicitly. Delivery
   acknowledgement does not mean preparation is complete or payment is confirmed.
6. To reverse the devices, save the current order, deliver pending tickets, sync
   pending sales and finish received kitchen tickets. Choose **Change device role**
   on each device, choose the opposite roles, and pair again. History stays on its
   original device; changing a role does not migrate sales or a shift.

Kitchen tickets remain visible through disconnection and app restart. A receiver
uses the saved pairing when reopened; pair again if the main device's IP changes.
The apps keep their screens awake during service. Keep both applications in the
foreground. The optional customer-facing display shows only the current sale and
clears stale totals on disconnect, unlike the persistent kitchen ticket queue.

Pairing secrets for the kitchen and customer display are separate. Authenticated
AES-GCM encryption protects the local messages. The receiver can acknowledge
receipt only; it cannot alter sales, take payments or call database operations.
Kitchen messages exclude customer identity, payment details, prices and costs.
Notes intended for kitchen preparation are included. Private IPv4 addressing,
message bounds and connection deadlines constrain the native transport.

## Offline data and limitations

**Download POS data** saves the current catalog/records using the existing POS
snapshot store. Existing queued sales remain in the same on-device IndexedDB and
sync through the existing server RPCs. Prepare the shift online before service.
Kitchen ticket delivery and the customer display work without internet independently of the backend. Saved offline orders can be sent over local Wi-Fi before cloud sync.

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
