using System;
using System.Collections.Generic;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Windows.ApplicationModel.Appointments;
using Windows.Foundation;

namespace TenasCalendar;

internal sealed class Program
{
    /// <summary>Signal to keep the watch process alive.</summary>
    private static readonly ManualResetEvent ShutdownSignal = new(false);

    /// <summary>Serializer options for JSON payloads.</summary>
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>Entry point for the Windows calendar helper.</summary>
    [STAThread]
    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;

        if (args.Length == 0)
        {
            WriteError("缺少 action 参数。", "missing_action");
            return 1;
        }

        var action = args[0];
        var payloadJson = args.Length > 1 ? args[1] : "{}";

        try
        {
            return RunActionAsync(action, payloadJson).GetAwaiter().GetResult();
        }
        catch (Exception ex)
        {
            WriteError($"执行失败：{ex.Message}", "unexpected_error");
            return 1;
        }
    }

    /// <summary>Dispatch action to matching handler.</summary>
    private static async Task<int> RunActionAsync(string action, string payloadJson)
    {
        switch (action)
        {
            case "permission":
                await HandlePermissionAsync();
                return 0;
            case "list-calendars":
                await HandleListCalendarsAsync();
                return 0;
            case "list-reminders":
                WriteError("提醒事项仅支持 macOS。", "unsupported");
                return 0;
            case "get-events":
                await HandleGetEventsAsync(payloadJson);
                return 0;
            case "get-reminders":
                WriteError("提醒事项仅支持 macOS。", "unsupported");
                return 0;
            case "create-event":
                await HandleCreateEventAsync(payloadJson);
                return 0;
            case "create-reminder":
                WriteError("提醒事项仅支持 macOS。", "unsupported");
                return 0;
            case "update-event":
                await HandleUpdateEventAsync(payloadJson);
                return 0;
            case "update-reminder":
                WriteError("提醒事项仅支持 macOS。", "unsupported");
                return 0;
            case "delete-event":
                await HandleDeleteEventAsync(payloadJson);
                return 0;
            case "delete-reminder":
                WriteError("提醒事项仅支持 macOS。", "unsupported");
                return 0;
            case "watch":
                await HandleWatchAsync();
                return 0;
            default:
                WriteError($"不支持的 action：{action}", "unsupported_action");
                return 1;
        }
    }

    /// <summary>Handle permission request.</summary>
    private static async Task HandlePermissionAsync()
    {
        try
        {
            _ = await AppointmentManager.RequestStoreAsync(AppointmentStoreAccessType.AllCalendarsReadWrite);
            WriteSuccess("granted");
        }
        catch
        {
            WriteSuccess("denied");
        }
    }

    /// <summary>Handle listing calendars.</summary>
    private static async Task HandleListCalendarsAsync()
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadOnly);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        var calendars = await store.FindAppointmentCalendarsAsync();
        var payloads = new List<CalendarItemPayload>();
        foreach (var calendar in calendars)
        {
            payloads.Add(new CalendarItemPayload
            {
                Id = calendar.LocalId,
                Title = calendar.DisplayName ?? string.Empty,
                Color = null,
                ReadOnly = calendar.OtherAppWriteAccess == AppointmentCalendarOtherAppWriteAccess.None,
                // 逻辑：Windows API 未提供订阅日历标识，先返回 false。
                IsSubscribed = false,
            });
        }

        WriteSuccess(payloads);
    }

    /// <summary>Handle querying events.</summary>
    private static async Task HandleGetEventsAsync(string payloadJson)
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadOnly);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        var range = ReadPayload<CalendarRange>(payloadJson);
        if (range == null)
        {
            WriteError("输入数据解析失败。", "invalid_payload");
            return;
        }

        if (!DateTimeOffset.TryParse(range.Start, out var start) || !DateTimeOffset.TryParse(range.End, out var end))
        {
            WriteError("时间格式解析失败。", "invalid_time");
            return;
        }

        var duration = end - start;
        if (duration <= TimeSpan.Zero)
        {
            WriteError("时间区间不合法。", "invalid_range");
            return;
        }

        var appointments = await store.FindAppointmentsAsync(start, duration);
        var payloads = new List<CalendarEventResult>();
        foreach (var appointment in appointments)
        {
            payloads.Add(new CalendarEventResult
            {
                Id = appointment.LocalId,
                Title = appointment.Subject ?? string.Empty,
                Start = appointment.StartTime.ToString("o"),
                End = appointment.StartTime.Add(appointment.Duration).ToString("o"),
                AllDay = appointment.AllDay,
                Description = appointment.Details,
                Location = appointment.Location,
                Color = null,
                CalendarId = appointment.CalendarId,
                Recurrence = null,
            });
        }

        WriteSuccess(payloads);
    }

    /// <summary>Handle event creation.</summary>
    private static async Task HandleCreateEventAsync(string payloadJson)
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadWrite);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        var payload = ReadPayload<CalendarEventPayload>(payloadJson);
        if (payload == null)
        {
            WriteError("输入数据解析失败。", "invalid_payload");
            return;
        }

        if (!DateTimeOffset.TryParse(payload.Start, out var start) || !DateTimeOffset.TryParse(payload.End, out var end))
        {
            WriteError("时间格式解析失败。", "invalid_time");
            return;
        }

        var calendar = await ResolveCalendarAsync(store, payload.CalendarId);
        if (calendar == null)
        {
            WriteError("未找到目标日历。", "calendar_not_found");
            return;
        }

        var appointment = new Appointment
        {
            Subject = payload.Title ?? string.Empty,
            StartTime = start,
            Duration = end - start,
            AllDay = payload.AllDay ?? false,
            Location = payload.Location,
            Details = payload.Description,
        };

        await calendar.SaveAppointmentAsync(appointment);

        var savedId = appointment.LocalId;
        if (!string.IsNullOrWhiteSpace(savedId))
        {
            var saved = await store.GetAppointmentAsync(savedId);
            if (saved != null)
            {
                WriteSuccess(ToResult(saved));
                return;
            }
        }

        WriteSuccess(ToResult(appointment));
    }

    /// <summary>Handle event update.</summary>
    private static async Task HandleUpdateEventAsync(string payloadJson)
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadWrite);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        var payload = ReadPayload<CalendarEventPayload>(payloadJson);
        if (payload == null || string.IsNullOrWhiteSpace(payload.Id))
        {
            WriteError("缺少事件 ID。", "missing_id");
            return;
        }

        if (!DateTimeOffset.TryParse(payload.Start, out var start) || !DateTimeOffset.TryParse(payload.End, out var end))
        {
            WriteError("时间格式解析失败。", "invalid_time");
            return;
        }

        var appointment = await store.GetAppointmentAsync(payload.Id);
        if (appointment == null)
        {
            WriteError("未找到事件。", "event_not_found");
            return;
        }

        if (!string.IsNullOrWhiteSpace(payload.CalendarId) && payload.CalendarId != appointment.CalendarId)
        {
            WriteError("暂不支持跨日历移动事件。", "calendar_move_unsupported");
            return;
        }

        appointment.Subject = payload.Title ?? appointment.Subject ?? string.Empty;
        appointment.StartTime = start;
        appointment.Duration = end - start;
        appointment.AllDay = payload.AllDay ?? false;
        appointment.Location = payload.Location;
        appointment.Details = payload.Description;

        var calendar = await ResolveCalendarAsync(store, appointment.CalendarId);
        if (calendar == null)
        {
            WriteError("未找到目标日历。", "calendar_not_found");
            return;
        }

        await calendar.SaveAppointmentAsync(appointment);
        WriteSuccess(ToResult(appointment));
    }

    /// <summary>Handle event deletion.</summary>
    private static async Task HandleDeleteEventAsync(string payloadJson)
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadWrite);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        var payload = ReadPayload<DeletePayload>(payloadJson);
        if (payload == null || string.IsNullOrWhiteSpace(payload.Id))
        {
            WriteError("缺少事件 ID。", "missing_id");
            return;
        }

        var appointment = await store.GetAppointmentAsync(payload.Id);
        if (appointment == null)
        {
            WriteError("未找到事件。", "event_not_found");
            return;
        }

        var calendar = await ResolveCalendarAsync(store, appointment.CalendarId);
        if (calendar == null)
        {
            WriteError("未找到目标日历。", "calendar_not_found");
            return;
        }

        await calendar.DeleteAppointmentAsync(appointment.LocalId);
        WriteSuccess(new { id = payload.Id });
    }

    /// <summary>Handle watch mode and emit change notifications.</summary>
    private static async Task HandleWatchAsync()
    {
        var store = await GetStoreAsync(AppointmentStoreAccessType.AllCalendarsReadOnly);
        if (store == null)
        {
            WriteError("未授权系统日历访问权限。", "not_authorized");
            return;
        }

        store.StoreChanged += OnStoreChanged;
        Console.CancelKeyPress += (_, args) =>
        {
            args.Cancel = true;
            ShutdownSignal.Set();
        };

        // 逻辑：阻塞主线程直到收到退出信号。
        ShutdownSignal.WaitOne();
        store.StoreChanged -= OnStoreChanged;
    }

    /// <summary>Handle store changed events.</summary>
    private static void OnStoreChanged(AppointmentStore sender, AppointmentStoreChangedEventArgs args)
    {
        var payload = new { type = "changed" };
        WriteRaw(JsonSerializer.Serialize(payload, SerializerOptions));
    }

    /// <summary>Resolve appointment store with desired access.</summary>
    private static async Task<AppointmentStore?> GetStoreAsync(AppointmentStoreAccessType accessType)
    {
        try
        {
            return await AppointmentManager.RequestStoreAsync(accessType);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Resolve calendar by id or default calendar.</summary>
    private static async Task<AppointmentCalendar?> ResolveCalendarAsync(AppointmentStore store, string? calendarId)
    {
        if (!string.IsNullOrWhiteSpace(calendarId))
        {
            try
            {
                return await store.GetAppointmentCalendarAsync(calendarId);
            }
            catch
            {
                return null;
            }
        }

        try
        {
            var calendars = await store.FindAppointmentCalendarsAsync();
            AppointmentCalendar? selected = null;
            foreach (var calendar in calendars)
            {
                if (selected == null)
                {
                    selected = calendar;
                }

                if (calendar.OtherAppWriteAccess != AppointmentCalendarOtherAppWriteAccess.None)
                {
                    selected = calendar;
                    break;
                }
            }

            return selected;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Convert appointment to output payload.</summary>
    private static CalendarEventResult ToResult(Appointment appointment)
    {
        return new CalendarEventResult
        {
            Id = appointment.LocalId,
            Title = appointment.Subject ?? string.Empty,
            Start = appointment.StartTime.ToString("o"),
            End = appointment.StartTime.Add(appointment.Duration).ToString("o"),
            AllDay = appointment.AllDay,
            Description = appointment.Details,
            Location = appointment.Location,
            Color = null,
            CalendarId = appointment.CalendarId,
            Recurrence = null,
        };
    }

    /// <summary>Read payload JSON into model.</summary>
    private static T? ReadPayload<T>(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<T>(json, SerializerOptions);
        }
        catch
        {
            return default;
        }
    }

/// <summary>Emit success payload.</summary>
    private static void WriteSuccess(object data)
    {
        var payload = new { ok = true, data };
        WriteRaw(JsonSerializer.Serialize(payload, SerializerOptions));
    }

    /// <summary>Emit error payload.</summary>
    private static void WriteError(string reason, string code)
    {
        var payload = new { ok = false, reason, code };
        WriteRaw(JsonSerializer.Serialize(payload, SerializerOptions));
    }

    /// <summary>Write output line.</summary>
    private static void WriteRaw(string line)
    {
        Console.WriteLine(line);
    }

    private sealed class CalendarRange
    {
        /// <summary>Inclusive start time in ISO 8601 format.</summary>
        public string Start { get; set; } = string.Empty;
        /// <summary>Exclusive end time in ISO 8601 format.</summary>
        public string End { get; set; } = string.Empty;
    }

    private sealed class CalendarEventPayload
    {
        /// <summary>Event identifier when updating.</summary>
        public string? Id { get; set; }
        /// <summary>Event title.</summary>
        public string? Title { get; set; }
        /// <summary>Start time in ISO 8601 format.</summary>
        public string Start { get; set; } = string.Empty;
        /// <summary>End time in ISO 8601 format.</summary>
        public string End { get; set; } = string.Empty;
        /// <summary>Whether the event is all-day.</summary>
        public bool? AllDay { get; set; }
        /// <summary>Event description.</summary>
        public string? Description { get; set; }
        /// <summary>Event location.</summary>
        public string? Location { get; set; }
        /// <summary>Event color hint.</summary>
        public string? Color { get; set; }
        /// <summary>Target calendar identifier.</summary>
        public string? CalendarId { get; set; }
        /// <summary>Recurrence rule string.</summary>
        public string? Recurrence { get; set; }
    }

    private sealed class CalendarEventResult
    {
        /// <summary>Event identifier.</summary>
        public string Id { get; set; } = string.Empty;
        /// <summary>Event title.</summary>
        public string Title { get; set; } = string.Empty;
        /// <summary>Start time in ISO 8601 format.</summary>
        public string Start { get; set; } = string.Empty;
        /// <summary>End time in ISO 8601 format.</summary>
        public string End { get; set; } = string.Empty;
        /// <summary>Whether the event is all-day.</summary>
        public bool? AllDay { get; set; }
        /// <summary>Event description.</summary>
        public string? Description { get; set; }
        /// <summary>Event location.</summary>
        public string? Location { get; set; }
        /// <summary>Event color hint.</summary>
        public string? Color { get; set; }
        /// <summary>Owning calendar identifier.</summary>
        public string? CalendarId { get; set; }
        /// <summary>Recurrence rule string.</summary>
        public string? Recurrence { get; set; }
    }

    private sealed class CalendarItemPayload
    {
        /// <summary>Calendar identifier.</summary>
        public string Id { get; set; } = string.Empty;
        /// <summary>Calendar title.</summary>
        public string Title { get; set; } = string.Empty;
        /// <summary>Calendar color in hex.</summary>
        public string? Color { get; set; }
        /// <summary>Whether the calendar is read-only.</summary>
        public bool? ReadOnly { get; set; }
        /// <summary>Whether the calendar is a subscribed calendar.</summary>
        public bool? IsSubscribed { get; set; }
    }

    private sealed class DeletePayload
    {
        /// <summary>Event identifier.</summary>
        public string? Id { get; set; }
    }
}
