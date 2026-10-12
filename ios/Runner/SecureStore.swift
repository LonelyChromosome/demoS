import Foundation
import Security

enum SecureStore {
    static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "vn.edu.phenikaa.bpa", kSecAttrAccount as String: key]
    }
    static func read(_ key: String) -> Data? {
        var q = query(key); q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &value) == errSecSuccess else { return nil }
        return value as? Data
    }
    static func save(_ key: String, _ bytes: Data) throws {
        let q = query(key)
        let changed = SecItemUpdate(q as CFDictionary, [kSecValueData as String: bytes] as CFDictionary)
        if changed == errSecSuccess { return }
        guard changed == errSecItemNotFound else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(changed)) }
        var item = q
        item[kSecValueData as String] = bytes
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
    static func clear(_ key: String) throws {
        let status = SecItemDelete(query(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }
}
