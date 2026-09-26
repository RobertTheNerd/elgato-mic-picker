// micctl — tiny CoreAudio helper for the Mic Picker Stream Deck plugin.
//
//   micctl list          -> {"default":"<uid>","devices":[{"uid":"…","name":"…"}]}
//   micctl set <uid>     -> sets the system default input device
//   micctl mute <uid> on|off|toggle -> changes the device's input mute
//   micctl watch         -> prints the `list` JSON once, then again on every device/default/mute change,
//                           and {"event":"wake"} whenever the Mac wakes from sleep
import AppKit
import CoreAudio
import Foundation

let system = AudioObjectID(kAudioObjectSystemObject)

func address(_ selector: AudioObjectPropertySelector,
             _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}

func allDeviceIDs() -> [AudioDeviceID] {
    var addr = address(kAudioHardwarePropertyDevices)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(system, &addr, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    guard AudioObjectGetPropertyData(system, &addr, 0, nil, &size, &ids) == noErr else { return [] }
    return ids
}

func stringProperty(_ id: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String? {
    var addr = address(selector)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr, let v = value else { return nil }
    return v.takeRetainedValue() as String
}

func hasInput(_ id: AudioDeviceID) -> Bool {
    var addr = address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeInput)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr, size > 0 else { return false }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, raw) == noErr else { return false }
    let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.contains { $0.mNumberChannels > 0 }
}

func defaultInputID() -> AudioDeviceID {
    var addr = address(kAudioHardwarePropertyDefaultInputDevice)
    var id = AudioDeviceID(0)
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    AudioObjectGetPropertyData(system, &addr, 0, nil, &size, &id)
    return id
}

var muteAddress = address(kAudioDevicePropertyMute, kAudioDevicePropertyScopeInput)

/// The device's input mute state, or nil when it has no settable mute control.
func isMuted(_ id: AudioDeviceID) -> Bool? {
    var settable = DarwinBoolean(false)
    guard AudioObjectHasProperty(id, &muteAddress),
          AudioObjectIsPropertySettable(id, &muteAddress, &settable) == noErr, settable.boolValue else { return nil }
    var value = UInt32(0)
    var size = UInt32(MemoryLayout<UInt32>.size)
    guard AudioObjectGetPropertyData(id, &muteAddress, 0, nil, &size, &value) == noErr else { return nil }
    return value != 0
}

func inputDevice(uid: String) -> AudioDeviceID? {
    allDeviceIDs().first { stringProperty($0, kAudioDevicePropertyDeviceUID) == uid && hasInput($0) }
}

func snapshotJSON() -> String {
    let devices = allDeviceIDs().filter(hasInput).compactMap { id -> [String: Any]? in
        guard let uid = stringProperty(id, kAudioDevicePropertyDeviceUID) else { return nil }
        var device: [String: Any] = ["uid": uid, "name": stringProperty(id, kAudioObjectPropertyName) ?? uid]
        if let muted = isMuted(id) { device["muted"] = muted }
        return device
    }
    let obj: [String: Any] = [
        "default": stringProperty(defaultInputID(), kAudioDevicePropertyDeviceUID) ?? "",
        "devices": devices,
    ]
    let data = try! JSONSerialization.data(withJSONObject: obj, options: .sortedKeys)
    return String(data: data, encoding: .utf8)!
}

func setDefaultInput(uid: String) -> Bool {
    guard let id = inputDevice(uid: uid) else { return false }
    var addr = address(kAudioHardwarePropertyDefaultInputDevice)
    var value = id
    return AudioObjectSetPropertyData(system, &addr, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &value) == noErr
}

func setMute(uid: String, mode: String) -> Bool {
    guard let id = inputDevice(uid: uid), let current = isMuted(id) else { return false }
    var value = UInt32((mode == "toggle" ? !current : mode == "on") ? 1 : 0)
    return AudioObjectSetPropertyData(id, &muteAddress, 0, nil, UInt32(MemoryLayout<UInt32>.size), &value) == noErr
}

func fail(_ message: String, _ code: Int32 = 1) -> Never {
    FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
    exit(code)
}

setvbuf(stdout, nil, _IOLBF, 0)
let args = CommandLine.arguments.dropFirst()

switch args.first {
case "list":
    print(snapshotJSON())
case "set":
    guard let uid = args.dropFirst().first else { fail("usage: micctl set <uid>", 2) }
    if !setDefaultInput(uid: uid) { fail("device not found or could not be set: \(uid)") }
case "mute":
    let rest = Array(args.dropFirst())
    guard rest.count == 2, ["on", "off", "toggle"].contains(rest[1]) else { fail("usage: micctl mute <uid> on|off|toggle", 2) }
    if !setMute(uid: rest[0], mode: rest[1]) { fail("device not found or has no mute control: \(rest[0])") }
case "watch":
    let queue = DispatchQueue(label: "micctl.watch")
    var last = ""
    func publish() {
        let json = snapshotJSON()
        if json != last { last = json; print(json) }
    }
    let emit: AudioObjectPropertyListenerBlock = { _, _ in publish() }
    // Mute listeners are per device, so (re)attach them whenever the device list changes.
    var muteWatched = Set<AudioDeviceID>()
    func watchMutes() {
        for id in allDeviceIDs() where !muteWatched.contains(id) && AudioObjectHasProperty(id, &muteAddress) {
            if AudioObjectAddPropertyListenerBlock(id, &muteAddress, queue, emit) == noErr { muteWatched.insert(id) }
        }
    }
    var defaultAddr = address(kAudioHardwarePropertyDefaultInputDevice)
    AudioObjectAddPropertyListenerBlock(system, &defaultAddr, queue, emit)
    var devicesAddr = address(kAudioHardwarePropertyDevices)
    AudioObjectAddPropertyListenerBlock(system, &devicesAddr, queue) { _, _ in watchMutes(); publish() }
    queue.sync { watchMutes(); publish() }
    // Devices may stay connected through sleep while macOS picks another default input on wake, so say so.
    NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: nil) { _ in
        queue.async { print(#"{"event":"wake"}"#) }
    }
    // Exit when the parent (Stream Deck plugin) goes away.
    let stdinSource = DispatchSource.makeReadSource(fileDescriptor: STDIN_FILENO, queue: .main)
    var buf = [UInt8](repeating: 0, count: 64)
    stdinSource.setEventHandler { if read(STDIN_FILENO, &buf, buf.count) <= 0 { exit(0) } }
    stdinSource.resume()
    RunLoop.main.run() // unlike dispatchMain(), also delivers NSWorkspace notifications
default:
    fail("usage: micctl list | set <uid> | mute <uid> on|off|toggle | watch", 2)
}
