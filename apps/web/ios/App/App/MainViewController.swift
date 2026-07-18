import UIKit
import Capacitor

/**
 * App's bridge view controller — the hook point for registering app-local
 * Capacitor plugins (Capacitor 6+ no longer auto-discovers them). Wired up in
 * Main.storyboard (customClass MainViewController, module App).
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VideoConcatPlugin())
        bridge?.registerPluginInstance(InstagramSharePlugin())
    }
}
