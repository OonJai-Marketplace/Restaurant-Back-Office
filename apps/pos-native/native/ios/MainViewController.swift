import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        UIApplication.shared.isIdleTimerDisabled = true
        bridge?.registerPluginInstance(OonJaiLocalLinkPlugin())
    }
}
