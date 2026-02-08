using System;
using System.Linq;
using System.Speech.Recognition;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace TenasSpeech;

internal sealed class Program
{
    /// <summary>Signal to keep the helper process alive.</summary>
    private static readonly ManualResetEvent ShutdownSignal = new(false);

    /// <summary>Active speech recognition engine instance.</summary>
    private static SpeechRecognitionEngine? Engine;

    /// <summary>Language requested by the caller.</summary>
    private static string? RequestedLanguage;

    /// <summary>Last emitted partial transcription.</summary>
    private static string? LastPartial;

    /// <summary>Serializer options for JSON payloads.</summary>
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    /// <summary>Entry point for the Windows speech helper.</summary>
    [STAThread]
    public static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        RequestedLanguage = ParseLanguageArg(args);

        try
        {
            Engine = CreateEngine(RequestedLanguage);
            if (Engine == null)
            {
                EmitError("Speech engine unavailable", "No speech recognizers installed.");
                return 1;
            }

            Engine.SpeechHypothesized += OnSpeechHypothesized;
            Engine.SpeechRecognized += OnSpeechRecognized;
            Engine.RecognizeCompleted += OnRecognizeCompleted;
            Engine.SpeechRecognitionRejected += OnSpeechRecognitionRejected;

            Engine.LoadGrammar(new DictationGrammar());
            Engine.SetInputToDefaultAudioDevice();

            // 持续识别，直到收到退出信号。
            Engine.RecognizeAsync(RecognizeMode.Multiple);

            Console.CancelKeyPress += OnCancelKeyPress;
            AppDomain.CurrentDomain.ProcessExit += OnProcessExit;

            ShutdownSignal.WaitOne();
            return 0;
        }
        catch (Exception ex)
        {
            EmitError("Speech engine init failed", ex.Message);
            return 1;
        }
        finally
        {
            ShutdownEngine();
        }
    }

    /// <summary>Parse the language argument from CLI inputs.</summary>
    private static string? ParseLanguageArg(string[] args)
    {
        for (var i = 0; i < args.Length; i += 1)
        {
            if (!string.Equals(args[i], "--lang", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (i + 1 >= args.Length)
            {
                return null;
            }

            var value = args[i + 1]?.Trim();
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
    }

    /// <summary>Create a speech recognition engine for the requested language.</summary>
    private static SpeechRecognitionEngine? CreateEngine(string? language)
    {
        var recognizers = SpeechRecognitionEngine.InstalledRecognizers();
        if (recognizers == null || recognizers.Count == 0)
        {
            return null;
        }

        RecognizerInfo? selected = null;
        if (!string.IsNullOrWhiteSpace(language))
        {
            selected = recognizers.FirstOrDefault((item) =>
                string.Equals(item.Culture.Name, language, StringComparison.OrdinalIgnoreCase));

            if (selected == null)
            {
                var fallback = language.Split('-')[0];
                selected = recognizers.FirstOrDefault((item) =>
                    string.Equals(item.Culture.TwoLetterISOLanguageName, fallback, StringComparison.OrdinalIgnoreCase));
            }
        }

        // 未匹配到语言时退回默认识别器。
        selected ??= recognizers[0];
        RequestedLanguage = selected.Culture.Name;
        return new SpeechRecognitionEngine(selected);
    }

    /// <summary>Handle partial recognition updates.</summary>
    private static void OnSpeechHypothesized(object? sender, SpeechHypothesizedEventArgs args)
    {
        var text = args.Result?.Text ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text)) return;
        if (string.Equals(LastPartial, text, StringComparison.Ordinal)) return;

        LastPartial = text;
        EmitResult("partial", text);
    }

    /// <summary>Handle final recognition results.</summary>
    private static void OnSpeechRecognized(object? sender, SpeechRecognizedEventArgs args)
    {
        var text = args.Result?.Text ?? string.Empty;
        if (string.IsNullOrWhiteSpace(text)) return;

        LastPartial = null;
        EmitResult("final", text);
    }

    /// <summary>Handle rejected recognition results.</summary>
    private static void OnSpeechRecognitionRejected(object? sender, SpeechRecognitionRejectedEventArgs args)
    {
        if (args.Result == null) return;
        if (string.IsNullOrWhiteSpace(args.Result.Text)) return;

        EmitResult("partial", args.Result.Text);
    }

    /// <summary>Handle recognition completion.</summary>
    private static void OnRecognizeCompleted(object? sender, RecognizeCompletedEventArgs args)
    {
        ShutdownSignal.Set();
    }

    /// <summary>Handle Ctrl+C interruption.</summary>
    private static void OnCancelKeyPress(object? sender, ConsoleCancelEventArgs args)
    {
        args.Cancel = true;
        ShutdownSignal.Set();
    }

    /// <summary>Handle process exit cleanup.</summary>
    private static void OnProcessExit(object? sender, EventArgs args)
    {
        ShutdownSignal.Set();
    }

    /// <summary>Stop and dispose the speech recognition engine.</summary>
    private static void ShutdownEngine()
    {
        if (Engine == null) return;

        try
        {
            Engine.RecognizeAsyncCancel();
            Engine.RecognizeAsyncStop();
        }
        catch
        {
            // ignore
        }

        try
        {
            Engine.Dispose();
        }
        catch
        {
            // ignore
        }
    }

    /// <summary>Emit a recognition result line.</summary>
    private static void EmitResult(string type, string text)
    {
        var payload = new SpeechResult
        {
            Type = type,
            Text = text,
            Lang = RequestedLanguage,
        };

        WriteJsonLine(payload);
    }

    /// <summary>Emit an error line.</summary>
    private static void EmitError(string message, string? detail)
    {
        var payload = new SpeechError
        {
            Type = "error",
            Message = message,
            Detail = detail,
        };

        WriteJsonLine(payload);
    }

    /// <summary>Write a JSON payload to stdout.</summary>
    private static void WriteJsonLine<T>(T payload)
    {
        var json = JsonSerializer.Serialize(payload, SerializerOptions);
        Console.WriteLine(json);
        Console.Out.Flush();
    }

    /// <summary>Speech recognition result payload.</summary>
    private sealed class SpeechResult
    {
        /// <summary>Payload type identifier.</summary>
        public string Type { get; set; } = string.Empty;

        /// <summary>Recognized text.</summary>
        public string Text { get; set; } = string.Empty;

        /// <summary>Requested language.</summary>
        public string? Lang { get; set; }
    }

    /// <summary>Speech recognition error payload.</summary>
    private sealed class SpeechError
    {
        /// <summary>Payload type identifier.</summary>
        public string Type { get; set; } = string.Empty;

        /// <summary>User-facing error message.</summary>
        public string Message { get; set; } = string.Empty;

        /// <summary>Optional error detail.</summary>
        public string? Detail { get; set; }
    }
}
