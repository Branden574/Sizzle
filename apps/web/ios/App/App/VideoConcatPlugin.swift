import Foundation
import Capacitor
import AVFoundation

/**
 * VideoConcat — stitch recorded segments into ONE video (TikTok-style pause/resume).
 *
 * iOS kills the camera whenever the app backgrounds, so an in-app recording can
 * only "pause" by finishing the current file. The recorder keeps each take as a
 * segment; this plugin concatenates them and returns the combined file's path.
 *
 * Orientation: when every segment carries the SAME preferredTransform, the
 * concat is lossless (passthrough — no re-encode, seconds-fast). When they
 * differ (e.g. the user flipped front↔rear between pauses), passthrough cannot
 * represent per-range transforms, so it falls back to a re-encoding export with
 * an AVMutableVideoComposition that applies each segment's own transform.
 *
 * Inputs are deleted on success. cleanup() lets JS delete abandoned segments
 * (discarded take / unmount) so temp recordings don't pile up on disk.
 */
@objc(VideoConcatPlugin)
public class VideoConcatPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VideoConcatPlugin"
    public let jsName = "VideoConcat"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "concat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanup", returnType: CAPPluginReturnPromise)
    ]

    private func fileURL(_ p: String) -> URL {
        if p.hasPrefix("file://"), let u = URL(string: p) { return u }
        return URL(fileURLWithPath: p)
    }

    @objc func cleanup(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        for p in paths { try? FileManager.default.removeItem(at: fileURL(p)) }
        call.resolve()
    }

    @objc func concat(_ call: CAPPluginCall) {
        guard let paths = call.getArray("paths", String.self), !paths.isEmpty else {
            call.reject("paths is required")
            return
        }
        // Single segment: nothing to stitch.
        if paths.count == 1 {
            call.resolve(["path": paths[0]])
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let composition = AVMutableComposition()
            guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else {
                call.reject("could not create video track")
                return
            }
            let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)

            struct Seg {
                let range: CMTimeRange   // where it sits in the composition
                let transform: CGAffineTransform
                let naturalSize: CGSize
            }
            var segs: [Seg] = []
            var cursor = CMTime.zero
            for p in paths {
                let asset = AVURLAsset(url: self.fileURL(p))
                guard let srcVideo = asset.tracks(withMediaType: .video).first else {
                    call.reject("segment has no video track: \(p)")
                    return
                }
                let range = CMTimeRange(start: .zero, duration: asset.duration)
                do {
                    try videoTrack.insertTimeRange(range, of: srcVideo, at: cursor)
                    // Audio is optional per segment (mic can be denied mid-session);
                    // inserting at the same cursor keeps A/V aligned, and a missing
                    // audio range is simply silent for that stretch.
                    if let srcAudio = asset.tracks(withMediaType: .audio).first, let audioTrack = audioTrack {
                        try? audioTrack.insertTimeRange(range, of: srcAudio, at: cursor)
                    }
                    segs.append(Seg(range: CMTimeRange(start: cursor, duration: asset.duration), transform: srcVideo.preferredTransform, naturalSize: srcVideo.naturalSize))
                    cursor = CMTimeAdd(cursor, asset.duration)
                } catch {
                    call.reject("failed to append \(p): \(error.localizedDescription)")
                    return
                }
            }

            let first = segs[0]
            let uniformTransforms = segs.allSatisfy { $0.transform == first.transform }

            var videoComposition: AVMutableVideoComposition? = nil
            if uniformTransforms {
                // Lossless path: one transform for the whole track, passthrough export.
                videoTrack.preferredTransform = first.transform
            } else {
                // Mixed orientations/cameras: apply each segment's OWN transform via a
                // video composition (requires re-encode — passthrough can't do this).
                let renderRect = CGRect(origin: .zero, size: first.naturalSize).applying(first.transform)
                let renderSize = CGSize(width: abs(renderRect.width), height: abs(renderRect.height))
                let vc = AVMutableVideoComposition()
                vc.renderSize = renderSize
                vc.frameDuration = CMTime(value: 1, timescale: 30)
                vc.instructions = segs.map { seg in
                    let inst = AVMutableVideoCompositionInstruction()
                    inst.timeRange = seg.range
                    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
                    // The embedded transform maps the segment into upright display
                    // space; if its upright size differs from the render canvas,
                    // scale to fit (front/rear at the same quality normally match).
                    var t = seg.transform
                    let segRect = CGRect(origin: .zero, size: seg.naturalSize).applying(seg.transform)
                    let segSize = CGSize(width: abs(segRect.width), height: abs(segRect.height))
                    if segSize != renderSize, segSize.width > 0, segSize.height > 0 {
                        let scale = min(renderSize.width / segSize.width, renderSize.height / segSize.height)
                        t = t.concatenating(CGAffineTransform(scaleX: scale, y: scale))
                    }
                    layer.setTransform(t, at: seg.range.start)
                    inst.layerInstructions = [layer]
                    return inst
                }
                videoComposition = vc
            }

            let outURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("sizzle-stitched-\(Int(Date().timeIntervalSince1970))-\(Int.random(in: 1000...9999)).mov")
            try? FileManager.default.removeItem(at: outURL)

            let preset: String
            if uniformTransforms, AVAssetExportSession.exportPresets(compatibleWith: composition).contains(AVAssetExportPresetPassthrough) {
                preset = AVAssetExportPresetPassthrough
            } else {
                preset = AVAssetExportPresetHighestQuality
            }
            guard let export = AVAssetExportSession(asset: composition, presetName: preset) else {
                call.reject("could not create export session")
                return
            }
            export.outputURL = outURL
            export.outputFileType = .mov
            export.shouldOptimizeForNetworkUse = true
            export.videoComposition = videoComposition
            export.exportAsynchronously {
                switch export.status {
                case .completed:
                    // Free the per-segment temp files — the stitched file replaces them.
                    for p in paths { try? FileManager.default.removeItem(at: self.fileURL(p)) }
                    call.resolve(["path": outURL.path])
                default:
                    call.reject("export failed: \(export.error?.localizedDescription ?? "unknown")")
                }
            }
        }
    }
}
