using System;
using System.Reflection;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;

namespace InfraBIMPlugin
{
    public class AppMain : IExternalApplication
    {
        public static DockablePaneId PaneId => new DockablePaneId(new Guid("9A8B7C6D-5E4F-3210-FEDC-BA0987654321"));

        public Result OnStartup(UIControlledApplication application)
        {
            try
            {
                // 1. Crear el manejador de eventos externos para Revit API
                InsertFamilyHandler handler = new InsertFamilyHandler();
                ExternalEvent externalEvent = ExternalEvent.Create(handler);

                // 2. Registrar el panel acoplable (Dockable Pane)
                InfraBIMDockablePane paneControl = new InfraBIMDockablePane(externalEvent, handler);
                application.RegisterDockablePane(PaneId, "InfraBIM Hub", paneControl);

                // 3. Crear la pestaña propia "InfraBIM" en la cinta de opciones (Ribbon) de Revit
                string tabName = "InfraBIM";
                try
                {
                    application.CreateRibbonTab(tabName);
                }
                catch
                {
                    // Si la pestaña ya existía en Revit, continua
                }

                RibbonPanel? ribbonPanel = null;
                try
                {
                    foreach (RibbonPanel panel in application.GetRibbonPanels(tabName))
                    {
                        if (panel.Name == "Herramientas BIM")
                        {
                            ribbonPanel = panel;
                            break;
                        }
                    }
                }
                catch
                {
                }

                if (ribbonPanel == null)
                {
                    ribbonPanel = application.CreateRibbonPanel(tabName, "Herramientas BIM");
                }

                // Botón grande para abrir el panel lateral de InfraBIM Hub
                PushButtonData showPanelBtn = new PushButtonData(
                    "ShowInfraBIMPanel",
                    "InfraBIM\nHub",
                    Assembly.GetExecutingAssembly().Location,
                    typeof(ShowPanelCommand).FullName
                );

                PushButton? pushButton = ribbonPanel.AddItem(showPanelBtn) as PushButton;
                if (pushButton != null)
                {
                    pushButton.ToolTip = "Abre el catálogo interactivo de familias BIM y herramientas de InfraBIM Hub.";
                    pushButton.LongDescription = "Accede a miles de familias BIM clasificadas por categoría y compatibles con tu versión de Revit.";
                    pushButton.LargeImage = CreateRibbonIcon();
                }

                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Error de Inicio InfraBIM", ex.Message);
                return Result.Failed;
            }
        }

        private static BitmapSource CreateRibbonIcon()
        {
            int width = 32;
            int height = 32;
            PixelFormat format = PixelFormats.Bgra32;
            int stride = width * 4;
            byte[] pixels = new byte[height * stride];

            // Generar icono azul/morado de InfraBIM de 32x32 píxeles
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    int index = (y * stride) + (x * 4);
                    bool isBorder = x == 4 || x == 27 || y == 4 || y == 27;
                    bool isInner = x >= 5 && x <= 26 && y >= 5 && y <= 26;

                    if (isInner)
                    {
                        pixels[index] = 241;     // B
                        pixels[index + 1] = 102; // G
                        pixels[index + 2] = 99;  // R (#6366f1)
                        pixels[index + 3] = 255; // Alpha
                    }
                    else if (isBorder)
                    {
                        pixels[index] = 220;     // B
                        pixels[index + 1] = 70;  // G
                        pixels[index + 2] = 60;  // R
                        pixels[index + 3] = 255; // Alpha
                    }
                    else
                    {
                        pixels[index + 3] = 0;   // Transparente
                    }
                }
            }
            return BitmapSource.Create(width, height, 96, 96, format, null, pixels, stride);
        }

        public Result OnShutdown(UIControlledApplication application)
        {
            return Result.Succeeded;
        }
    }

    [Autodesk.Revit.Attributes.Transaction(Autodesk.Revit.Attributes.TransactionMode.Manual)]
    public class ShowPanelCommand : IExternalCommand
    {
        public Result Execute(ExternalCommandData commandData, ref string message, Autodesk.Revit.DB.ElementSet elements)
        {
            try
            {
                if (commandData?.Application?.Application != null)
                {
                    InfraBIMDockablePane.CurrentRevitVersion = commandData.Application.Application.VersionNumber;
                }

                DockablePane pane = commandData.Application.GetDockablePane(AppMain.PaneId);
                if (pane != null && !pane.IsShown())
                {
                    pane.Show();
                }
                return Result.Succeeded;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return Result.Failed;
            }
        }
    }
}
