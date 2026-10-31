import Capacitor
import Network
import Foundation

@objc(OonJaiLocalLinkPlugin)
public class OonJaiLocalLinkPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OonJaiLocalLinkPlugin"
    public let jsName = "OonJaiLocalLink"
    public let pluginMethods: [CAPPluginMethod] = ["start", "stop", "reply", "exchange"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let queue = DispatchQueue(label: "org.oonjai.pos.link")
    private var listener: NWListener?
    private var pending: [String: NWConnection] = [:]

    private func local(_ host: String) -> Bool {
        let parts = host.split(separator: ".")
        guard parts.count == 4, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy({ $0.isNumber }) }) else { return false }
        let p = parts.compactMap { Int($0) }
        guard p.count == 4, p.allSatisfy({ $0 >= 0 && $0 <= 255 }) else { return false }
        return p[0] == 10 || p[0] == 192 && p[1] == 168 || p[0] == 172 && (16...31).contains(p[1]) || p[0] == 169 && p[1] == 254
    }
    private func addresses() -> [String] {
        var first: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&first) == 0 else { return [] }
        defer { freeifaddrs(first) }
        var result: [String] = [], cursor = first
        while let node = cursor {
            defer { cursor = node.pointee.ifa_next }
            guard let addr = node.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) else { continue }
            var name = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &name, socklen_t(name.count), nil, 0, NI_NUMERICHOST) == 0 {
                let host = String(cString: name)
                if local(host) && !result.contains(host) { result.append(host) }
            }
        }
        return result
    }
    private func closeAll() {
        listener?.cancel(); listener = nil
        pending.values.forEach { $0.cancel() }; pending.removeAll()
    }
    private func receive(_ connection: NWConnection, buffer: Data = Data(), done: @escaping (String?) -> Void) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 8192) { data, _, complete, error in
            var bytes = buffer; if let data = data { bytes.append(data) }
            if bytes.count > 100000 { done(nil); return }
            if let end = bytes.firstIndex(of: 10) { done(String(data: bytes[..<end], encoding: .utf8)); return }
            if complete || error != nil { done(nil); return }
            self.receive(connection, buffer: bytes, done: done)
        }
    }
    @objc public func start(_ call: CAPPluginCall) {
        queue.async {
            self.closeAll()
            do {
                let parameters = NWParameters.tcp; parameters.allowLocalEndpointReuse = true
                let listener = try NWListener(using: parameters, on: NWEndpoint.Port(rawValue: 19741)!)
                self.listener = listener
                var settled = false
                listener.stateUpdateHandler = { state in
                    if settled { return }
                    switch state {
                    case .ready: settled = true; call.resolve(["port": 19741, "addresses": self.addresses()])
                    case .failed(let error): settled = true; call.reject("Local listener unavailable: \(error.localizedDescription)"); listener.cancel()
                    default: break
                    }
                }
                listener.newConnectionHandler = { connection in
                    guard self.pending.count < 8, case let .hostPort(host, _) = connection.endpoint, self.local(String(describing: host)) else { connection.cancel(); return }
                    let id = UUID().uuidString; self.pending[id] = connection
                    connection.start(queue: self.queue)
                    self.queue.asyncAfter(deadline: .now() + 5) { self.pending.removeValue(forKey: id)?.cancel() }
                    self.receive(connection) { payload in
                        guard let payload = payload else { self.pending.removeValue(forKey: id)?.cancel(); return }
                        self.notifyListeners("request", data: ["id": id, "payload": payload])
                    }
                }
                listener.start(queue: self.queue)
                self.queue.asyncAfter(deadline: .now() + 8) {
                    if !settled { settled = true; listener.cancel(); call.reject("Allow local-network access in Settings and try again.") }
                }
            } catch { call.reject("Local listener unavailable") }
        }
    }
    @objc public func stop(_ call: CAPPluginCall) { queue.async { self.closeAll(); call.resolve() } }
    @objc public func reply(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let payload = call.getString("payload"), payload.utf8.count <= 100000, !payload.contains("\n") else { call.reject("Invalid message"); return }
        queue.async {
            guard let connection = self.pending.removeValue(forKey: id) else { call.resolve(); return }
            connection.send(content: (payload + "\n").data(using: .utf8), completion: .contentProcessed { error in
                connection.cancel(); if error != nil { call.reject("Reply failed") } else { call.resolve() }
            })
        }
    }
    @objc public func exchange(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), local(host), let port = call.getInt("port"), (1024...65535).contains(port), let payload = call.getString("payload"), payload.utf8.count <= 100000, !payload.contains("\n") else { call.reject("Invalid local connection"); return }
        queue.async {
            let connection = NWConnection(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: UInt16(port))!, using: .tcp)
            var settled = false
            let finish: (String?) -> Void = { response in
                if settled { return }; settled = true; connection.cancel()
                if let response = response { call.resolve(["payload": response]) } else { call.reject("Display connection unavailable") }
            }
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    connection.send(content: (payload + "\n").data(using: .utf8), completion: .contentProcessed { error in
                        if error != nil { finish(nil); return }; self.receive(connection, done: finish)
                    })
                case .failed: finish(nil)
                default: break
                }
            }
            connection.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + 5) { finish(nil) }
        }
    }
}
