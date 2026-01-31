import Foundation
import EventKit
import CoreGraphics
import Darwin

struct CalendarRange: Codable {
    /// Inclusive start time in ISO 8601 format.
    let start: String
    /// Exclusive end time in ISO 8601 format.
    let end: String
}

struct CalendarEventPayload: Codable {
    /// Event identifier when updating.
    let id: String?
    /// Event title.
    let title: String
    /// Start time in ISO 8601 format.
    let start: String
    /// End time in ISO 8601 format.
    let end: String
    /// Whether the event is all-day.
    let allDay: Bool?
    /// Event description.
    let description: String?
    /// Event location.
    let location: String?
    /// Event color hint.
    let color: String?
    /// Target calendar identifier.
    let calendarId: String?
    /// Recurrence rule string.
    let recurrence: String?
    /// Reminder completion status.
    let completed: Bool?
}

struct CalendarItemPayload: Codable {
    /// Calendar identifier.
    let id: String
    /// Calendar title.
    let title: String
    /// Calendar color in hex.
    let color: String?
    /// Whether the calendar is read-only.
    let readOnly: Bool?
}

struct CalendarEventResult: Codable {
    /// Event identifier.
    let id: String
    /// Event title.
    let title: String
    /// Start time in ISO 8601 format.
    let start: String
    /// End time in ISO 8601 format.
    let end: String
    /// Whether the event is all-day.
    let allDay: Bool?
    /// Event description.
    let description: String?
    /// Event location.
    let location: String?
    /// Event color hint.
    let color: String?
    /// Owning calendar identifier.
    let calendarId: String?
    /// Recurrence rule string.
    let recurrence: String?
    /// Reminder completion status.
    let completed: Bool?
}

struct SuccessResult<T: Encodable>: Encodable {
    /// Whether the request succeeded.
    let ok: Bool = true
    /// Payload data.
    let data: T
}

struct ErrorResult: Encodable {
    /// Whether the request succeeded.
    let ok: Bool = false
    /// Error reason in human-readable form.
    let reason: String
    /// Optional machine-readable error code.
    let code: String?
}

