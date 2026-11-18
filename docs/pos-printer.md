# Receipt printing on each register

Open **Printer** from the POS toolbar, or **Management → Configure Printing**.
The Printer button also remains available in POS focus mode.
The connection panel detects browser capabilities, not device brand. **Refresh devices**
lists currently connected, previously permitted USB printer interfaces; it does not
claim that an empty permitted list means no physical printer exists.
No order or payment is required to print the sample. Samples carry `TEST · NOT A SALE`
and do not call sale/payment, stock, or receipt-number APIs.

For a supported ESC/POS USB receipt printer, connect it to the register, choose
**Find USB printer**, and accept the browser/device permission prompt. Select the
correct roll width and **Print sample receipt**. The direct route renders the
existing receipt layout to a monochrome raster and sends it to USB; it does not
open the system print preview. 56/58 mm paper uses 384 dots; 80 mm uses 576 dots.
The selection and paper width are stored on this register only. No receipt image
is uploaded or stored. Printing needs the renderer cached once for offline use.

**Print bill** remains available before payment and labels the result as unpaid.
After successful payment the control becomes **Print receipt**. Printing does not
record payment. A saved unpaid order can also use Receipt preview → Print bill.

System printing is an explicit alternative, not a fallback after USB failure.
Save PDF still uses the system print window. Its printer driver controls supported
paper sizes and may default to Letter/A4. Do not replace a working driver simply
to enable WebUSB. A driver or another app can own the USB interface exclusively.

Direct USB requires a browser exposing WebUSB and an accessible printer interface.
iPad Safari and the current bundled Android WebView do not expose this connection.
Their native/local printer integration is separate work; browser permissions alone
cannot implement it. Bluetooth, network discovery and native APK printer bridging
are not included in this change. Physical XP-58 output must be checked on the
register; the development environment has no attached receipt printer.

Validation: `node tests/pos-printer.cjs`, `node tests/pos-reports.cjs`,
`python tools/build-install150.py --check`. The isolated browser fixture verified
sample and unpaid print paths through simulated USB with zero paid sales, an
icon-only Hub link, navigation touch-action, and 16 px tablet settings inputs.
