using System;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;

namespace InfraBIMPlugin
{
    public class InsertFamilyPayload
    {
        public string FamilyUrl { get; set; } = string.Empty;
        public string FamilyName { get; set; } = string.Empty;
    }

    public class InsertFamilyHandler : IExternalEventHandler
    {
        public InsertFamilyPayload? PendingPayload { get; set; }

        public void Execute(UIApplication app)
        {
            if (PendingPayload == null || string.IsNullOrWhiteSpace(PendingPayload.FamilyUrl))
            {
                return;
            }

            UIDocument uidoc = app.ActiveUIDocument;
            if (uidoc == null)
            {
                TaskDialog.Show("InfraBIM Plugin", "Abre un proyecto de Revit activo antes de insertar objetos BIM.");
                return;
            }

            Document doc = uidoc.Document;
            string familyName = string.IsNullOrWhiteSpace(PendingPayload.FamilyName) 
                ? "Familia_InfraBIM" 
                : PendingPayload.FamilyName;

            try
            {
                string targetUrl = NormalizeDownloadUrl(PendingPayload.FamilyUrl);

                // 1. Descargar el archivo .rfa a la carpeta temporal local
                string tempFolder = Path.Combine(Path.GetTempPath(), "InfraBIM_Downloads");
                Directory.CreateDirectory(tempFolder);

                string cleanName = Regex.Replace(familyName, @"[\\/:*?""<>|]", "_");
                string localFilePath = Path.Combine(tempFolder, $"{cleanName}.rfa");

                Task.Run(async () =>
                {
                    HttpClientHandler handler = new HttpClientHandler
                    {
                        AllowAutoRedirect = true
                    };

                    using (HttpClient client = new HttpClient(handler))
                    {
                        client.Timeout = TimeSpan.FromSeconds(60);
                        client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

                        using (HttpResponseMessage response = await client.GetAsync(targetUrl, HttpCompletionOption.ResponseHeadersRead))
                        {
                            if (!response.IsSuccessStatusCode)
                            {
                                throw new Exception($"El servidor devolvió el código HTTP {(int)response.StatusCode} ({response.ReasonPhrase}). Verifica que la URL del recurso sea pública y válida.");
                            }

                            byte[] fileBytes = await response.Content.ReadAsByteArrayAsync();

                            if (fileBytes.Length < 100)
                            {
                                throw new Exception("El archivo descargado está vacío o no contiene una familia RFA válida.");
                            }

                            await File.WriteAllBytesAsync(localFilePath, fileBytes);
                        }
                    }
                }).Wait();

                // 2. Transacción de Revit para cargar la familia en el proyecto
                using (Transaction tx = new Transaction(doc, $"InfraBIM: Cargar {familyName}"))
                {
                    tx.Start();

                    bool loaded = doc.LoadFamily(localFilePath, out Family family);

                    if (family != null)
                    {
                        // Obtener el primer tipo (FamilySymbol) disponible
                        ElementId symbolId = ElementId.InvalidElementId;
                        foreach (ElementId id in family.GetFamilySymbolIds())
                        {
                            symbolId = id;
                            break;
                        }

                        if (symbolId != ElementId.InvalidElementId)
                        {
                            FamilySymbol symbol = (FamilySymbol)doc.GetElement(symbolId);
                            if (symbol != null && !symbol.IsActive)
                            {
                                symbol.Activate();
                            }

                            tx.Commit();

                            // 3. Activar la colocación interactiva con el cursor en Revit
                            uidoc.PromptForFamilyInstancePlacement(symbol);
                        }
                        else
                        {
                            tx.Commit();
                            TaskDialog.Show("InfraBIM Plugin", $"La familia '{familyName}' fue cargada exitosamente en el navegador de proyectos de Revit.");
                        }
                    }
                    else
                    {
                        tx.RollBack();
                        TaskDialog.Show("InfraBIM Plugin", $"No se pudo cargar la familia '{familyName}'. Es posible que ya exista en el proyecto con el mismo nombre o no sea compatible con esta versión de Revit.");
                    }
                }
            }
            catch (AggregateException aggEx)
            {
                string msg = aggEx.InnerException?.Message ?? aggEx.Message;
                TaskDialog.Show("Error InfraBIM Plugin", $"No se pudo descargar la familia '{familyName}':\n\n{msg}");
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Error InfraBIM Plugin", $"Ocurrió un error al procesar la familia '{familyName}':\n\n{ex.Message}");
            }
            finally
            {
                PendingPayload = null;
            }
        }

        private static string NormalizeDownloadUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return url;

            // Si es un enlace de Google Drive (view, edit, folder, open) -> convertir a descarga directa uc?export=download
            Match match = Regex.Match(url, @"(?:id=|\/d\/)([a-zA-Z0-9_-]+)");
            if (match.Success && (url.Contains("drive.google.com") || url.Contains("docs.google.com")))
            {
                string fileId = match.Groups[1].Value;
                return $"https://drive.google.com/uc?export=download&id={fileId}";
            }

            return url;
        }

        public string GetName()
        {
            return "InfraBIM Family Inserter Handler";
        }
    }
}
