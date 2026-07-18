import Foundation
import Capacitor
import UIKit

/**
 * InstagramShare — post a recipe straight to an Instagram Story, as either the branded
 * card image OR the actual recipe video (with sound).
 *
 * Instagram Stories can't be opened with a plain URL, so this uses IG's documented
 * pasteboard handoff: it copies the media under the appropriate `com.instagram.sharedSticker.*`
 * key (5-minute expiry) and opens the `instagram-stories://share` URL scheme; IG then reads the
 * pasteboard and drops the user on the Stories composer with that background.
 *
 * Media, in priority order (first present wins):
 *   - `backgroundVideoPath` — an on-device file (the owner's own recorded clip); read directly, no download.
 *   - `backgroundVideoUrl`  — a remote (signed) MP4 we download natively (no WebView CORS/size limits).
 *   - `backgroundImage`     — a base64 JPEG/PNG (the branded card the web layer composes on a canvas).
 *   - `backgroundImageUrl`  — a remote image we download natively.
 * `stickerImage` (base64) is an optional branded overlay drawn on top (e.g. logo + @handle badge).
 * `appId` (a Facebook App ID) drives IG's `source_application` — REQUIRED for IG to accept the share.
 *
 * Requires `instagram-stories` in Info.plist LSApplicationQueriesSchemes so canOpenURL works.
 */
@objc(InstagramSharePlugin)
public class InstagramSharePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InstagramSharePlugin"
    public let jsName = "InstagramShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareToStories", returnType: CAPPluginReturnPromise)
    ]

    private func storiesURL(_ appId: String?) -> URL? {
        if let id = appId, !id.isEmpty {
            return URL(string: "instagram-stories://share?source_application=\(id)")
        }
        return URL(string: "instagram-stories://share")
    }

    private func decodeBase64(_ raw: String) -> Data? {
        // Accept a bare base64 string OR a `data:image/...;base64,XXXX` URL.
        let b64: String
        if let comma = raw.firstIndex(of: ","), raw.hasPrefix("data:") {
            b64 = String(raw[raw.index(after: comma)...])
        } else {
            b64 = raw
        }
        return Data(base64Encoded: b64)
    }

    /// Read a local media file from a `file://` URL or an absolute filesystem path.
    private func readLocalFile(_ raw: String) -> Data? {
        if let u = URL(string: raw), u.isFileURL { return try? Data(contentsOf: u) }
        if raw.hasPrefix("/") { return try? Data(contentsOf: URL(fileURLWithPath: raw)) }
        return nil
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let ok = self.storiesURL(nil).map { UIApplication.shared.canOpenURL($0) } ?? false
            call.resolve(["available": ok])
        }
    }

    @objc func shareToStories(_ call: CAPPluginCall) {
        let appId = call.getString("appId")
        let contentURL = call.getString("contentURL")
        let sticker = call.getString("stickerImage").flatMap { self.decodeBase64($0) }

        // 1. VIDEO — the owner's on-device clip (instant; no network).
        if let path = call.getString("backgroundVideoPath"), let data = readLocalFile(path) {
            openStories(video: data, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
            return
        }
        // 2. VIDEO — a remote (signed) MP4 we download natively.
        if let urlStr = call.getString("backgroundVideoUrl"), let vURL = URL(string: urlStr) {
            URLSession.shared.dataTask(with: vURL) { data, _, err in
                guard let data = data, err == nil, !data.isEmpty else {
                    call.reject("Could not download the video")
                    return
                }
                self.openStories(video: data, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
            }.resume()
            return
        }
        // 3. IMAGE — a base64 card the web layer already composed.
        if let raw = call.getString("backgroundImage") {
            guard let data = decodeBase64(raw) else {
                call.reject("backgroundImage is not valid base64")
                return
            }
            openStories(imageData: data, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
            return
        }
        // 4. IMAGE — download a remote image natively (no WebView CORS).
        if let urlStr = call.getString("backgroundImageUrl"), let imgURL = URL(string: urlStr) {
            URLSession.shared.dataTask(with: imgURL) { data, _, err in
                guard let data = data, err == nil else {
                    call.reject("Could not download the image")
                    return
                }
                self.openStories(imageData: data, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
            }.resume()
            return
        }
        call.reject("A background video or image is required")
    }

    private func openStories(video: Data, sticker: Data?, appId: String?, contentURL: String?, call: CAPPluginCall) {
        var item: [String: Any] = ["com.instagram.sharedSticker.backgroundVideo": video]
        openStories(item: &item, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
    }

    private func openStories(imageData: Data, sticker: Data?, appId: String?, contentURL: String?, call: CAPPluginCall) {
        var item: [String: Any] = ["com.instagram.sharedSticker.backgroundImage": imageData]
        openStories(item: &item, sticker: sticker, appId: appId, contentURL: contentURL, call: call)
    }

    private func openStories(item: inout [String: Any], sticker: Data?, appId: String?, contentURL: String?, call: CAPPluginCall) {
        // Capture on this thread; hop to main only for the pasteboard write + open (both must be main-thread).
        let payload = item
        let stickerData = sticker
        DispatchQueue.main.async {
            guard let url = self.storiesURL(appId), UIApplication.shared.canOpenURL(url) else {
                call.reject("Instagram is not installed")
                return
            }
            var out = payload
            if let s = stickerData { out["com.instagram.sharedSticker.stickerImage"] = s }
            // A tappable link sticker back to the recipe — IG only honors this for approved apps,
            // and safely ignores it otherwise, so it never breaks the share.
            if let link = contentURL, !link.isEmpty {
                out["com.instagram.sharedSticker.contentURL"] = link
            }
            UIPasteboard.general.setItems([out], options: [.expirationDate: Date().addingTimeInterval(60 * 5)])
            UIApplication.shared.open(url, options: [:]) { success in
                if success {
                    call.resolve(["shared": true])
                } else {
                    call.reject("Could not open Instagram")
                }
            }
        }
    }
}
