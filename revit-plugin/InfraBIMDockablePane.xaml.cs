using System;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.UI;
using Microsoft.Web.WebView2.Core;

namespace InfraBIMPlugin
{
    public partial class InfraBIMDockablePane : UserControl, IDockablePaneProvider
    {
        private readonly ExternalEvent _externalEvent;
        private readonly InsertFamilyHandler _handler;

        public InfraBIMDockablePane(ExternalEvent externalEvent, InsertFamilyHandler handler)
        {
            InitializeComponent();
            _externalEvent = externalEvent;
            _handler = handler;

            InitializeWebViewAsync();
        }

        public void SetupDockablePane(DockablePaneProviderData data)
        {
            data.FrameworkElement = this;
            data.InitialState = new DockablePaneState
            {
                DockPosition = DockPosition.Right
            };
        }

        public static string CurrentRevitVersion { get; set; } = "2026";
        public static string BaseUrl { get; set; } = "https://infrabimss.web.app/";

        private async void InitializeWebViewAsync()
        {
            try
            {
                await webView.EnsureCoreWebView2Async();

                // Configurar UserAgent limpio de Chrome para evitar bloqueos de Google OAuth por ser WebView
                webView.CoreWebView2.Settings.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
                webView.CoreWebView2.Settings.IsWebMessageEnabled = true;

                webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;

                // Carga la aplicación web desplegada en producción en modo plugin con la versión de Revit
                string targetUrl = $"{BaseUrl.TrimEnd('/')}/?mode=plugin&revitVersion={CurrentRevitVersion}";
                webView.Source = new Uri(targetUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al inicializar el visor web WebView2: {ex.Message}", "InfraBIM Plugin");
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            try
            {
                string targetUri = e.Uri ?? "";

                // Si la nueva ventana corresponde a flujos de autenticación de Google o Firebase,
                // permitimos que WebView2 la maneje internamente (popup emergente nativo).
                if (targetUri.Contains("accounts.google.com") ||
                    targetUri.Contains("firebaseapp.com") ||
                    targetUri.Contains("google.com/o/oauth2") ||
                    targetUri.Contains("googleapis.com"))
                {
                    e.Handled = false;
                    return;
                }

                e.Handled = true;
                if (!string.IsNullOrEmpty(targetUri))
                {
                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = targetUri,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error al abrir navegador externo: {ex.Message}");
            }
        }

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string jsonString = e.WebMessageAsJson;
                using JsonDocument doc = JsonDocument.Parse(jsonString);
                JsonElement root = doc.RootElement;

                if (!root.TryGetProperty("action", out JsonElement actionProp)) return;
                string action = actionProp.GetString() ?? "";

                if (action == "INSERT_FAMILY")
                {
                    string familyUrl = root.GetProperty("familyUrl").GetString() ?? "";
                    string familyName = root.GetProperty("familyName").GetString() ?? "Familia_InfraBIM";

                    if (!string.IsNullOrEmpty(familyUrl))
                    {
                        _handler.PendingPayload = new InsertFamilyPayload
                        {
                            FamilyUrl = familyUrl,
                            FamilyName = familyName
                        };

                        // Activar el evento externo de Revit en el hilo principal
                        _externalEvent.Raise();
                    }
                }
                else if (action == "OPEN_EXTERNAL_URL" || action == "LOGIN_EXTERNAL")
                {
                    string urlToOpen = root.TryGetProperty("url", out JsonElement urlProp) ? urlProp.GetString() ?? "" : "";
                    if (string.IsNullOrEmpty(urlToOpen))
                    {
                        urlToOpen = $"{BaseUrl.TrimEnd('/')}/admin";
                    }

                    System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                    {
                        FileName = urlToOpen,
                        UseShellExecute = true
                    });
                }
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"Error de mensaje WebBridge: {ex.Message}");
            }
        }

        private void OnReloadClick(object sender, RoutedEventArgs e)
        {
            webView?.Reload();
        }
    }
}
