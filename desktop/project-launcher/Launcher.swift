import AppKit
import Foundation

struct Settings: Decodable {
    let server: URL
    let applicationIdentifier: String
    let editorOrigin: URL
    let developmentExecutable: String?
    let developmentArguments: [String]?
    let developmentEnvironment: [String: String]?
}
struct ImportReply: Decodable { let url: URL }

@MainActor
final class Launcher: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        Task { await openDocument() }
    }
    func openDocument() async {
        do {
            guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
            let settings = try JSONDecoder().decode(Settings.self, from: Data(contentsOf: resources.appendingPathComponent("launch.json")))
            let document = resources.appendingPathComponent("document.5e")
            if let executable = settings.developmentExecutable {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: executable)
                process.arguments = (settings.developmentArguments ?? []) + ["--project-file=" + document.path]
                process.environment = ProcessInfo.processInfo.environment.merging(settings.developmentEnvironment ?? [:]) { _, new in new }
                try process.run()
            } else if let installed = NSWorkspace.shared.urlForApplication(withBundleIdentifier: settings.applicationIdentifier),
                      Bundle(url: installed)?.object(forInfoDictionaryKey: "FIVEEDocumentLaunchVersion") as? Int == 1 {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    NSWorkspace.shared.open([document], withApplicationAt: installed, configuration: .init()) { _, error in
                        if let error { continuation.resume(throwing: error) }
                        else { continuation.resume() }
                    }
                }
            } else {
                let bytes = try Data(contentsOf: document)
                var request = URLRequest(url: settings.server.appendingPathComponent("api/project-launch"))
                request.httpMethod = "POST"
                request.httpShouldHandleCookies = false
                request.timeoutInterval = 30
                request.httpBody = bytes
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("1", forHTTPHeaderField: "X-5E-Request")
                request.setValue(settings.server.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
                let session = URLSession(configuration: .ephemeral)
                defer { session.invalidateAndCancel() }
                let (data, response) = try await session.data(for: request)
                guard let http = response as? HTTPURLResponse, http.statusCode == 201 else { throw CocoaError(.fileReadUnknown) }
                let reply = try JSONDecoder().decode(ImportReply.self, from: data)
                guard reply.url.scheme == settings.editorOrigin.scheme, reply.url.host == settings.editorOrigin.host,
                      reply.url.port == settings.editorOrigin.port, NSWorkspace.shared.open(reply.url) else { throw CocoaError(.executableNotLoadable) }
            }
        } catch {
            let alert = NSAlert()
            alert.messageText = "5E 프로젝트를 열지 못했습니다"
            alert.informativeText = "원본 프로젝트는 이 파일 안에 보관되어 있습니다. 인터넷 연결과 5E 앱을 확인한 뒤 다시 열어 주세요.\n\n" + error.localizedDescription
            alert.runModal()
        }
        NSApplication.shared.terminate(nil)
    }
}
MainActor.assumeIsolated {
    let delegate = Launcher()
    let application = NSApplication.shared
    application.setActivationPolicy(.accessory)
    application.delegate = delegate
    withExtendedLifetime(delegate) { application.run() }
}