/// Entry point for the macOS calendar helper.
@main
struct CalendarHelper {
    /// JSON encoder for output payloads.
    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        return encoder
    }()

    /// JSON decoder for input payloads.
    private static let decoder = JSONDecoder()

    /// ISO 8601 formatter with fractional seconds.
    private static let isoFormatterWithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// ISO 8601 formatter without fractional seconds.
    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    /// Main entry handling CLI actions.
    static func main() {
        let args = CommandLine.arguments
        guard args.count >= 2 else {
            writeError("缺少 action 参数。", code: "missing_action")
            exit(1)
        }

        let action = args[1]
        let payload = args.count >= 3 ? args[2] : "{}"

        switch action {
        case "permission":
            handlePermission()
        case "list-calendars":
            handleListCalendars()
        case "list-reminders":
            handleListReminders()
        case "get-events":
            handleGetEvents(payload: payload)
        case "get-reminders":
            handleGetReminders(payload: payload)
        case "create-event":
            handleCreateEvent(payload: payload)
        case "create-reminder":
            handleCreateReminder(payload: payload)
        case "update-event":
            handleUpdateEvent(payload: payload)
        case "update-reminder":
            handleUpdateReminder(payload: payload)
        case "delete-event":
            handleDeleteEvent(payload: payload)
        case "delete-reminder":
            handleDeleteReminder(payload: payload)
        case "watch":
            handleWatch()
        default:
            writeError("不支持的 action：\(action)", code: "unsupported_action")
            exit(1)
        }
    }

    /// Handle permission request flow.
    private static func handlePermission() {
        let eventStore = EKEventStore()
        let status = authorizationStatus()
        if status == "prompt" {
            let granted = requestEventAccess(eventStore)
            let newStatus = granted ? "granted" : "denied"
            writeSuccess(newStatus)
            return
        }
        writeSuccess(status)
    }

    /// Handle listing calendars.
    private static func handleListCalendars() {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }

        let calendars = eventStore.calendars(for: .event)
        let payloads = calendars.map { calendar in
            CalendarItemPayload(
                id: calendar.calendarIdentifier,
                title: calendar.title,
                color: hexStringFrom(color: calendar.cgColor),
                readOnly: !calendar.allowsContentModifications
            )
        }
        writeSuccess(payloads)
    }

    /// Handle listing reminder lists.
    private static func handleListReminders() {
        let eventStore = EKEventStore()
        guard ensureAuthorizedReminders(eventStore) else { return }

        let calendars = eventStore.calendars(for: .reminder)
        let payloads = calendars.map { calendar in
            CalendarItemPayload(
                id: calendar.calendarIdentifier,
                title: calendar.title,
                color: hexStringFrom(color: calendar.cgColor),
                readOnly: !calendar.allowsContentModifications
            )
        }
        writeSuccess(payloads)
    }

    /// Handle event listing.
    private static func handleGetEvents(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }
        guard let range = decode(CalendarRange.self, from: payload) else { return }
        guard let start = parseDate(range.start), let end = parseDate(range.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }

        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        let events = eventStore.events(matching: predicate)
        let payloads = events.map { event in
            CalendarEventResult(
                id: event.eventIdentifier,
                title: event.title ?? "",
                start: formatDate(event.startDate),
                end: formatDate(event.endDate),
                allDay: event.isAllDay,
                description: event.notes,
                location: event.location,
                color: hexStringFrom(color: event.calendar.cgColor),
                calendarId: event.calendar.calendarIdentifier,
                recurrence: nil,
                completed: nil
            )
        }
        writeSuccess(payloads)
    }

    /// Handle reminder listing.
    private static func handleGetReminders(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorizedReminders(eventStore) else { return }
        guard let range = decode(CalendarRange.self, from: payload) else { return }
        guard let start = parseDate(range.start), let end = parseDate(range.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }

        let incompletePredicate = eventStore.predicateForIncompleteReminders(withDueDateStarting: start, ending: end, calendars: nil)
        let completedPredicate = eventStore.predicateForCompletedReminders(
            withCompletionDateStarting: Date.distantPast,
            ending: Date.distantFuture,
            calendars: nil
        )
        let semaphore = DispatchSemaphore(value: 0)
        var reminders: [EKReminder] = []
        var completedReminders: [EKReminder] = []
        eventStore.fetchReminders(matching: incompletePredicate) { items in
            reminders = items ?? []
            semaphore.signal()
        }
        semaphore.wait()
        let completedSemaphore = DispatchSemaphore(value: 0)
        eventStore.fetchReminders(matching: completedPredicate) { items in
            completedReminders = items ?? []
            completedSemaphore.signal()
        }
        completedSemaphore.wait()

        let calendar = Calendar.current
        let payloads = (reminders + completedReminders).compactMap { reminder -> CalendarEventResult? in
            guard let baseDate = reminderDate(for: reminder, calendar: calendar) else {
                return nil
            }
            if baseDate < start || baseDate > end {
                return nil
            }
            let hasTime = reminderHasTime(reminder)
            let startDate = baseDate
            let endDate: Date = hasTime ? baseDate : calendar.date(byAdding: .day, value: 1, to: baseDate) ?? baseDate
            return CalendarEventResult(
                id: reminder.calendarItemIdentifier,
                title: reminder.title ?? "",
                start: formatDate(startDate),
                end: formatDate(endDate),
                allDay: !hasTime,
                description: reminder.notes,
                location: reminder.location,
                color: hexStringFrom(color: reminder.calendar.cgColor),
                calendarId: reminder.calendar.calendarIdentifier,
                recurrence: nil,
                completed: reminder.isCompleted
            )
        }
        writeSuccess(payloads)
    }

    /// Handle event creation.
    private static func handleCreateEvent(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }
        guard let eventPayload = decode(CalendarEventPayload.self, from: payload) else { return }
        guard let start = parseDate(eventPayload.start), let end = parseDate(eventPayload.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }

        let calendar = resolveCalendar(eventStore, calendarId: eventPayload.calendarId)
        if calendar == nil {
            writeError("未找到目标日历。", code: "calendar_not_found")
            return
        }
        guard calendar?.allowsContentModifications ?? false else {
            writeError("目标日历不允许写入。", code: "calendar_readonly")
            return
        }

        let event = EKEvent(eventStore: eventStore)
        event.calendar = calendar
        event.title = eventPayload.title
        event.startDate = start
        event.endDate = end
        event.isAllDay = eventPayload.allDay ?? false
        event.notes = eventPayload.description
        event.location = eventPayload.location

        do {
            try eventStore.save(event, span: .thisEvent, commit: true)
            let result = CalendarEventResult(
                id: event.eventIdentifier,
                title: event.title ?? "",
                start: formatDate(event.startDate),
                end: formatDate(event.endDate),
                allDay: event.isAllDay,
                description: event.notes,
                location: event.location,
                color: hexStringFrom(color: event.calendar.cgColor),
                calendarId: event.calendar.calendarIdentifier,
                recurrence: nil,
                completed: nil
            )
            writeSuccess(result)
        } catch {
            writeError("创建事件失败。", code: "create_failed")
        }
    }

    /// Handle reminder creation.
    private static func handleCreateReminder(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorizedReminders(eventStore) else { return }
        guard let reminderPayload = decode(CalendarEventPayload.self, from: payload) else { return }
        guard let start = parseDate(reminderPayload.start), let end = parseDate(reminderPayload.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }
        // 逻辑：记录提醒事项创建入参，用于排查日期回退问题。
        writeDebug("create-reminder payload start=\(reminderPayload.start) end=\(reminderPayload.end) allDay=\(String(describing: reminderPayload.allDay))")

        let calendar = resolveReminderCalendar(eventStore, calendarId: reminderPayload.calendarId)
        if calendar == nil {
            writeError("未找到目标提醒事项列表。", code: "calendar_not_found")
            return
        }
        guard calendar?.allowsContentModifications ?? false else {
            writeError("目标提醒事项列表不允许写入。", code: "calendar_readonly")
            return
        }

        let reminder = EKReminder(eventStore: eventStore)
        reminder.calendar = calendar
        reminder.title = reminderPayload.title
        reminder.notes = reminderPayload.description
        reminder.location = reminderPayload.location
        let calendarSystem = Calendar.current
        if reminderPayload.allDay ?? false {
            // 逻辑：提醒事项只有日期，不使用时间，避免时区换算导致日期回退。
            let dateComponents =
                parseDateOnlyComponents(reminderPayload.start) ??
                calendarSystem.dateComponents([.year, .month, .day], from: start)
            reminder.dueDateComponents = dateComponents
            reminder.startDateComponents = nil
            writeDebug("create-reminder dateComponents=\(String(describing: dateComponents))")
        } else {
            reminder.startDateComponents = calendarSystem.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: start
            )
            reminder.dueDateComponents = calendarSystem.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: end
            )
        }
        if let completed = reminderPayload.completed {
            reminder.isCompleted = completed
            reminder.completionDate = completed ? Date() : nil
        }

        do {
            try eventStore.save(reminder, commit: true)
            let hasTime = !(reminderPayload.allDay ?? false)
            let endDate: Date = hasTime ? end : calendarSystem.date(byAdding: .day, value: 1, to: start) ?? start
            let result = CalendarEventResult(
                id: reminder.calendarItemIdentifier,
                title: reminder.title ?? "",
                start: formatDate(start),
                end: formatDate(endDate),
                allDay: !hasTime,
                description: reminder.notes,
                location: reminder.location,
                color: hexStringFrom(color: reminder.calendar.cgColor),
                calendarId: reminder.calendar.calendarIdentifier,
                recurrence: nil,
                completed: reminder.isCompleted
            )
            writeSuccess(result)
        } catch {
            writeError("创建提醒事项失败。", code: "create_failed")
        }
    }

    /// Handle event update.
    private static func handleUpdateEvent(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }
        guard let eventPayload = decode(CalendarEventPayload.self, from: payload) else { return }
        guard let eventId = eventPayload.id, !eventId.isEmpty else {
            writeError("缺少事件 ID。", code: "missing_id")
            return
        }
        guard let start = parseDate(eventPayload.start), let end = parseDate(eventPayload.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }
        guard let event = eventStore.event(withIdentifier: eventId) else {
            writeError("未找到事件。", code: "event_not_found")
            return
        }

        if let calendarId = eventPayload.calendarId, !calendarId.isEmpty {
            let calendar = resolveCalendar(eventStore, calendarId: calendarId)
            if calendar == nil {
                writeError("未找到目标日历。", code: "calendar_not_found")
                return
            }
            if calendar?.allowsContentModifications == false {
                writeError("目标日历不允许写入。", code: "calendar_readonly")
                return
            }
            event.calendar = calendar
        }

        guard event.calendar.allowsContentModifications else {
            writeError("目标日历不允许写入。", code: "calendar_readonly")
            return
        }

        event.title = eventPayload.title
        event.startDate = start
        event.endDate = end
        event.isAllDay = eventPayload.allDay ?? false
        event.notes = eventPayload.description
        event.location = eventPayload.location

        do {
            try eventStore.save(event, span: .thisEvent, commit: true)
            let result = CalendarEventResult(
                id: event.eventIdentifier,
                title: event.title ?? "",
                start: formatDate(event.startDate),
                end: formatDate(event.endDate),
                allDay: event.isAllDay,
                description: event.notes,
                location: event.location,
                color: hexStringFrom(color: event.calendar.cgColor),
                calendarId: event.calendar.calendarIdentifier,
                recurrence: nil,
                completed: nil
            )
            writeSuccess(result)
        } catch {
            writeError("更新事件失败。", code: "update_failed")
        }
    }

    /// Handle reminder update.
    private static func handleUpdateReminder(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorizedReminders(eventStore) else { return }
        guard let reminderPayload = decode(CalendarEventPayload.self, from: payload) else { return }
        guard let reminderId = reminderPayload.id, !reminderId.isEmpty else {
            writeError("缺少提醒事项 ID。", code: "missing_id")
            return
        }
        guard let start = parseDate(reminderPayload.start), let end = parseDate(reminderPayload.end) else {
            writeError("时间格式解析失败。", code: "invalid_time")
            return
        }
        // 逻辑：记录提醒事项更新入参，用于排查日期回退问题。
        writeDebug("update-reminder payload id=\(reminderId) start=\(reminderPayload.start) end=\(reminderPayload.end) allDay=\(String(describing: reminderPayload.allDay))")
        guard let reminder = eventStore.calendarItem(withIdentifier: reminderId) as? EKReminder else {
            writeError("未找到提醒事项。", code: "event_not_found")
            return
        }

        if let calendarId = reminderPayload.calendarId, !calendarId.isEmpty {
            let calendar = resolveReminderCalendar(eventStore, calendarId: calendarId)
            if calendar == nil {
                writeError("未找到目标提醒事项列表。", code: "calendar_not_found")
                return
            }
            if calendar?.allowsContentModifications == false {
                writeError("目标提醒事项列表不允许写入。", code: "calendar_readonly")
                return
            }
            reminder.calendar = calendar
        }

        guard reminder.calendar.allowsContentModifications else {
            writeError("目标提醒事项列表不允许写入。", code: "calendar_readonly")
            return
        }

        reminder.title = reminderPayload.title
        reminder.notes = reminderPayload.description
        reminder.location = reminderPayload.location
        let calendarSystem = Calendar.current
        if reminderPayload.allDay ?? false {
            // 逻辑：提醒事项只有日期，不使用时间，避免时区换算导致日期回退。
            let dateComponents =
                parseDateOnlyComponents(reminderPayload.start) ??
                calendarSystem.dateComponents([.year, .month, .day], from: start)
            reminder.dueDateComponents = dateComponents
            reminder.startDateComponents = nil
            writeDebug("update-reminder dateComponents=\(String(describing: dateComponents))")
        } else {
            reminder.startDateComponents = calendarSystem.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: start
            )
            reminder.dueDateComponents = calendarSystem.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: end
            )
        }
        if let completed = reminderPayload.completed {
            reminder.isCompleted = completed
            reminder.completionDate = completed ? Date() : nil
        }

        do {
            try eventStore.save(reminder, commit: true)
            let hasTime = !(reminderPayload.allDay ?? false)
            let endDate: Date = hasTime ? end : calendarSystem.date(byAdding: .day, value: 1, to: start) ?? start
            let result = CalendarEventResult(
                id: reminder.calendarItemIdentifier,
                title: reminder.title ?? "",
                start: formatDate(start),
                end: formatDate(endDate),
                allDay: !hasTime,
                description: reminder.notes,
                location: reminder.location,
                color: hexStringFrom(color: reminder.calendar.cgColor),
                calendarId: reminder.calendar.calendarIdentifier,
                recurrence: nil,
                completed: reminder.isCompleted
            )
            writeSuccess(result)
        } catch {
            writeError("更新提醒事项失败。", code: "update_failed")
        }
    }

    /// Handle event deletion.
    private static func handleDeleteEvent(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }
        guard let idPayload = decode([String: String].self, from: payload),
              let eventId = idPayload["id"],
              !eventId.isEmpty
        else {
            writeError("缺少事件 ID。", code: "missing_id")
            return
        }
        guard let event = eventStore.event(withIdentifier: eventId) else {
            writeError("未找到事件。", code: "event_not_found")
            return
        }

        do {
            try eventStore.remove(event, span: .thisEvent, commit: true)
            writeSuccess(["id": eventId])
        } catch {
            writeError("删除事件失败。", code: "delete_failed")
        }
    }

    /// Handle reminder deletion.
    private static func handleDeleteReminder(payload: String) {
        let eventStore = EKEventStore()
        guard ensureAuthorizedReminders(eventStore) else { return }
        guard let idPayload = decode([String: String].self, from: payload),
              let reminderId = idPayload["id"],
              !reminderId.isEmpty
        else {
            writeError("缺少提醒事项 ID。", code: "missing_id")
            return
        }
        guard let reminder = eventStore.calendarItem(withIdentifier: reminderId) as? EKReminder else {
            writeError("未找到提醒事项。", code: "event_not_found")
            return
        }

        do {
            try eventStore.remove(reminder, commit: true)
            writeSuccess(["id": reminderId])
        } catch {
            writeError("删除提醒事项失败。", code: "delete_failed")
        }
    }

    /// Handle watch mode and emit change notifications.
    private static func handleWatch() {
        let eventStore = EKEventStore()
        guard ensureAuthorized(eventStore) else { return }

        setbuf(stdout, nil)
        let center = NotificationCenter.default
        let observer = center.addObserver(
            forName: .EKEventStoreChanged,
            object: eventStore,
            queue: nil
        ) { _ in
            emitChange()
        }

        // 逻辑：保持进程存活，直到外部终止。
        RunLoop.current.run()
        center.removeObserver(observer)
    }

    /// Ensure access is granted before continuing.
    private static func ensureAuthorized(_ store: EKEventStore) -> Bool {
        let status = authorizationStatus()
        if status == "granted" {
            return true
        }
        if status == "prompt" {
            let granted = requestEventAccess(store)
            if granted { return true }
        }
        writeError("未授权系统日历访问权限。", code: "not_authorized")
        return false
    }

    /// Ensure reminder access is granted before continuing.
    private static func ensureAuthorizedReminders(_ store: EKEventStore) -> Bool {
        let status = reminderAuthorizationStatus()
        if status == "granted" {
            return true
        }
        if status == "prompt" {
            let granted = requestReminderAccess(store)
            if granted { return true }
        }
        writeError("未授权提醒事项访问权限。", code: "not_authorized")
        return false
    }

    /// Resolve calendar by id or default calendar.
    private static func resolveCalendar(_ store: EKEventStore, calendarId: String?) -> EKCalendar? {
        if let calendarId = calendarId, !calendarId.isEmpty {
            return store.calendar(withIdentifier: calendarId)
        }
        return store.defaultCalendarForNewEvents
    }

    /// Resolve reminder calendar by id or default reminder list.
    private static func resolveReminderCalendar(_ store: EKEventStore, calendarId: String?) -> EKCalendar? {
        if let calendarId = calendarId, !calendarId.isEmpty {
            return store.calendar(withIdentifier: calendarId)
        }
        return store.defaultCalendarForNewReminders()
    }

    /// Determine current permission state.
    private static func authorizationStatus() -> String {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(macOS 14.0, *) {
            switch status {
            case .authorized, .fullAccess, .writeOnly:
                return "granted"
            case .restricted, .denied:
                return "denied"
            case .notDetermined:
                return "prompt"
            @unknown default:
                return "unsupported"
            }
        }
        switch status {
        case .authorized:
            return "granted"
        case .restricted, .denied, .fullAccess, .writeOnly:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "unsupported"
        }
    }

    /// Determine reminder permission state.
    private static func reminderAuthorizationStatus() -> String {
        let status = EKEventStore.authorizationStatus(for: .reminder)
        if #available(macOS 14.0, *) {
            switch status {
            case .authorized, .fullAccess, .writeOnly:
                return "granted"
            case .restricted, .denied:
                return "denied"
            case .notDetermined:
                return "prompt"
            @unknown default:
                return "unsupported"
            }
        }
        switch status {
        case .authorized:
            return "granted"
        case .restricted, .denied, .fullAccess, .writeOnly:
            return "denied"
        case .notDetermined:
            return "prompt"
        @unknown default:
            return "unsupported"
        }
    }

    /// Request system calendar access based on OS version.
    private static func requestEventAccess(_ store: EKEventStore) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var granted = false
        if #available(macOS 14.0, *) {
            store.requestFullAccessToEvents { allowed, _ in
                granted = allowed
                semaphore.signal()
            }
        } else {
            store.requestAccess(to: .event) { allowed, _ in
                granted = allowed
                semaphore.signal()
            }
        }
        semaphore.wait()
        return granted
    }

    /// Request system reminder access based on OS version.
    private static func requestReminderAccess(_ store: EKEventStore) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var granted = false
        if #available(macOS 14.0, *) {
            store.requestFullAccessToReminders { allowed, _ in
                granted = allowed
                semaphore.signal()
            }
        } else {
            store.requestAccess(to: .reminder) { allowed, _ in
                granted = allowed
                semaphore.signal()
            }
        }
        semaphore.wait()
        return granted
    }

    /// Decode JSON string into target payload.
    private static func decode<T: Decodable>(_ type: T.Type, from payload: String) -> T? {
        guard let data = payload.data(using: .utf8) else {
            writeError("输入数据解析失败。", code: "invalid_payload")
            return nil
        }
        do {
            return try decoder.decode(type, from: data)
        } catch {
            writeError("输入数据解析失败。", code: "invalid_payload")
            return nil
        }
    }

    /// Parse ISO date string.
    private static func parseDate(_ value: String) -> Date? {
        if let date = isoFormatterWithFractional.date(from: value) {
            return date
        }
        return isoFormatter.date(from: value)
    }

    /// Parse date-only components from an ISO-like string (YYYY-MM-DD...).
    private static func parseDateOnlyComponents(_ value: String) -> DateComponents? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 10 else { return nil }
        let datePart = String(trimmed.prefix(10))
        let parts = datePart.split(separator: "-")
        guard parts.count == 3 else { return nil }
        guard let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else {
            return nil
        }
        var components = DateComponents()
        components.year = year
        components.month = month
        components.day = day
        return components
    }

    /// Format date as ISO 8601 string.
    private static func formatDate(_ date: Date) -> String {
        return isoFormatterWithFractional.string(from: date)
    }

    /// Convert CGColor to hex string.
    private static func hexStringFrom(color: CGColor?) -> String? {
        guard let color = color,
              let components = color.components else { return nil }
        let r: CGFloat
        let g: CGFloat
        let b: CGFloat

        if components.count >= 3 {
            r = components[0]
            g = components[1]
            b = components[2]
        } else if components.count == 2 {
            r = components[0]
            g = components[0]
            b = components[0]
        } else {
            return nil
        }

        return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
    }

    /// Emit a change line for watch mode.
    private static func emitChange() {
        let payload = ["type": "changed"]
        guard let data = try? encoder.encode(payload),
              let text = String(data: data, encoding: .utf8) else { return }
        print(text)
        fflush(stdout)
    }

    /// Resolve reminder date from reminder components.
    private static func reminderDate(for reminder: EKReminder, calendar: Calendar) -> Date? {
        if let dueComponents = reminder.dueDateComponents,
           let dueDate = calendar.date(from: dueComponents) {
            return dueDate
        }
        if let completionDate = reminder.completionDate {
            return completionDate
        }
        if let startComponents = reminder.startDateComponents,
           let startDate = calendar.date(from: startComponents) {
            return startDate
        }
        return nil
    }

    /// Determine whether reminder has explicit time components.
    private static func reminderHasTime(_ reminder: EKReminder) -> Bool {
        if let startComponents = reminder.startDateComponents {
            return startComponents.hour != nil || startComponents.minute != nil
        }
        guard let components = reminder.dueDateComponents else { return false }
        if components.hour == nil && components.minute == nil {
            return false
        }
        if components.hour == 0 && (components.minute ?? 0) == 0 {
            // 逻辑：没有显式时间时，EventKit 可能给出 00:00，视为日期提醒。
            return false
        }
        return true
    }

    /// Emit success response JSON.
    private static func writeSuccess<T: Encodable>(_ data: T) {
        let payload = SuccessResult(data: data)
        emitPayload(payload)
    }

    /// Emit error response JSON.
    private static func writeError(_ reason: String, code: String?) {
        let payload = ErrorResult(reason: reason, code: code)
        emitPayload(payload)
    }

    /// Write debug logs to stderr.
    private static func writeDebug(_ message: String) {
        let line = "[calendar-helper] \(message)\n"
        if let data = line.data(using: .utf8) {
            FileHandle.standardError.write(data)
        }
    }

    /// Emit payload to stdout.
    private static func emitPayload<T: Encodable>(_ payload: T) {
        guard let data = try? encoder.encode(payload),
              let text = String(data: data, encoding: .utf8) else { return }
        print(text)
    }
}
